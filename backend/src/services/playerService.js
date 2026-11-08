import mongoose from "mongoose";
import Wallet from "../models/Wallet.js";
import { levels } from "../../../shared/levelData.js";
import {
  createInitialGameState,
  replayGameActions,
} from "../../../shared/gameLogic.js";
import { BOOSTER_ACTIONS, BOOSTER_IDS } from "../../../shared/boosterCatalog.js";
import { getWorldForLevel, isWorldUnlocked } from "../../../shared/worldConfig.js";
import { AuthError } from "./authService.js";

const serializeProgress = (progress) => ({
  levelNumber: progress.levelNumber,
  status: progress.status,
  bestScore: progress.bestScore,
  bestMoves: progress.bestMoves ?? null,
  stars: progress.stars,
  completedAt: progress.completedAt,
});

function serializeSession(session) {
  return {
    id: String(session._id),
    levelNumber: session.levelNumber,
    status: session.status,
    score: session.score,
    moves: session.moves,
    applesCollected: session.applesCollected,
    stars: session.stars,
    actions: session.actions || [],
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  };
}

function toUserId(user) {
  return String(user._id);
}

function calculateStars(moves, parMoves) {
  if (moves <= parMoves) return 3;
  if (moves <= Math.ceil(parMoves * 1.5)) return 2;
  return 1;
}

async function ensureLevelProgress(LevelProgress, userId, levelNumber) {
  let progress = await LevelProgress.findOne({ user: userId, levelNumber });
  if (!progress) {
    progress = await LevelProgress.create({
      user: userId,
      levelNumber,
      status: "unlocked",
    });
  }
  return progress;
}

async function saveCompletedLevel(LevelProgress, userId, levelNumber, game, levelCount) {
  let progress = await LevelProgress.findOne({ user: userId, levelNumber });
  if (!progress) {
    progress = new LevelProgress({
      user: userId,
      levelNumber,
      status: "completed",
    });
  }
  progress.status = "completed";
  progress.bestScore = Math.max(progress.bestScore || 0, game.score);
  progress.bestMoves = Math.min(progress.bestMoves ?? Infinity, game.moves);
  progress.stars = Math.max(progress.stars || 0, game.stars);
  progress.completedAt ||= new Date();
  await progress.save();

  if (levelNumber < levelCount) {
    const nextLevel = await ensureLevelProgress(LevelProgress, userId, levelNumber + 1);
    if (nextLevel.status !== "completed") {
      nextLevel.status = "unlocked";
      await nextLevel.save();
    }
  }
  return progress;
}

export function createPlayerService({
  LevelProgress,
  GameSession,
  WalletModel = Wallet,
  User,
  achievementService,
  levels: levelDefinitions = levels,
  startSession = () => mongoose.startSession(),
}) {
  async function getProgress(user) {
    const userId = toUserId(user);
    const [progressRecords, activeSession] = await Promise.all([
      LevelProgress.find({ user: userId }).sort({ levelNumber: 1 }),
      GameSession.findOne({ user: userId, status: "in_progress" })
        .sort({ startedAt: -1 }),
    ]);
    const completedLevels = progressRecords
      .filter((record) => record.status === "completed")
      .map((record) => record.levelNumber);
    return {
      unlockedLevel: Math.min(
        levelDefinitions.length,
        Math.max(1, ...completedLevels.map((number) => number + 1)),
      ),
      levels: progressRecords.map(serializeProgress),
      activeSession: activeSession ? serializeSession(activeSession) : null,
    };
  }

  async function finalizeCompletedSession(completedSession, user) {
    if (completedSession.status !== "completed") return;

    const level = levelDefinitions[completedSession.levelNumber - 1];
    const game = replayGameActions(
      level.board,
      completedSession.actions || [],
      level.moveLimit,
      { strict: true },
    );
    if (game.status !== "won") return;

    await saveCompletedLevel(
      LevelProgress,
      toUserId(user),
      completedSession.levelNumber,
      { ...game, stars: completedSession.stars },
      levelDefinitions.length,
    );
    await achievementService?.updateProgress(user);
  }

  return {
    getProgress,

    async startSession(user, levelNumber) {
      const userId = toUserId(user);
      const progressRecords = await LevelProgress.find({ user: userId });
      const highestCompleted = Math.max(
        0,
        ...progressRecords
          .filter((record) => record.status === "completed")
          .map((record) => record.levelNumber),
      );
      const unlockedLevel = Math.min(levelDefinitions.length, highestCompleted + 1);
      const completedLevels = new Set(
        progressRecords
          .filter((record) => record.status === "completed")
          .map((record) => record.levelNumber),
      );
      const world = getWorldForLevel(levelNumber);
      if (!isWorldUnlocked(world, completedLevels)) {
        throw new AuthError(403, "That world is still locked.");
      }
      if (levelNumber > unlockedLevel) {
        throw new AuthError(403, "That level is still locked.");
      }

      await GameSession.updateMany(
        { user: userId, status: "in_progress" },
        { $set: { status: "abandoned", endedAt: new Date() } },
      );
      await ensureLevelProgress(LevelProgress, userId, levelNumber);
      const session = await GameSession.create({
        user: userId,
        levelNumber,
        status: "in_progress",
        actions: [],
      });
      return { session: serializeSession(session) };
    },

    async saveSessionActions(user, sessionId, actions) {
      const userId = toUserId(user);
      let session = await GameSession.findOne({ _id: sessionId, user: userId });
      if (!session) {
        throw new AuthError(404, "Game session was not found.");
      }
      const savedActions = session.actions || [];
      const isPrefix = (prefix, sequence) =>
        prefix.length <= sequence.length &&
        prefix.every((action, index) => action === sequence[index]);
      if (isPrefix(actions, savedActions)) {
        await finalizeCompletedSession(session, user);
        return {
          session: serializeSession(session),
          progress: await getProgress(user),
        };
      }
      if (session.status !== "in_progress") {
        throw new AuthError(409, "This game session is already finished.");
      }
      if (!isPrefix(savedActions, actions)) {
        throw new AuthError(409, "Saved moves cannot be replaced with a different attempt.");
      }
      if (actions.length > 1000) {
        throw new AuthError(400, "A game session cannot contain more than 1000 actions.");
      }

      const level = levelDefinitions[session.levelNumber - 1];
      let game;
      try {
        game = replayGameActions(level.board, actions, level.moveLimit, { strict: true });
      } catch (error) {
        throw new AuthError(400, error.message);
      }

      const completed = game.status === "won";
      const failed = game.status === "lost";
      const sessionUpdate = {
        actions,
        moves: game.moves,
        score: game.score,
        applesCollected: level.board.apples.length - game.apples.length,
        status: completed ? "completed" : failed ? "failed" : "in_progress",
        stars: completed ? calculateStars(game.moves, level.parMoves) : session.stars,
        endedAt: completed || failed ? new Date() : null,
      };
      let updatedSession;
      const appendedBoosters = actions
        .slice(savedActions.length)
        .filter((action) => BOOSTER_ACTIONS.includes(action));
      if (appendedBoosters.length > 0) {
        const transactionSession = await startSession();
        try {
          await transactionSession.withTransaction(async () => {
            let query = GameSession.findOne({
              _id: sessionId,
              user: userId,
              status: "in_progress",
            });
            if (typeof query.session === "function") query = query.session(transactionSession);
            const latestSession = await query;
            if (!latestSession) {
              const latest = await GameSession.findOne({ _id: sessionId, user: userId });
              if (!latest) throw new AuthError(404, "Game session was not found.");
              if (isPrefix(actions, latest.actions || [])) {
                await finalizeCompletedSession(latest, user);
                updatedSession = latest;
                return;
              }
              throw new AuthError(409, "This game session is already finished.");
            }

            const latestActions = latestSession.actions || [];
            if (isPrefix(actions, latestActions)) {
              updatedSession = latestSession;
              return;
            }
            if (!isPrefix(latestActions, actions)) {
              throw new AuthError(409, "Saved moves cannot be replaced with a different attempt.");
            }

            const addedBoosters = actions
              .slice(latestActions.length)
              .filter((action) => BOOSTER_ACTIONS.includes(action));
            const useCounts = new Map();
            for (const action of addedBoosters) {
              const boosterId = action.slice("booster:".length);
              useCounts.set(boosterId, (useCounts.get(boosterId) || 0) + 1);
            }
            for (const [boosterId, count] of useCounts) {
              if (!BOOSTER_IDS.includes(boosterId)) {
                throw new AuthError(400, "That booster is not available.");
              }
              const inventoryField = `boosterInventory.${boosterId}`;
              const wallet = await WalletModel.findOneAndUpdate(
                {
                  user: userId,
                  [inventoryField]: { $gte: count },
                },
                { $inc: { [inventoryField]: -count } },
                { new: true, runValidators: true, session: transactionSession },
              );
              if (!wallet) {
                throw new AuthError(409, `No ${boosterId.replace("_", " ")} booster is available.`);
              }
            }

            updatedSession = await GameSession.findOneAndUpdate(
              {
                _id: sessionId,
                user: userId,
                status: "in_progress",
                actions: latestActions,
              },
              { $set: sessionUpdate },
              {
                new: true,
                runValidators: true,
                session: transactionSession,
              },
            );
            if (!updatedSession) {
              throw new AuthError(409, "The game session changed while saving. Please retry.");
            }
          });
        } catch (error) {
          if (error?.code === 20 || error?.codeName === "IllegalOperation") {
            throw new AuthError(
              503,
              "Booster use requires MongoDB transactions. Use a replica set or MongoDB Atlas.",
            );
          }
          throw error;
        } finally {
          await transactionSession.endSession();
        }
        game = replayGameActions(
          level.board,
          updatedSession.actions || actions,
          level.moveLimit,
          { strict: true },
        );
      } else {
        let expectedActions = savedActions;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          updatedSession = await GameSession.findOneAndUpdate(
            {
              _id: sessionId,
              user: user._id,
              status: "in_progress",
              actions: expectedActions,
            },
            { $set: sessionUpdate },
            { new: true, runValidators: true },
          );
          if (updatedSession) break;

          session = await GameSession.findOne({ _id: sessionId, user: userId });
          if (!session) throw new AuthError(404, "Game session was not found.");
          const latestActions = session.actions || [];
          if (isPrefix(actions, latestActions)) {
            await finalizeCompletedSession(session, user);
            return {
              session: serializeSession(session),
              progress: await getProgress(user),
            };
          }
          if (session.status !== "in_progress" || !isPrefix(latestActions, actions)) {
            throw new AuthError(409, "Saved moves cannot be replaced with a different attempt.");
          }
          expectedActions = latestActions;
        }
        if (!updatedSession) {
          throw new AuthError(409, "The game session changed while saving. Please retry.");
        }
      }
      session = updatedSession;
      if (session.status === "completed") {
        await finalizeCompletedSession(session, user);
      } else if (failed) {
        await achievementService?.updateProgress(user);
      }
      return {
        session: serializeSession(session),
        progress: await getProgress(user),
      };
    },

    async getDashboard(user) {
      const userId = toUserId(user);
      const [progressRecords, recentSessions, activeSession, moveTotals] = await Promise.all([
        LevelProgress.find({ user: userId }).sort({ levelNumber: 1 }),
        GameSession.find({ user: userId }).sort({ startedAt: -1 }).limit(5),
        GameSession.findOne({ user: userId, status: "in_progress" })
          .sort({ startedAt: -1 }),
        GameSession.aggregate([
          { $match: { user: user._id } },
          { $group: { _id: null, totalMoves: { $sum: "$moves" } } },
        ]),
      ]);
      const completed = progressRecords.filter((record) => record.status === "completed");
      const completedLevels = completed.length;
      const unlockedLevel = Math.min(
        levelDefinitions.length,
        Math.max(1, ...completed.map((record) => record.levelNumber + 1)),
      );
      return {
        stats: {
          completedLevels,
          totalLevels: levelDefinitions.length,
          totalScore: completed.reduce((total, record) => total + record.bestScore, 0),
          totalMoves: moveTotals[0]?.totalMoves || 0,
          unlockedLevel,
        },
        resume: activeSession
          ? {
              levelNumber: activeSession.levelNumber,
              sessionId: String(activeSession._id),
              actions: activeSession.actions || [],
            }
          : {
              levelNumber: unlockedLevel,
              sessionId: null,
              actions: [],
            },
        recentActivity: recentSessions.map((session) => ({
          id: String(session._id),
          levelNumber: session.levelNumber,
          levelName: levelDefinitions[session.levelNumber - 1].name,
          status: session.status,
          stars: session.stars,
          score: session.score,
          moves: session.moves,
          date: session.endedAt || session.startedAt,
        })),
      };
    },

    async getHistory(user) {
      const sessions = await GameSession.find({ user: toUserId(user) })
        .sort({ startedAt: -1 })
        .limit(100);
      return sessions.map((session) => ({
        id: String(session._id),
        levelNumber: session.levelNumber,
        levelName: levelDefinitions[session.levelNumber - 1].name,
        status: session.status,
        stars: session.stars,
        score: session.score,
        moves: session.moves,
        date: session.endedAt || session.startedAt,
      }));
    },

    async getLeaderboard() {
      const rows = await LevelProgress.aggregate([
        { $match: { status: "completed" } },
        {
          $group: {
            _id: "$user",
            score: { $sum: "$bestScore" },
            completedLevels: { $sum: 1 },
          },
        },
        { $sort: { score: -1, _id: 1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: User.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "player",
          },
        },
        { $unwind: "$player" },
        {
          $project: {
            id: { $toString: "$_id" },
            name: "$player.displayName",
            avatar: "$player.avatar",
            score: 1,
            completedLevels: 1,
          },
        },
      ]);
      return rows.map((row, index) => ({ ...row, rank: index + 1 }));
    },
  };
}

import { levels } from "../../../shared/levelData.js";
import {
  createInitialGameState,
  moveGame,
} from "../../../shared/gameLogic.js";
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

async function saveCompletedLevel(LevelProgress, userId, levelNumber, game) {
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

  if (levelNumber < levels.length) {
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
  User,
  achievementService,
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
        levels.length,
        Math.max(1, ...completedLevels.map((number) => number + 1)),
      ),
      levels: progressRecords.map(serializeProgress),
      activeSession: activeSession ? serializeSession(activeSession) : null,
    };
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
      const unlockedLevel = Math.min(levels.length, highestCompleted + 1);
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

      const level = levels[session.levelNumber - 1];
      let game = createInitialGameState(level.board);
      for (const [index, action] of actions.entries()) {
        if (!["ready", "playing"].includes(game.status)) {
          throw new AuthError(400, "Actions cannot continue after a game has ended.");
        }
        const nextGame = moveGame(game, action, level.board);
        if (nextGame.moves !== game.moves + 1) {
          throw new AuthError(400, "Every action must make one valid grid move.");
        }
        game = nextGame;
        if (!["ready", "playing"].includes(game.status) && index !== actions.length - 1) {
          throw new AuthError(400, "Actions cannot continue after a game has ended.");
        }
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
      session = updatedSession;
      if (game.status === "won") {
        await saveCompletedLevel(LevelProgress, userId, session.levelNumber, {
          ...game,
          stars: session.stars,
        });
      }
      if (completed || failed) {
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
        levels.length,
        Math.max(1, ...completed.map((record) => record.levelNumber + 1)),
      );
      return {
        stats: {
          completedLevels,
          totalLevels: levels.length,
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
          levelName: levels[session.levelNumber - 1].name,
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
        levelName: levels[session.levelNumber - 1].name,
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

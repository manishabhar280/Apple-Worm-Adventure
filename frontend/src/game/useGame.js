import { useCallback, useRef, useState } from "react";
import {
  applyGameAction,
  createInitialGameState,
  replayGameActionsWithHistory,
  togglePause,
} from "./gameLogic.js";

export function useGame(initialBoard, initialMoveLimit) {
  const boardRef = useRef(initialBoard);
  const moveLimitRef = useRef(initialMoveLimit);
  const [game, setGame] = useState(() =>
    createInitialGameState(initialBoard, initialMoveLimit),
  );
  const gameRef = useRef(game);
  const [actions, setActions] = useState([]);
  const actionsRef = useRef(actions);
  const undoHistoryRef = useRef([]);

  const updateGame = useCallback((nextGame) => {
    gameRef.current = nextGame;
    setGame(nextGame);
  }, []);

  const move = useCallback(
    (direction) => {
      const currentGame = gameRef.current;
      const nextGame = applyGameAction(
        currentGame,
        direction,
        boardRef.current,
        moveLimitRef.current,
        undoHistoryRef.current,
      );
      if (nextGame.moves > currentGame.moves) {
        const nextActions = [...actionsRef.current, direction];
        actionsRef.current = nextActions;
        setActions(nextActions);
        updateGame(nextGame);
        return {
          accepted: true,
          appleCollected: nextGame.apples.length < currentGame.apples.length,
          goldenAppleCollected:
            (nextGame.collectedGoldenAppleIds?.length ?? 0) >
            (currentGame.collectedGoldenAppleIds?.length ?? 0),
          treasureCollected:
            (nextGame.collectedTreasureIds?.length ?? 0) >
            (currentGame.collectedTreasureIds?.length ?? 0),
          completed: nextGame.status === "won",
        };
      }
      updateGame(nextGame);
      return {
        accepted: false,
        appleCollected: false,
        goldenAppleCollected: false,
        treasureCollected: false,
        completed: false,
      };
    },
    [updateGame],
  );

  const restart = useCallback(() => {
    actionsRef.current = [];
    undoHistoryRef.current = [];
    setActions([]);
    updateGame(createInitialGameState(boardRef.current, moveLimitRef.current));
  }, [updateGame]);

  const loadLevel = useCallback(
    (board, moveLimit) => {
      boardRef.current = board;
      moveLimitRef.current = moveLimit;
      undoHistoryRef.current = [];
      actionsRef.current = [];
      setActions([]);
      updateGame(createInitialGameState(board, moveLimit));
    },
    [updateGame],
  );

  const loadProgress = useCallback(
    (board, savedActions, moveLimit) => {
      boardRef.current = board;
      moveLimitRef.current = moveLimit;
      actionsRef.current = savedActions;
      setActions(savedActions);
      const replay = replayGameActionsWithHistory(board, savedActions, moveLimit);
      undoHistoryRef.current = replay.history;
      updateGame(replay.state);
    },
    [updateGame],
  );

  const activateBooster = useCallback((boosterId) => {
    const action = `booster:${boosterId}`;
    const nextGame = applyGameAction(
      gameRef.current,
      action,
      boardRef.current,
      moveLimitRef.current,
      undoHistoryRef.current,
    );
    const nextActions = [...actionsRef.current, action];
    actionsRef.current = nextActions;
    setActions(nextActions);
    updateGame(nextGame);
    return nextActions;
  }, [updateGame]);

  const pause = useCallback(() => {
    updateGame(togglePause(gameRef.current));
  }, [updateGame]);

  return {
    game,
    actions,
    move,
    restart,
    pause,
    loadLevel,
    loadProgress,
    activateBooster,
  };
}

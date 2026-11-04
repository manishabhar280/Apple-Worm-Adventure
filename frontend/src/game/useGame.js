import { useCallback, useRef, useState } from "react";
import {
  createInitialGameState,
  moveGame,
  replayGameActions,
  togglePause,
} from "./gameLogic.js";

export function useGame(initialBoard) {
  const boardRef = useRef(initialBoard);
  const [game, setGame] = useState(() => createInitialGameState(initialBoard));
  const gameRef = useRef(game);
  const [actions, setActions] = useState([]);
  const actionsRef = useRef(actions);

  const updateGame = useCallback((nextGame) => {
    gameRef.current = nextGame;
    setGame(nextGame);
  }, []);

  const move = useCallback(
    (direction) => {
      const currentGame = gameRef.current;
      const nextGame = moveGame(currentGame, direction, boardRef.current);
      if (nextGame.moves > currentGame.moves) {
        const nextActions = [...actionsRef.current, direction];
        actionsRef.current = nextActions;
        setActions(nextActions);
      }
      updateGame(nextGame);
    },
    [updateGame],
  );

  const restart = useCallback(() => {
    actionsRef.current = [];
    setActions([]);
    updateGame(createInitialGameState(boardRef.current));
  }, [updateGame]);

  const loadLevel = useCallback(
    (board) => {
      boardRef.current = board;
      actionsRef.current = [];
      setActions([]);
      updateGame(createInitialGameState(board));
    },
    [updateGame],
  );

  const loadProgress = useCallback(
    (board, savedActions) => {
      boardRef.current = board;
      actionsRef.current = savedActions;
      setActions(savedActions);
      updateGame(replayGameActions(board, savedActions));
    },
    [updateGame],
  );

  const pause = useCallback(() => {
    updateGame(togglePause(gameRef.current));
  }, [updateGame]);

  return { game, actions, move, restart, pause, loadLevel, loadProgress };
}

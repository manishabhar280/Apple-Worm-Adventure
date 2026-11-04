import React, { useEffect, useRef, useState } from "react";
import GameBoard from "../components/GameBoard.jsx";
import GameHeader from "../components/GameHeader.jsx";
import LevelPanel from "../components/LevelPanel.jsx";
import LevelSelector from "../components/LevelSelector.jsx";
import { levels } from "../data/levelData.js";
import { requestGameHint } from "../game/walletActions.js";

const keyboardDirections = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

const statusMessages = {
  ready: "Choose a direction to begin.",
  playing: "Collect every apple, then reach the portal.",
  paused: "Resume when you’re ready.",
  won: "You reached the portal.",
  lost: "You hit an obstacle or yourself. Restart to try again.",
};

function GameScreen({
  active,
  level,
  game,
  unlockedLevel,
  records,
  onMove,
  onRestart,
  onPause,
  onSelectLevel,
  onPurchaseHint,
  rewardHint,
  onRewardHintConsumed,
  navigate,
}) {
  const keyboardMoveLocked = useRef(false);
  const [hintMessage, setHintMessage] = useState("");
  const [hintError, setHintError] = useState("");
  const [hintPending, setHintPending] = useState(false);
  const hintPendingRef = useRef(false);
  const hintRequestId = useRef(null);
  const isFinished = game.status === "won" || game.status === "lost";

  useEffect(() => {
    if (!rewardHint) return;
    const destination = game.apples.length > 0 ? "an apple" : "the portal";
    setHintError("");
    setHintMessage(`Verified rewarded hint: try moving ${rewardHint.direction} toward ${destination}.`);
    onRewardHintConsumed?.(rewardHint.id);
  }, [game.apples.length, onRewardHintConsumed, rewardHint]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    function handleKeyDown(event) {
      const direction =
        keyboardDirections[event.key] ??
        keyboardDirections[event.key.toLowerCase()];
      if (!direction) {
        return;
      }

      event.preventDefault();
      const isTextEntry =
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable='true']");
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        keyboardMoveLocked.current ||
        isTextEntry
      ) {
        return;
      }

      keyboardMoveLocked.current = true;
      window.requestAnimationFrame(() => {
        keyboardMoveLocked.current = false;
      });
      resetHint();
      onMove(direction);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onMove]);

  async function showHint() {
    if (hintPendingRef.current) return;
    setHintError("");
    setHintMessage("");
    hintPendingRef.current = true;
    setHintPending(true);
    try {
      if (onPurchaseHint && !hintRequestId.current) {
        hintRequestId.current = globalThis.crypto.randomUUID();
      }
      const { direction, purchase } = await requestGameHint({
        game,
        board: level.board,
        requestId: hintRequestId.current,
        onPurchaseHint,
      });
      if (!direction) {
        setHintMessage("No safe hint is available from this position.");
        return;
      }
      const destination = game.apples.length > 0 ? "an apple" : "the portal";
      setHintMessage(purchase
        ? `Hint purchased for ${purchase.transaction?.amount || 5} coins (${purchase.balance} remaining). Try moving ${direction} toward ${destination}.`
        : `Try moving ${direction} toward ${destination}.`);
      hintRequestId.current = null;
    } catch (error) {
      setHintError(error.message);
    } finally {
      hintPendingRef.current = false;
      setHintPending(false);
    }
  }

  function resetHint() {
    setHintMessage("");
    setHintError("");
  }

  function selectLevel(nextLevel) {
    resetHint();
    onSelectLevel(nextLevel);
  }

  function clearHintOnMove(direction) {
    resetHint();
    onMove(direction);
  }

  const hintLabel = onPurchaseHint
    ? hintPending
      ? "Buying hint..."
      : `${hintRequestId.current ? "Retry hint" : "Hint"} · 5 coins`
    : "Hint";

  return (
    <main className="game-page">
      <div className="game-shell">
        <GameHeader level={level.number} score={game.score} moves={game.moves} />
        <div className="game-layout">
          <section className="board-section" aria-label="Puzzle board">
            <div className="section-heading">
              <div>
                <p className="eyebrow">The orchard</p>
                <h2>{level.name}</h2>
              </div>
              <span className="level-chip">
                LEVEL {String(level.number).padStart(2, "0")}
              </span>
            </div>

            <div
              className={`game-status game-status--${game.status}`}
              role="status"
              aria-live="polite"
            >
              <span className="game-status-label">{game.status}</span>
              <span>{hintMessage || statusMessages[game.status]}</span>
            </div>
            {hintError && <p className="form-error" role="alert">{hintError}</p>}

            <GameBoard
              level={level}
              game={game}
              onMove={clearHintOnMove}
            />

            <div className="game-controls" aria-label="Game controls">
              <button className="control-button control-button--quiet" type="button" onClick={onRestart}>
                <span aria-hidden="true">↻</span>
                Restart Level
              </button>
              <button
                className="control-button control-button--primary"
                type="button"
                onClick={onPause}
                disabled={isFinished}
              >
                <span aria-hidden="true">{game.status === "paused" ? "▶" : "Ⅱ"}</span>
                {game.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                className="control-button control-button--quiet"
                type="button"
                onClick={showHint}
                disabled={game.status === "paused" || isFinished || hintPending}
              >
                <span aria-hidden="true">✦</span>
                {hintLabel}
              </button>
              {game.status === "won" && level.number < 50 && (
                <button
                  className="control-button control-button--primary"
                  type="button"
                  onClick={() => selectLevel(levels[level.number])}
                >
                  Next Level <span aria-hidden="true">→</span>
                </button>
              )}
              <button className="game-levels-link" type="button" onClick={() => navigate("/levels")}>
                All levels
              </button>
            </div>
            {onPurchaseHint && <p className="control-note">Hints cost 5 coins; failed purchases do not reveal a hint.</p>}
            <p className="control-note">Arrow keys, WASD, or swipe to move</p>
          </section>

          <div className="game-sidebar">
            <LevelPanel
              level={level}
              totalLevels={50}
              unlockedLevel={unlockedLevel}
              record={records[level.number]}
            />
            <LevelSelector
              levels={levels}
              unlockedLevel={unlockedLevel}
              selectedLevel={level.number}
              records={records}
              onSelect={selectLevel}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export default GameScreen;

import React, { useEffect, useRef, useState } from "react";
import GameBoard from "../components/GameBoard.jsx";
import GameHeader from "../components/GameHeader.jsx";
import LevelPanel from "../components/LevelPanel.jsx";
import LevelSelector from "../components/LevelSelector.jsx";
import { levels } from "../data/levelData.js";
import { findHint, isChallengeLevel } from "../game/gameLogic.js";
import { calculateStars } from "../game/levelProgression.js";
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
  onAudioEffect,
  onSelectLevel,
  navigate,
  challengeDate,
  wormSkin,
}) {
  const keyboardMoveLocked = useRef(false);
  const resumeButtonRef = useRef(null);
  const pauseButtonRef = useRef(null);
  const wasPaused = useRef(false);
  const previousAudioStatus = useRef(game.status);
  const [hintMessage, setHintMessage] = useState("");
  const [hintError, setHintError] = useState("");
  const [hintPending, setHintPending] = useState(false);
  const hintPendingRef = useRef(false);
  const isFinished = game.status === "won" || game.status === "lost";
  const isChallenge = isChallengeLevel(level);
  const effectiveMoveLimit = level.moveLimit === undefined
    ? undefined
    : level.moveLimit + (game.extraMovesAdded || 0);
  const remainingMoves = isChallenge
    ? Math.max(0, effectiveMoveLimit - game.moves)
    : null;
  const hintAvailable = Boolean(findHint(game, level.board, level.moveLimit));

  useEffect(() => {
    if (previousAudioStatus.current !== game.status) {
      if (game.status === "won") {
        const stars = calculateStars(game.moves, level.parMoves);
        onAudioEffect(stars === 3
          ? "threeStar"
          : game.moves <= level.parMoves
            ? "efficient"
            : "complete");
      } else if (game.status === "lost") {
        onAudioEffect("failure");
      }
    }
    previousAudioStatus.current = game.status;
  }, [game.moves, game.status, level.parMoves, onAudioEffect]);

  function handlePauseAction() {
    onAudioEffect(game.status === "paused" ? "resume" : "pause");
    onPause();
  }

  function handleRestartAction() {
    onAudioEffect(game.status === "lost" ? "retry" : "button");
    onRestart();
  }

  useEffect(() => {
    if (!active || !["ready", "playing"].includes(game.status)) {
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
  }, [active, game.status, onMove]);

  useEffect(() => {
    if (game.status !== "paused") {
      if (wasPaused.current) pauseButtonRef.current?.focus();
      wasPaused.current = false;
      return undefined;
    }

    wasPaused.current = true;
    resumeButtonRef.current?.focus();
    function handlePauseKeys(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        handlePauseAction();
        return;
      }
      if (event.key !== "Tab") return;

      const buttons = Array.from(
        document.querySelectorAll(".game-pause-dialog button:not(:disabled)"),
      );
      if (buttons.length === 0) {
        event.preventDefault();
        return;
      }
      const firstButton = buttons[0];
      const lastButton = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault();
        lastButton.focus();
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault();
        firstButton.focus();
      }
    }
    window.addEventListener("keydown", handlePauseKeys);
    return () => window.removeEventListener("keydown", handlePauseKeys);
  }, [game.status, onPause, onAudioEffect]);

  async function showHint() {
    if (hintPendingRef.current) return;
    setHintError("");
    setHintMessage("");
    hintPendingRef.current = true;
    setHintPending(true);
    try {
      const { direction } = await requestGameHint({
        game,
        board: level.board,
        moveLimit: level.moveLimit,
      });
      if (!direction) {
        setHintMessage("No safe hint is available from this position.");
        return;
      }
      const destination = game.apples.length > 0 ? "an apple" : "the portal";
      setHintMessage(`Try moving ${direction} toward ${destination}.`);
    } catch (error) {
      setHintError(error.message);
    } finally {
      hintPendingRef.current = false;
      setHintPending(false);
    }
  }

  const resetHint = React.useCallback(() => {
    setHintMessage("");
    setHintError("");
  }, []);

  function selectLevel(nextLevel) {
    resetHint();
    onAudioEffect("button");
    onSelectLevel(nextLevel);
  }

  const clearHintOnMove = React.useCallback((direction) => {
    resetHint();
    if (!["ready", "playing"].includes(game.status)) return;
    onMove(direction);
  }, [game.status, onMove, resetHint]);

  const hintLabel = !hintAvailable
    ? "Hint unavailable"
    : hintPending
      ? "Finding hint..."
      : "Free hint";
  const nextLevel = levels[level.number];
  const earnedStars = calculateStars(game.moves, level.parMoves);
  const goldenAppleCount = level.board.goldenApples?.length ?? 0;
  const treasureCount = level.board.treasures?.length ?? 0;
  const goldenAppleTotal = game.collectedGoldenAppleIds?.length ?? 0;
  const treasureTotal = game.collectedTreasureIds?.length ?? 0;
  const timedDoor = level.board.timedDoors?.[0];
  const timedDoorMovesRemaining = timedDoor
    ? Math.max(0, (game.timedDoorExpiry?.[timedDoor.id] ?? 0) - game.moves)
    : 0;
  const statusLabel =
    isChallenge && game.status === "lost" ? "Challenge failed" : game.status;
  const statusMessage =
    game.failureReason === "move-limit"
      ? "Move limit reached before completing the level."
      : statusMessages[game.status];

  return (
    <main className="game-page">
      <div className="game-shell" key={level.number}>
        <GameHeader
          level={level.number}
          score={game.score}
          moves={game.moves}
          navigate={(destination) => {
            onAudioEffect("button");
            navigate(destination);
          }}
        />
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

            {isChallenge && (
              <div
                className="challenge-move-counter"
                role="status"
                aria-live="polite"
                aria-label={`Challenge move limit: ${effectiveMoveLimit}; ${remainingMoves} remaining`}
              >
                <strong>Challenge</strong>
                <span>{game.moves} / {effectiveMoveLimit} moves used</span>
                <span>{remainingMoves} remaining</span>
              </div>
            )}
            {(goldenAppleCount > 0 || treasureCount > 0 || challengeDate) && (
              <div className="collectible-goal-hud" aria-label="Optional level rewards">
                {goldenAppleCount > 0 && (
                  <span aria-label={`Golden apples: ${goldenAppleTotal} of ${goldenAppleCount}`}>
                    🌟 Golden Apple {goldenAppleTotal}/{goldenAppleCount}
                  </span>
                )}
                {treasureCount > 0 && (
                  <span aria-label={`Treasures: ${treasureTotal} of ${treasureCount}`}>
                    🧰 Treasure {treasureTotal}/{treasureCount}
                  </span>
                )}
                {challengeDate && (
                  <span aria-label={`Daily challenge for ${challengeDate}`}>
                    📅 Daily Challenge
                  </span>
                )}
              </div>
            )}
            {timedDoor && timedDoorMovesRemaining > 0 && (
              <div className="mechanic-countdown" role="status" aria-live="polite">
                Timed door closes in {timedDoorMovesRemaining} moves
              </div>
            )}

            <div
              className={`game-status game-status--${game.status}`}
              role="status"
              aria-live="polite"
            >
              <span className="game-status-label">{statusLabel}</span>
              <span>{hintMessage || statusMessage}</span>
            </div>
            {hintError && <p className="form-error" role="alert">{hintError}</p>}

            <GameBoard
              level={level}
              game={game}
              onMove={clearHintOnMove}
              wormSkin={wormSkin}
            />

            {game.status === "won" && (
              <section
                className="level-complete-card"
                aria-labelledby="level-complete-title"
                aria-live="polite"
              >
                <div className="level-complete-copy">
                  <p className="eyebrow">A lovely bit of progress</p>
                  <h2 id="level-complete-title">Level complete!</h2>
                  <p>You reached the portal and gathered every apple.</p>
                </div>
                <div className="completion-stars" aria-label={`${earnedStars} stars earned`}>
                  {[1, 2, 3].map((star) => (
                    <span
                      className={star <= earnedStars
                        ? "completion-star completion-star--earned"
                        : "completion-star"}
                      key={star}
                      aria-hidden="true"
                      style={{ "--star-index": star - 1 }}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div className="completion-stats">
                  <span><strong>{game.score.toLocaleString()}</strong> points</span>
                  <span><strong>{game.moves}</strong> moves</span>
                </div>
                {(goldenAppleCount > 0 || treasureCount > 0 || challengeDate) && (
                  <div className="completion-bonus-summary" aria-label="Bonus objective results">
                    {goldenAppleCount > 0 && (
                      <span>Golden Apple {goldenAppleTotal}/{goldenAppleCount}</span>
                    )}
                    {treasureCount > 0 && (
                      <span>Treasure {treasureTotal}/{treasureCount}</span>
                    )}
                    {challengeDate && <span>Daily challenge completed</span>}
                    <small>
                      {game.moves <= level.parMoves
                        ? "Move target met; bonus is separate from stars."
                        : "Move target missed; stars are unchanged."}
                    </small>
                  </div>
                )}
                <div className="completion-actions">
                  {nextLevel && nextLevel.number <= unlockedLevel && (
                    <button
                      className="control-button control-button--primary"
                      type="button"
                      onClick={() => selectLevel(nextLevel)}
                    >
                      Next Level <span aria-hidden="true">→</span>
                    </button>
                  )}
                  <button className="control-button control-button--quiet" type="button" onClick={handleRestartAction}>
                    Replay Level
                  </button>
                </div>
              </section>
            )}

            <div className="game-controls" aria-label="Game controls">
            {game.status !== "won" && (
              <button className="control-button control-button--quiet" type="button" onClick={handleRestartAction}>
                <span aria-hidden="true">↻</span>
                {game.status === "lost" ? "Retry Level" : "Restart Level"}
              </button>
            )}
              <button
                className="control-button control-button--primary"
                type="button"
                ref={pauseButtonRef}
                onClick={handlePauseAction}
                disabled={isFinished}
              >
                <span aria-hidden="true">{game.status === "paused" ? "▶" : "Ⅱ"}</span>
                {game.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                className="control-button control-button--quiet"
                type="button"
                onClick={() => {
                  onAudioEffect("button");
                  void showHint();
                }}
                disabled={!hintAvailable || game.status === "paused" || isFinished || hintPending}
              >
                <span aria-hidden="true">✦</span>
                {hintLabel}
              </button>
              <button className="game-levels-link" type="button" onClick={() => {
                onAudioEffect("button");
                navigate("/levels");
              }}>
                All levels
              </button>
            </div>
            <p className="control-note">Hints are generated on your device.</p>
            <p className="control-note">Arrow keys, WASD, or swipe to move</p>
          </section>

          <div className="game-sidebar">
            <LevelPanel
              level={level}
              totalLevels={levels.length}
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
      {game.status === "paused" && (
        <div className="game-pause-backdrop">
          <section
            className="game-pause-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-pause-title"
            aria-describedby="game-pause-description"
          >
            <span className="game-pause-mark" aria-hidden="true">Ⅱ</span>
            <p className="eyebrow">Take your time</p>
            <h2 id="game-pause-title">Adventure paused</h2>
            <p id="game-pause-description">
              Your place in Level {level.number} is saved. Pick up right where you left off.
            </p>
            <div className="game-pause-actions">
              <button
                className="control-button control-button--primary"
                type="button"
                ref={resumeButtonRef}
                onClick={handlePauseAction}
              >
                Resume adventure
              </button>
              <button
                className="control-button control-button--quiet"
                type="button"
                onClick={handleRestartAction}
              >
                Restart level
              </button>
              <button
                className="control-button control-button--quiet"
                type="button"
                onClick={() => {
                  onAudioEffect("button");
                  navigate("/levels");
                }}
              >
                Exit to levels
              </button>
            </div>
            <span className="game-pause-shortcut">Press Esc to resume</span>
          </section>
        </div>
      )}
    </main>
  );
}

export default GameScreen;

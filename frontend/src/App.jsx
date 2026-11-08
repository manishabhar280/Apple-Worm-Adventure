import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./components/AppShell.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LevelsPage from "./pages/LevelsPage.jsx";
import GameScreen from "./pages/GameScreen.jsx";
import {
  AchievementsPage,
  SettingsPage,
  StatisticsPage,
  DailyChallengePage,
  WormCollectionPage,
} from "./pages/GuestPages.jsx";
import { getGuestAchievements } from "./game/guestAchievements.js";
import { getGuestStatistics } from "./game/guestStatistics.js";
import { levels } from "./data/levelData.js";
import {
  completeGuestLevelWithFeatures,
  readGuestProgress,
  saveGuestProgress,
} from "./data/guestProgress.js";
import {
  applyGuestSettings,
  readGuestSettings,
  saveGuestSettings,
  vibrateForMove,
} from "./data/guestSettings.js";
import { useGame } from "./game/useGame.js";
import { gameAudio } from "./game/gameAudio.js";
import { getRouteAccess } from "./auth/routeAccess.js";
import { getLevelFeatureBoard } from "../../shared/levelFeatures.js";
import { getDailyChallenge, toUtcDateKey } from "./game/dailyChallenge.js";
import { getEquippedWormSkin, isWormSkinUnlocked } from "./game/wormSkins.js";

function useNavigation() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const navigate = useCallback((nextPath) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return { path, navigate };
}

function App() {
  const { path, navigate } = useNavigation();
  const [initialLoad] = useState(() => {
    const progressLoad = readGuestProgress();
    const settingsLoad = readGuestSettings(undefined, {
      legacyReducedMotion: progressLoad.progress.settings.reducedMotion,
      prefersReducedMotion: globalThis.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches || false,
    });
    return { progressLoad, settingsLoad };
  });
  const [guestProgress, setGuestProgress] = useState(initialLoad.progressLoad.progress);
  const [guestSettings, setGuestSettings] = useState(initialLoad.settingsLoad.settings);
  const [canSaveProgress, setCanSaveProgress] = useState(initialLoad.progressLoad.canSave);
  const [canSaveSettings, setCanSaveSettings] = useState(initialLoad.settingsLoad.canSave);
  const [progressError, setProgressError] = useState(initialLoad.progressLoad.error);
  const [settingsError, setSettingsError] = useState(initialLoad.settingsLoad.error);
  const [progressSaveFailed, setProgressSaveFailed] = useState(false);
  const [settingsSaveFailed, setSettingsSaveFailed] = useState(false);
  const progressSaveFailureRef = useRef(false);
  const settingsSaveFailureRef = useRef(false);
  const [achievementToast, setAchievementToast] = useState(null);
  const achievementToastTimer = useRef(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(() =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false,
  );
  const effectiveReducedMotion = guestSettings.reducedMotion || systemReducedMotion;
  const [selectedLevelNumber, setSelectedLevelNumber] = useState(
    initialLoad.progressLoad.progress.activeGame?.levelNumber || 1,
  );
  const [activeChallengeDate, setActiveChallengeDate] = useState(
    initialLoad.progressLoad.progress.activeGame?.challengeDate ?? null,
  );
  const selectedLevel = useMemo(() => {
    const level = levels[selectedLevelNumber - 1];
    return { ...level, board: getLevelFeatureBoard(level) };
  }, [selectedLevelNumber]);
  const {
    game,
    actions,
    move,
    restart,
    pause,
    loadLevel,
    loadProgress,
  } = useGame(selectedLevel.board, selectedLevel.moveLimit);
  const unlockedLevel = guestProgress.unlockedLevel;
  const records = guestProgress.records;
  const achievements = getGuestAchievements(
    records,
    guestProgress.achievements,
    guestProgress.engagement,
  );
  const statistics = getGuestStatistics(guestProgress);

  const routeAccess = getRouteAccess(path);
  useEffect(() => {
    if (routeAccess.type === "redirect") {
      navigate(routeAccess.destination);
    }
  }, [navigate, routeAccess.destination, routeAccess.type]);

  useEffect(() => {
    const savedGame = initialLoad.progressLoad.progress.activeGame;
    if (!savedGame) return;
    const level = levels[savedGame.levelNumber - 1];
    loadProgress(getLevelFeatureBoard(level), savedGame.actions, level.moveLimit);
    if (window.location.pathname === "/") navigate("/game");
  }, [initialLoad, loadProgress, navigate]);

  useEffect(() => {
    if (!canSaveProgress || progressSaveFailureRef.current) return;
    try {
      saveGuestProgress(guestProgress);
      setProgressError("");
      setProgressSaveFailed(false);
      progressSaveFailureRef.current = false;
    } catch (error) {
      progressSaveFailureRef.current = true;
      setCanSaveProgress(false);
      setProgressSaveFailed(true);
      setProgressError(error.message);
    }
  }, [canSaveProgress, guestProgress]);

  useEffect(() => {
    if (!canSaveSettings || settingsSaveFailureRef.current) return;
    try {
      saveGuestSettings(guestSettings);
      setSettingsError("");
      setSettingsSaveFailed(false);
      settingsSaveFailureRef.current = false;
    } catch (error) {
      settingsSaveFailureRef.current = true;
      setCanSaveSettings(false);
      setSettingsSaveFailed(true);
      setSettingsError(error.message);
    }
  }, [canSaveSettings, guestSettings]);

  useEffect(() => {
    applyGuestSettings({
      ...guestSettings,
      reducedMotion: effectiveReducedMotion,
    });
  }, [effectiveReducedMotion, guestSettings]);

  useEffect(() => {
    gameAudio.setSoundEffectsEnabled(guestSettings.soundEffects);
    gameAudio.setBackgroundMusicEnabled(
      guestSettings.backgroundMusic && path === "/game",
    );
  }, [guestSettings.backgroundMusic, guestSettings.soundEffects, path]);

  useEffect(() => {
    if (path !== "/game" || !guestSettings.backgroundMusic) return undefined;
    const startMusic = (event) => {
      if (event.isTrusted) gameAudio.startMusicFromInteraction();
    };
    const stopMusicWhenHidden = () => {
      if (document.visibilityState === "hidden") gameAudio.pauseMusic();
    };
    window.addEventListener("pointerdown", startMusic, true);
    window.addEventListener("keydown", startMusic, true);
    document.addEventListener("visibilitychange", stopMusicWhenHidden);
    return () => {
      window.removeEventListener("pointerdown", startMusic, true);
      window.removeEventListener("keydown", startMusic, true);
      document.removeEventListener("visibilitychange", stopMusicWhenHidden);
      gameAudio.pauseMusic();
    };
  }, [guestSettings.backgroundMusic, path]);

  useEffect(() => () => gameAudio.dispose(), []);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const handleChange = (event) => setSystemReducedMotion(event.matches);
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    if (path !== "/game") return;
    if (game.status === "won" || game.status === "lost") {
      setGuestProgress((current) =>
        current.activeGame?.levelNumber === selectedLevelNumber &&
          current.activeGame.actions.length === actions.length
          ? { ...current, activeGame: null }
          : current);
      return;
    }
    setGuestProgress((current) => {
      const saved = current.activeGame;
      if (
        saved?.levelNumber === selectedLevelNumber &&
        (saved.challengeDate ?? null) === activeChallengeDate &&
        saved.actions.length === actions.length &&
        saved.actions.every((action, index) => action === actions[index])
      ) {
        return current;
      }
      return {
        ...current,
        activeGame: {
          levelNumber: selectedLevelNumber,
          actions,
          ...(activeChallengeDate ? { challengeDate: activeChallengeDate } : {}),
        },
      };
    });
  }, [actions, activeChallengeDate, game.status, path, selectedLevelNumber]);

  useEffect(() => {
    if (game.status !== "won") return;
    const completedProgress = completeGuestLevelWithFeatures(
      guestProgress,
      selectedLevel,
      game,
      {
        challengeDate: activeChallengeDate,
        today: toUtcDateKey(),
      },
    );
    const newlyUnlocked = getGuestAchievements(
      completedProgress.records,
      completedProgress.achievements,
      completedProgress.engagement,
    ).filter((achievement) =>
      achievement.unlockedAt &&
      !guestProgress.achievements?.[achievement.id]?.unlockedAt);

    if (newlyUnlocked.length > 0) {
      if (achievementToastTimer.current !== null) {
        window.clearTimeout(achievementToastTimer.current);
      }
      setAchievementToast({
        ids: newlyUnlocked.map(({ id }) => id).join(","),
        titles: newlyUnlocked.map(({ title }) => title),
      });
      achievementToastTimer.current = window.setTimeout(() => {
        setAchievementToast(null);
        achievementToastTimer.current = null;
      }, 5200);
    }
    if (completedProgress !== guestProgress) {
      setGuestProgress(completedProgress);
    }
    if (activeChallengeDate) setActiveChallengeDate(null);
  }, [achievementToastTimer, activeChallengeDate, game, guestProgress, selectedLevel]);

  useEffect(() => () => {
    if (achievementToastTimer.current !== null) {
      window.clearTimeout(achievementToastTimer.current);
    }
  }, []);

  const handleSelectLevel = useCallback((level, openGame = false) => {
    if (!level || level.number > guestProgress.unlockedLevel) return;
    setActiveChallengeDate(null);
    setSelectedLevelNumber(level.number);
    loadLevel(getLevelFeatureBoard(level), level.moveLimit);
    setGuestProgress((current) => ({
      ...current,
      activeGame: { levelNumber: level.number, actions: [] },
    }));
    if (openGame || path === "/game") navigate("/game");
  }, [guestProgress.unlockedLevel, loadLevel, navigate, path]);

  const playNow = useCallback(() => {
    const savedGame = guestProgress.activeGame;
    if (savedGame) {
      const level = levels[savedGame.levelNumber - 1];
      setActiveChallengeDate(savedGame.challengeDate ?? null);
      setSelectedLevelNumber(level.number);
      loadProgress(getLevelFeatureBoard(level), savedGame.actions, level.moveLimit);
      navigate("/game");
      return;
    }
    handleSelectLevel(levels[guestProgress.unlockedLevel - 1], true);
  }, [guestProgress.activeGame, guestProgress.unlockedLevel, handleSelectLevel, loadProgress, navigate]);

  const handleRestart = useCallback(() => {
    restart();
    setGuestProgress((current) => ({
      ...current,
      activeGame: {
        levelNumber: selectedLevelNumber,
        actions: [],
        ...(activeChallengeDate ? { challengeDate: activeChallengeDate } : {}),
      },
    }));
  }, [activeChallengeDate, restart, selectedLevelNumber]);

  const handleSettingChange = useCallback((setting, enabled) => {
    setGuestSettings((current) => ({ ...current, [setting]: enabled }));
  }, []);
  const startDailyChallenge = useCallback(() => {
    const challenge = getDailyChallenge();
    if (guestProgress.activeGame) {
      playNow();
      return;
    }
    const level = levels[challenge.levelNumber - 1];
    setActiveChallengeDate(challenge.date);
    setSelectedLevelNumber(level.number);
    loadLevel(getLevelFeatureBoard(level), level.moveLimit);
    setGuestProgress((current) => ({
      ...current,
      activeGame: {
        levelNumber: level.number,
        actions: [],
        challengeDate: challenge.date,
      },
    }));
    navigate("/game");
  }, [guestProgress.activeGame, loadLevel, navigate, playNow]);
  const equipWormSkin = useCallback((skinId) => {
    if (!isWormSkinUnlocked(skinId, records)) return;
    setGuestProgress((current) => ({
      ...current,
      engagement: {
        ...(current.engagement ?? {}),
        selectedSkin: skinId,
      },
    }));
  }, [records]);
  const retryGuestSaves = useCallback(() => {
    if (progressSaveFailed) {
      progressSaveFailureRef.current = false;
      setCanSaveProgress(true);
    }
    if (settingsSaveFailed) {
      settingsSaveFailureRef.current = false;
      setCanSaveSettings(true);
    }
  }, [progressSaveFailed, settingsSaveFailed]);
  const handleMove = useCallback((direction) => {
    const result = move(direction);
    if (!result.accepted) return false;
    vibrateForMove(guestSettings.vibration);
    if (result.goldenAppleCollected) gameAudio.playEffect("goldenApple");
    else if (result.treasureCollected) gameAudio.playEffect("treasure");
    else if (!result.completed) gameAudio.playEffect(result.appleCollected ? "apple" : "move");
    return true;
  }, [guestSettings.vibration, move]);
  const handleGameAudioEffect = useCallback((effect) => {
    gameAudio.playEffect(effect);
  }, []);

  let screen;
  switch (path) {
    case "/":
      screen = (
        <LandingPage
          navigate={navigate}
          playNow={playNow}
          achievements={achievements}
          engagement={guestProgress.engagement}
        />
      );
      break;
    case "/daily":
      screen = (
        <DailyChallengePage
          progress={guestProgress}
          onStart={startDailyChallenge}
          onResume={playNow}
        />
      );
      break;
    case "/collection":
      screen = (
        <WormCollectionPage
          records={records}
          selectedSkin={guestProgress.engagement?.selectedSkin ?? "classic"}
          engagement={guestProgress.engagement}
          onSelect={equipWormSkin}
        />
      );
      break;
    case "/levels":
      screen = (
        <LevelsPage
          unlockedLevel={unlockedLevel}
          records={records}
          activeGame={guestProgress.activeGame}
          onSelect={(level) => {
            if (guestProgress.activeGame?.levelNumber === level.number) {
              playNow();
              return;
            }
            handleSelectLevel(level, true);
          }}
        />
      );
      break;
    case "/game":
      screen = (
        <GameScreen
          active
          level={selectedLevel}
          game={game}
          unlockedLevel={unlockedLevel}
          records={records}
          onMove={handleMove}
          onRestart={handleRestart}
          onPause={pause}
          onAudioEffect={handleGameAudioEffect}
          onSelectLevel={(level) => handleSelectLevel(level)}
          navigate={navigate}
          challengeDate={activeChallengeDate}
          wormSkin={getEquippedWormSkin(
            guestProgress.engagement?.selectedSkin,
            records,
          )}
        />
      );
      break;
    case "/achievements":
      screen = (
        <AchievementsPage
          records={records}
          unlocks={guestProgress.achievements}
        />
      );
      break;
    case "/statistics":
      screen = <StatisticsPage statistics={statistics} navigate={navigate} />;
      break;
    case "/settings":
      screen = (
        <SettingsPage
          settings={guestSettings}
          vibrationAvailable={typeof globalThis.navigator?.vibrate === "function"}
          onSettingChange={handleSettingChange}
        />
      );
      break;
    default:
      screen = (
        <LandingPage
          navigate={navigate}
          playNow={playNow}
          achievements={achievements}
        />
      );
  }

  return (
    <AppShell
      path={path}
      navigate={navigate}
      reducedMotion={effectiveReducedMotion}
      darkMode={guestSettings.darkMode}
    >
      {achievementToast && (
        <aside className="achievement-toast" role="status" aria-live="polite">
          <span className="achievement-toast-icon" aria-hidden="true">🏅</span>
          <span className="achievement-toast-copy">
            <strong>{achievementToast.titles.length === 1
              ? "Achievement unlocked"
              : `${achievementToast.titles.length} achievements unlocked`}</strong>
            <span>{achievementToast.titles.join(" · ")}</span>
          </span>
          <button
            type="button"
            className="achievement-toast-link"
            onClick={() => navigate("/achievements")}
          >
            View
          </button>
          <button
            type="button"
            className="achievement-toast-dismiss"
            aria-label="Dismiss achievement notification"
            onClick={() => {
              if (achievementToastTimer.current !== null) {
                window.clearTimeout(achievementToastTimer.current);
                achievementToastTimer.current = null;
              }
              setAchievementToast(null);
            }}
          >
            ×
          </button>
        </aside>
      )}
      {(progressError || settingsError) && (
        <div className="persistence-alert" role="alert">
          {[progressError, settingsError].filter(Boolean).join(" ")}
          {(progressSaveFailed || settingsSaveFailed) && (
            <button
              className="retry-button"
              type="button"
              onClick={retryGuestSaves}
            >
              Retry save
            </button>
          )}
          <button
            className="dismiss-button"
            type="button"
            onClick={() => {
              setProgressError("");
              setSettingsError("");
            }}
            aria-label="Dismiss save warning"
          >
            ×
          </button>
        </div>
      )}
      {screen}
    </AppShell>
  );
}

export default App;

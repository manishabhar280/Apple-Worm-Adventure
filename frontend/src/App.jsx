import React, { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "./components/AppShell.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LevelsPage from "./pages/LevelsPage.jsx";
import GameScreen from "./pages/GameScreen.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import {
  AchievementsPage,
  HistoryPage,
  LeaderboardPage,
  ProfilePage,
  WalletPage,
} from "./pages/DataPages.jsx";
import { levels } from "./data/levelData.js";
import { recordLevelCompletion } from "./game/levelProgression.js";
import { useGame } from "./game/useGame.js";
import { api } from "./services/api.js";
import { getRouteAccess } from "./auth/routeAccess.js";
import { ErrorState, LoadingState } from "./components/ScreenStates.jsx";
import { createSessionSaveQueue } from "./game/sessionSaveQueue.js";

function recordsFromProgress(progress) {
  return Object.fromEntries(
    progress.levels
      .filter((record) => record.status === "completed")
      .map((record) => [record.levelNumber, {
        score: record.bestScore,
        moves: record.bestMoves,
        stars: record.stars,
      }]),
  );
}

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
  const [player, setPlayer] = useState(null);
  const [authStatus, setAuthStatus] = useState("loading");
  const [authError, setAuthError] = useState("");
  const [selectedLevelNumber, setSelectedLevelNumber] = useState(1);
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [records, setRecords] = useState({});
  const [activeSession, setActiveSession] = useState(null);
  const [persistenceError, setPersistenceError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingRewardHint, setPendingRewardHint] = useState(null);
  const sessionGeneration = useRef(0);
  const authGeneration = useRef(0);
  const saveQueue = useRef(null);
  const selectedLevel = levels[selectedLevelNumber - 1];
  const { game, actions, move, restart, pause, loadLevel, loadProgress } = useGame(levels[0].board);
  const routeAccess = getRouteAccess(path, authStatus, player?.role);

  if (!saveQueue.current) {
    saveQueue.current = createSessionSaveQueue({
      save: (sessionId, sessionActions, options) =>
        api.saveGameActions(undefined, sessionId, sessionActions, options),
      onSaved: (result, job) => {
        if (sessionGeneration.current !== job.generation) return;
        setUnlockedLevel((current) => Math.max(current, result.progress.unlockedLevel));
        setRecords(recordsFromProgress(result.progress));
        setActiveSession(result.session.status === "in_progress" ? result.session : null);
        setPersistenceError("");
        setSaveFailed(false);
      },
      onError: (error, job) => {
        if (sessionGeneration.current !== job.generation) return;
        setPersistenceError(error.message);
        setSaveFailed(true);
      },
    });
  }

  const flushActiveSession = useCallback(async () => {
    if (authStatus !== "authenticated" || !activeSession?.id) return true;
    const sameActions =
      activeSession.actions?.length === actions.length &&
      activeSession.actions?.every((action, index) => action === actions[index]);
    if (sameActions) return true;
    saveQueue.current.enqueue(activeSession.id, actions, sessionGeneration.current);
    return saveQueue.current.flush();
  }, [actions, activeSession, authStatus]);

  const checkSession = useCallback(async () => {
    const generation = ++authGeneration.current;
    setAuthStatus("loading");
    setAuthError("");
    try {
      const { user } = await api.getCurrentUser();
      if (authGeneration.current !== generation) return;
      setPlayer({
        id: user.id,
        name: user.displayName,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      });
      setAuthStatus("authenticated");
    } catch (error) {
      if (authGeneration.current !== generation) return;
      setPlayer(null);
      if (error.status === 401) {
        setAuthStatus("anonymous");
      } else {
        setAuthError(error.message);
        setAuthStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    function handleSessionExpired() {
      authGeneration.current += 1;
      setPlayer(null);
      setAuthStatus("anonymous");
      setAuthError("");
    }
    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => window.removeEventListener("auth:session-expired", handleSessionExpired);
  }, []);

  useEffect(() => {
    if (routeAccess.type === "redirect") {
      navigate(routeAccess.destination);
    }
  }, [navigate, routeAccess.destination, routeAccess.type]);

  const handleSelectLevel = useCallback(
    async (level, openGame = false) => {
      if (!level || level.number > unlockedLevel) {
        return;
      }
      if (!(await flushActiveSession())) return;
      setSelectedLevelNumber(level.number);
      loadLevel(level.board);
      setActiveSession(null);
      const generation = ++sessionGeneration.current;
      setPersistenceError("");
      if (openGame || path === "/game") {
        navigate("/game");
      }
      if (authStatus === "authenticated") {
        api.startGameSession(undefined, level.number)
          .then(({ session }) => {
            if (sessionGeneration.current === generation) setActiveSession(session);
          })
          .catch((error) => {
            if (sessionGeneration.current === generation) setPersistenceError(error.message);
          });
      }
    },
    [authStatus, flushActiveSession, loadLevel, navigate, path, unlockedLevel],
  );

  const playFirstLevel = useCallback(() => {
    handleSelectLevel(levels[0], true);
  }, [handleSelectLevel]);

  const handleResume = useCallback(async (resume) => {
    if (activeSession?.id === resume.sessionId) {
      navigate("/game");
      return;
    }
    if (!(await flushActiveSession())) return;
    const level = levels[resume.levelNumber - 1];
    if (!level) {
      setPersistenceError("Saved progress references an unavailable level.");
      return;
    }
    setSelectedLevelNumber(level.number);
    setUnlockedLevel((current) => Math.max(current, resume.levelNumber));
    setPersistenceError("");
    if (resume.sessionId) {
      sessionGeneration.current += 1;
      loadProgress(level.board, resume.actions);
      setActiveSession({
        id: resume.sessionId,
        levelNumber: resume.levelNumber,
        actions: resume.actions,
      });
      navigate("/game");
      return;
    }
    setSelectedLevelNumber(level.number);
    loadLevel(level.board);
    setActiveSession(null);
    const generation = ++sessionGeneration.current;
    navigate("/game");
    if (authStatus === "authenticated") {
      api.startGameSession(undefined, level.number)
        .then(({ session }) => {
          if (sessionGeneration.current === generation) setActiveSession(session);
        })
        .catch((error) => {
          if (sessionGeneration.current === generation) setPersistenceError(error.message);
        });
    }
  }, [activeSession, authStatus, flushActiveSession, loadLevel, loadProgress, navigate]);

  const handleRestart = useCallback(async () => {
    if (!(await flushActiveSession())) return;
    restart();
    setActiveSession(null);
    const generation = ++sessionGeneration.current;
    if (authStatus === "authenticated") {
      api.startGameSession(undefined, selectedLevelNumber)
        .then(({ session }) => {
          if (sessionGeneration.current === generation) setActiveSession(session);
        })
        .catch((error) => {
          if (sessionGeneration.current === generation) setPersistenceError(error.message);
        });
    }
  }, [authStatus, flushActiveSession, restart, selectedLevelNumber]);

  const handleAuthenticated = useCallback((user) => {
    authGeneration.current += 1;
    setPlayer({
      id: user.id,
      name: user.displayName,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
    });
    setAuthError("");
    setAuthStatus("authenticated");
  }, []);

  const handleLogout = useCallback(async () => {
    authGeneration.current += 1;
    setPersistenceError("");
    try {
      await api.logout();
      setPlayer(null);
      setAuthStatus("anonymous");
      setActiveSession(null);
      sessionGeneration.current += 1;
      navigate("/");
    } catch (error) {
      if (error.status !== 401) {
        setPersistenceError(error.message);
      }
    }
  }, [navigate]);

  const purchaseHint = useCallback((requestId) => api.purchaseHint(requestId), []);
  const receiveRewardHint = useCallback((direction) => {
    setPendingRewardHint({ id: crypto.randomUUID(), direction });
    navigate("/game");
  }, [navigate]);
  const consumeRewardHint = useCallback((hintId) => {
    setPendingRewardHint((current) => current?.id === hintId ? null : current);
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return undefined;
    }
    let current = true;
    const generation = sessionGeneration.current;
    api.getProgress().then((progress) => {
      if (!current || sessionGeneration.current !== generation) return;
      setUnlockedLevel(progress.unlockedLevel);
      setRecords(recordsFromProgress(progress));
      if (progress.activeSession) {
        const resumeLevel = levels[progress.activeSession.levelNumber - 1];
        if (!resumeLevel) {
          setPersistenceError("Saved progress references an unavailable level.");
          setActiveSession(null);
          return;
        }
        setSelectedLevelNumber(resumeLevel.number);
        loadProgress(resumeLevel.board, progress.activeSession.actions || []);
      }
      setActiveSession(progress.activeSession);
    }).catch((error) => {
      if (current) setPersistenceError(error.message);
    });
    return () => {
      current = false;
    };
  }, [authStatus, loadProgress]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !activeSession?.id) {
      return undefined;
    }
    const generation = sessionGeneration.current;
    const sameActions =
      activeSession.actions?.length === actions.length &&
      activeSession.actions?.every((action, index) => action === actions[index]);
    if (sameActions) {
      return undefined;
    }

    saveQueue.current.enqueue(activeSession.id, actions, generation);
  }, [authStatus, activeSession, actions]);

  const latestSaveRef = useRef(null);
  latestSaveRef.current = { authStatus, activeSession, actions, generation: sessionGeneration.current };

  useEffect(() => {
    function flushOnPageHide() {
      const snapshot = latestSaveRef.current;
      if (snapshot.authStatus !== "authenticated" || !snapshot.activeSession?.id) return;
      const savedActions = snapshot.activeSession.actions || [];
      const sameActions = savedActions.length === snapshot.actions.length &&
        savedActions.every((action, index) => action === snapshot.actions[index]);
      if (!sameActions) {
        saveQueue.current.flushForPageHide(
          snapshot.activeSession.id,
          snapshot.actions,
          snapshot.generation,
        );
      }
    }
    window.addEventListener("pagehide", flushOnPageHide);
    return () => window.removeEventListener("pagehide", flushOnPageHide);
  }, []);

  useEffect(() => {
    if (game.status !== "won") {
      return;
    }
    setRecords((previous) =>
      recordLevelCompletion(previous, selectedLevel, game),
    );
    setUnlockedLevel((previous) =>
      Math.max(previous, Math.min(levels.length, selectedLevel.number + 1)),
    );
  }, [game, selectedLevel]);

  let screen;
  if (authStatus === "error" && routeAccess.type === "wait") {
    screen = (
      <main className="content-page">
        <ErrorState message={authError} onRetry={() => void checkSession()} />
      </main>
    );
  } else if (routeAccess.type === "wait") {
    screen = (
      <main className="content-page">
        <LoadingState label="Checking your session..." />
      </main>
    );
  } else if (routeAccess.type === "redirect") {
    screen = (
      <main className="content-page">
        <LoadingState label="Redirecting..." />
      </main>
    );
  } else switch (path) {
    case "/":
      screen = <LandingPage navigate={navigate} playFirstLevel={playFirstLevel} />;
      break;
    case "/login":
      screen = (
        <AuthPage
          mode="login"
          navigate={navigate}
          onAuthenticated={handleAuthenticated}
        />
      );
      break;
    case "/register":
      screen = (
        <AuthPage
          mode="register"
          navigate={navigate}
          onAuthenticated={handleAuthenticated}
        />
      );
      break;
    case "/dashboard":
      screen = (
        <DashboardPage
          navigate={navigate}
          player={player}
          onResume={handleResume}
        />
      );
      break;
    case "/levels":
      screen = (
        <LevelsPage
          unlockedLevel={unlockedLevel}
          records={records}
          selectedLevel={selectedLevelNumber}
          onSelect={(level) => handleSelectLevel(level, true)}
          navigate={navigate}
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
          onMove={move}
          onRestart={handleRestart}
          onPause={pause}
          onPurchaseHint={authStatus === "authenticated" ? purchaseHint : undefined}
          rewardHint={pendingRewardHint}
          onRewardHintConsumed={consumeRewardHint}
          onSelectLevel={(level) => handleSelectLevel(level)}
          navigate={navigate}
        />
      );
      break;
    case "/profile":
      screen = <ProfilePage />;
      break;
    case "/history":
      screen = <HistoryPage />;
      break;
    case "/leaderboard":
      screen = <LeaderboardPage />;
      break;
    case "/achievements":
      screen = <AchievementsPage />;
      break;
    case "/wallet":
      screen = <WalletPage onRewardHint={receiveRewardHint} />;
      break;
    case "/admin":
      screen = player?.role === "admin"
        ? <AdminPage />
        : <main className="content-page"><div className="content-card admin-access-denied"><h1>Admin access required</h1><p>This area is available only to administrator accounts.</p><button className="control-button control-button--primary" type="button" onClick={() => navigate("/dashboard")}>Return to dashboard</button></div></main>;
      break;
    default:
      screen = <LandingPage navigate={navigate} />;
  }

  return (
    <AppShell
      path={path}
      navigate={navigate}
      player={player}
      onLogout={handleLogout}
    >
      {persistenceError && (
        <div className="persistence-alert" role="alert">
          {persistenceError}
          {saveFailed && <button className="retry-button" type="button" onClick={() => saveQueue.current.retry()}>Retry save</button>}
          <button className="dismiss-button" type="button" onClick={() => setPersistenceError("")} aria-label="Dismiss error">×</button>
        </div>
      )}
      {screen}
    </AppShell>
  );
}

export default App;

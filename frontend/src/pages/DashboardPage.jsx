import React from "react";
import { useAsyncData } from "../hooks/useAsyncData.js";
import { api } from "../services/api.js";
import { DataState, EmptyState, PageHeading } from "../components/ScreenStates.jsx";

function DashboardPage({ navigate, player, token, onResume }) {
  const loadDashboard = React.useCallback(async () => {
    const [dashboard, wallet] = await Promise.all([
      api.getDashboard(token),
      api.getWalletBalance(),
    ]);
    return { ...dashboard, wallet };
  }, [token]);
  const query = useAsyncData(loadDashboard, null);

  return (
    <main className="content-page">
      <PageHeading
        eyebrow="Your little corner"
        title={`Hello, ${player?.name?.split(" ")[0] || "Explorer"}!`}
        description="Ready to wiggle your way through another puzzle?"
        action={query.data?.resume && (
          <button
            className="small-primary"
            type="button"
            onClick={() => onResume(query.data.resume)}
          >
            Continue playing →
          </button>
        )}
      />
      <DataState query={query}>
        {(result) => (
          <>
            <section className="stat-cards" aria-label="Player statistics">
              <article className="stat-card stat-card--green"><span>Levels completed</span><strong>{result.stats.completedLevels}<small> / {result.stats.totalLevels}</small></strong><i>▦</i></article>
              <article className="stat-card stat-card--yellow"><span>Best scores total</span><strong>{result.stats.totalScore.toLocaleString()}</strong><i>✦</i></article>
              <article className="stat-card stat-card--lavender"><span>Moves across attempts</span><strong>{result.stats.totalMoves.toLocaleString()}</strong><i>↗</i></article>
              <button className="stat-card stat-card--coins" type="button" onClick={() => navigate("/wallet")} aria-label="Open wallet">
                <span>Coin balance</span><strong>{result.wallet.balance.toLocaleString()}</strong><i>◉</i>
              </button>
            </section>
            <div className="dashboard-grid">
              <section className="content-card continue-card">
                <div className="card-heading"><div><p className="eyebrow">Pick up where you left off</p><h2>{result.resume.sessionId ? "Resume your puzzle" : `Level ${result.resume.levelNumber}`}</h2></div><span className="card-apple">🍎</span></div>
                <p>{result.resume.sessionId ? "Continue your saved moves and finish the puzzle." : "Your next unlocked puzzle is ready."}</p>
                <button className="small-primary" type="button" onClick={() => onResume(result.resume)}>Resume level {result.resume.levelNumber} <span aria-hidden="true">→</span></button>
              </section>
              <section className="content-card">
                <div className="card-heading"><div><p className="eyebrow">Recently played</p><h2>Activity</h2></div><button className="inline-link" type="button" onClick={() => navigate("/history")}>View all</button></div>
                {result.recentActivity.length === 0 ? (
                  <EmptyState icon="🌱" title="No activity yet" description="Your played levels will show up here." />
                ) : (
                  <div className="recent-activity-list">
                    {result.recentActivity.slice(0, 3).map((activity) => (
                      <div className="table-row" key={activity.id}>
                        <strong>{activity.levelName}</strong>
                        <span>{activity.status.replace("_", " ")}</span>
                        <span>{activity.score} pts · {activity.moves} moves</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </DataState>
      <p className="mock-data-note">Completed levels count once each. Best scores total the highest score per completed level; moves include all saved attempts, including failed and unfinished games.</p>
    </main>
  );
}

export default DashboardPage;

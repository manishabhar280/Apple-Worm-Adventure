import React, { useEffect, useState } from "react";
import { useAsyncData } from "../hooks/useAsyncData.js";
import { api } from "../services/api.js";
import {
  DataState,
  EmptyState,
  PageHeading,
} from "../components/ScreenStates.jsx";
import { getVerifiedGameplayEffect } from "../game/rewardEffects.js";

function ProfilePage({ token }) {
  const loadProfile = React.useCallback(() => api.getProfile(token), [token]);
  const query = useAsyncData(loadProfile, null);
  return (
    <main className="content-page">
      <PageHeading eyebrow="Your player card" title="Profile" description="A little snapshot of your time in the orchard." />
      <DataState query={query}>
        {(profile) => (
          <section className="profile-layout">
            <article className="content-card profile-card">
              <span className="profile-avatar profile-avatar--large">{profile.player.avatar || "🐛"}</span>
              <h2>{profile.player.displayName}</h2>
              <p>{profile.player.email}</p>
              <span className="demo-pill">ACCOUNT PROFILE</span>
              <dl className="profile-details">
                <div><dt>Player since</dt><dd>{new Date(profile.player.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long" })}</dd></div>
                <div><dt>Account status</dt><dd>Authenticated</dd></div>
              </dl>
            </article>
            <div className="profile-stat-list">
              <article className="stat-card stat-card--green"><span>Completed levels</span><strong>{profile.stats.completedLevels}</strong><i>▦</i></article>
              <article className="stat-card stat-card--yellow"><span>Total score</span><strong>{profile.stats.totalScore}</strong><i>✦</i></article>
              <article className="stat-card stat-card--lavender"><span>Stars earned</span><strong>{profile.stats.totalStars} / 150</strong><i>★</i></article>
            </div>
          </section>
        )}
      </DataState>
      <p className="mock-data-note">Profile information and progress are loaded from your account.</p>
    </main>
  );
}

function HistoryPage({ token }) {
  const loadHistory = React.useCallback(() => api.getHistory(token), [token]);
  const query = useAsyncData(loadHistory, null);
  return (
    <main className="content-page">
      <PageHeading eyebrow="Your journey so far" title="Game history" description="Revisit the levels and little victories you’ve collected." />
      <DataState query={query} empty={<EmptyState icon="📖" title="No games played yet" description="Your completed levels will appear here after you play." />} >
        {(history) => (
          <section className="content-card table-card">
            <div className="table-heading"><span>LEVEL</span><span>RESULT</span><span>SCORE</span><span>MOVES</span><span>WHEN</span></div>
            {history.map((item) => <div className="table-row" key={item.id}><strong>{item.levelName}<small className="history-result">{item.status.replace("_", " ")}</small></strong><span className="record-stars">{"★".repeat(item.stars)}</span><span>{item.score}</span><span>{item.moves}</span><span>{new Date(item.date).toLocaleDateString()}</span></div>)}
          </section>
        )}
      </DataState>
      <p className="mock-data-note">Each session is recorded with its result, score, moves, and completion time.</p>
    </main>
  );
}

function LeaderboardPage({ token }) {
  const loadLeaderboard = React.useCallback(() => api.getLeaderboard(token), [token]);
  const query = useAsyncData(loadLeaderboard, null);
  return (
    <main className="content-page">
      <PageHeading eyebrow="A friendly little race" title="Leaderboard" description="Ranked by the sum of each player's best scores on completed levels." />
      <DataState query={query} empty={<EmptyState icon="🏆" title="The leaderboard is waiting" description="Scores will show up here when online player data is available." />} >
        {(players) => (
          <section className="content-card table-card">
            <div className="table-heading leaderboard-row"><span>RANK</span><span>PLAYER</span><span>LEVELS</span><span>SCORE</span></div>
            {players.map((entry) => <div className="table-row leaderboard-row" key={entry.id}><strong>#{entry.rank}</strong><span>{entry.avatar} {entry.name}</span><span>{entry.completedLevels}</span><span>{entry.score.toLocaleString()}</span></div>)}
          </section>
        )}
      </DataState>
      <p className="mock-data-note">Only each player's best result per completed level contributes to this score.</p>
    </main>
  );
}

function AchievementsPage({ token }) {
  const loadAchievements = React.useCallback(() => api.getAchievements(token), [token]);
  const query = useAsyncData(loadAchievements, null);
  return (
    <main className="content-page">
      <PageHeading eyebrow="Little milestones" title="Achievements" description="Every clever turn and apple gathered is worth celebrating." />
      <DataState query={query} empty={<EmptyState icon="🏅" title="Your first badge is waiting" description="Play a level to start collecting achievements." />} >
        {(achievements) => (
          <section className="achievement-grid">
            {achievements.map((achievement) => <article className={`achievement-card ${achievement.unlocked ? "" : "achievement-card--locked"}`} key={achievement.id}><span>{achievement.icon}</span><h2>{achievement.title}</h2><p>{achievement.description}</p><div className="achievement-progress"><progress max={achievement.target} value={achievement.progress} aria-label={`${achievement.title} progress`} /><small>{achievement.progress} / {achievement.target}</small></div><small>{achievement.unlocked ? "UNLOCKED" : "LOCKED"}</small></article>)}
          </section>
        )}
      </DataState>
      <p className="mock-data-note">Achievement progress is calculated from server-validated gameplay and completed level records.</p>
    </main>
  );
}

function WalletPage({ token, onRewardHint }) {
  const loadWallet = React.useCallback(() => api.getWallet(token), [token]);
  const query = useAsyncData(loadWallet, null);
  const [pendingReward, setPendingReward] = useState(null);
  const [rewardMessage, setRewardMessage] = useState("");
  const [rewardError, setRewardError] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!pendingReward) return undefined;
    const startedAt = new Date(pendingReward.rewardSession.createdAt).getTime();
    const minimumWait = pendingReward.simulation.minimumWatchSeconds;
    const updateCountdown = () => {
      setSecondsRemaining(Math.max(
        0,
        Math.ceil(minimumWait - (Date.now() - startedAt) / 1000),
      ));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [pendingReward]);

  async function beginReward(rewardType) {
    setRewardError("");
    setRewardMessage("");
    try {
      const requiredStatus = {
        revive: "failed",
        double_score: "completed",
        extra_moves: "in_progress",
        hint: "in_progress",
        booster: "in_progress",
      }[rewardType];
      const relatedSession = requiredStatus
        ? query.data?.gameSessions.find((session) => session.status === requiredStatus)
        : null;
      if (requiredStatus && !relatedSession) {
        setRewardError(`A ${requiredStatus.replace("_", " ")} game session is required for this reward.`);
        return;
      }
      const result = await api.startReward(token, rewardType, relatedSession?.id);
      setPendingReward(result);
      if (result.simulation.enabled) {
        setRewardMessage(result.simulation.label);
      }
    } catch (error) {
      setRewardError(error.message);
    }
  }

  async function verifyReward() {
    if (!pendingReward) return;
    setRewardError("");
    try {
      const result = await api.verifyReward(token, pendingReward.rewardSession.id);
      setRewardMessage(
        result.simulation
          ? "Development simulation reward granted. No real ad was shown."
          : "Reward verified and granted.",
      );
      setPendingReward(null);
      await query.reload();
      const effect = getVerifiedGameplayEffect(result);
      if (effect?.type === "hint") onRewardHint?.(effect.direction);
    } catch (error) {
      setRewardError(error.message);
    }
  }

  const rewardLabels = {
    revive: "Revive after a failed level",
    double_score: "Double a completed level score",
    bonus_coins: "Earn bonus coins",
    extra_moves: "Get extra moves",
    hint: "Unlock a hint",
    booster: "Receive a booster",
  };
  const rewardAmount = (reward) => {
    if (reward.rewardType === "bonus_coins") return `${reward.amount} coins`;
    if (reward.rewardType === "double_score") return `${reward.amount}× score`;
    if (reward.rewardType === "extra_moves") return `${reward.amount} moves`;
    return `${reward.amount} ${reward.amount === 1 ? "use" : "uses"}`;
  };

  return (
    <main className="content-page">
      <PageHeading eyebrow="Your little stash" title="Wallet" description="Your current coin balance and wallet activity." />
      <DataState query={query}>
        {(wallet) => (
          <>
            <section className="wallet-balance-card">
              <div><span className="wallet-label">AVAILABLE COINS</span><strong><span aria-hidden="true">◉</span> {wallet.balance.toLocaleString()}</strong><p>All wallet changes are recorded in your transaction history.</p></div>
              <span className="wallet-art" aria-hidden="true">🪙</span>
            </section>
            <section className="reward-economy-section">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Optional rewards</p>
                  <h2>Rewarded-ad offers</h2>
                </div>
                <span className={`provider-status ${wallet.rewardConfiguration.simulated ? "provider-status--simulation" : ""}`}>
                  {wallet.rewardConfiguration.simulated
                    ? "Development simulation"
                    : "Provider not configured"}
                </span>
              </div>
              {wallet.rewardConfiguration.simulated && (
                <p className="simulation-notice">
                  Development simulation only. No real ad is displayed or verified.
                </p>
              )}
              <p className="simulation-notice">
                Available benefits are bonus coins and a safe hint for an eligible active game. Other reward types remain unavailable until their gameplay effects are supported. Production rewards require a real provider SDK and server-side verification adapter.
              </p>
              {rewardError && <p className="form-error" role="alert">{rewardError}</p>}
              {rewardMessage && <p className="reward-message" role="status">{rewardMessage}</p>}
              {pendingReward && (
                <div className="pending-reward">
                  <span>{rewardLabels[pendingReward.rewardSession.rewardType]}</span>
                  <button
                    className="small-primary"
                    type="button"
                    disabled={secondsRemaining > 0}
                    onClick={verifyReward}
                  >
                    {secondsRemaining > 0
                      ? `Simulation ready in ${secondsRemaining}s`
                      : "Verify development simulation"}
                  </button>
                </div>
              )}
              <div className="reward-offer-grid">
                {wallet.rewardConfiguration.rewards
                  .filter((reward) => ["bonus_coins", "hint"].includes(reward.rewardType))
                  .map((reward) => (
                  <article className="reward-offer-card" key={reward.rewardType}>
                    <strong>{rewardLabels[reward.rewardType]}</strong>
                    <span>{rewardAmount(reward)}</span>
                    <small>
                      Daily limit: {reward.dailyLimit} · Cooldown: {reward.cooldownSeconds}s
                    </small>
                    {reward.rewardType !== "bonus_coins" && (
                      <small>
                        Requires a {({
                          revive: "failed",
                          double_score: "completed",
                          extra_moves: "in-progress",
                          hint: "in-progress",
                          booster: "in-progress",
                        })[reward.rewardType]} game session
                      </small>
                    )}
                    <button
                      className="control-button control-button--quiet"
                      type="button"
                      disabled={
                        !reward.enabled ||
                        !wallet.rewardConfiguration.simulated ||
                        Boolean(pendingReward) ||
                        (reward.rewardType !== "bonus_coins" &&
                          !wallet.gameSessions.some((session) => session.status === ({
                            revive: "failed",
                            double_score: "completed",
                            extra_moves: "in_progress",
                            hint: "in_progress",
                            booster: "in_progress",
                          })[reward.rewardType]))
                      }
                      onClick={() => beginReward(reward.rewardType)}
                    >
                      {!reward.enabled || !wallet.rewardConfiguration.simulated
                        ? "Unavailable"
                        : "Start development simulation"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <section className="reward-history-section">
              <div className="card-heading"><div><p className="eyebrow">Reward activity</p><h2>Reward history</h2></div></div>
              {wallet.rewardHistory.length === 0 ? (
                <EmptyState icon="🎁" title="No rewards yet" description="Verified reward grants will appear here." />
              ) : (
                <section className="content-card table-card">
                  <div className="table-heading reward-history-row"><span>REWARD</span><span>STATUS</span><span>PROVIDER</span><span>WHEN</span></div>
                  {wallet.rewardHistory.map((reward) => (
                    <div className="table-row reward-history-row" key={reward.id}>
                      <strong>{rewardLabels[reward.rewardType]}<small className="history-result">{rewardAmount(reward)}</small></strong>
                      <span className="wallet-transaction-type">{reward.status}</span>
                      <span>{reward.provider === "development_simulation" ? "Dev simulation" : "Unconfigured"}</span>
                      <span>{new Date(reward.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </section>
              )}
            </section>
            {wallet.transactions.length === 0 ? (
              <EmptyState icon="🪙" title="No wallet activity" description="Your coin transactions will appear here." />
            ) : (
              <section className="content-card table-card">
                <div className="table-heading wallet-transaction-row"><span>ACTIVITY</span><span>TYPE</span><span>DATE</span><span>AMOUNT</span></div>
                {wallet.transactions.map((transaction) => <div className="table-row wallet-transaction-row" key={transaction.id}><strong>{transaction.reason}</strong><span className="wallet-transaction-type">{transaction.type}</span><span>{new Date(transaction.createdAt).toLocaleString()}</span><strong className={transaction.type === "debit" ? "wallet-debit" : "wallet-credit"}>{transaction.type === "debit" ? "−" : "+"}{transaction.amount.toLocaleString()} coins</strong></div>)}
              </section>
            )}
          </>
        )}
      </DataState>
      <p className="mock-data-note">Rewards are simulated only when the backend development provider is explicitly enabled. No real ad provider is integrated.</p>
    </main>
  );
}

export { AchievementsPage, HistoryPage, LeaderboardPage, ProfilePage, WalletPage };

import React, { useCallback, useState } from "react";
import { useAsyncData } from "../hooks/useAsyncData.js";
import { api } from "../services/api.js";
import { DataState, PageHeading } from "../components/ScreenStates.jsx";

const rewardLabels = {
  revive: "Revive after a failed level",
  double_score: "Double score",
  bonus_coins: "Bonus coins",
  extra_moves: "Extra moves",
  hint: "Hint",
  booster: "Booster",
};

function AdminPage({ token }) {
  const loadDashboard = useCallback(() => api.getAdminDashboard(token), [token]);
  const loadConfigurations = useCallback(
    () => api.getAdminRewardConfigurations(token),
    [token],
  );
  const dashboard = useAsyncData(loadDashboard, null);
  const configurations = useAsyncData(loadConfigurations, null);
  const [updates, setUpdates] = useState({});
  const [savingReward, setSavingReward] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateField(reward, field, value) {
    setUpdates((current) => ({
      ...current,
      [reward.rewardType]: {
        ...current[reward.rewardType],
        [field]: value,
      },
    }));
  }

  async function saveConfiguration(event, reward) {
    event.preventDefault();
    setSavingReward(reward.rewardType);
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const values = {
      amount: Number(formData.get("amount")),
      dailyLimit: Number(formData.get("dailyLimit")),
      cooldownSeconds: Number(formData.get("cooldownSeconds")),
    };
    try {
      const result = await api.updateAdminRewardConfiguration(
        token,
        reward.rewardType,
        values,
      );
      setMessage(`${rewardLabels[reward.rewardType]} configuration saved (${result.changes.length} field(s) changed).`);
      setUpdates((current) => {
        const next = { ...current };
        delete next[reward.rewardType];
        return next;
      });
      await configurations.reload();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingReward("");
    }
  }

  return (
    <main className="content-page">
      <PageHeading eyebrow="Administration" title="Admin dashboard" description="Service activity and server-controlled rewarded-ad settings." />
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="reward-message" role="status">{message}</p>}

      <section className="admin-stats">
        <DataState query={dashboard}>
          {(data) => (
            <>
              <article className="stat-card stat-card--green"><span>Total users</span><strong>{data.users.total}</strong><i>♟</i><small>{data.users.active} active</small></article>
              <article className="stat-card stat-card--yellow"><span>Game sessions</span><strong>{data.gameplay.sessions}</strong><i>▦</i><small>{data.gameplay.completed} completed · {data.gameplay.failed} failed</small></article>
              <article className="stat-card stat-card--lavender"><span>Granted rewards</span><strong>{data.rewards.granted}</strong><i>✦</i><small>{data.rewards.pending} pending · {data.rewards.coinsGranted.toLocaleString()} coins granted</small></article>
            </>
          )}
        </DataState>
      </section>

      <section className="admin-configuration-section">
        <div className="card-heading">
          <div><p className="eyebrow">Server-managed</p><h2>Reward configurations</h2></div>
          <span className="provider-status">Changes are audited</span>
        </div>
        <DataState query={configurations}>
          {(configuration) => (
            <div className="admin-reward-grid">
              {configuration.rewards.map((reward) => (
                <form
                  className="admin-reward-card"
                  key={reward.rewardType}
                  onSubmit={(event) => saveConfiguration(event, reward)}
                >
                  <div className="admin-reward-heading">
                    <strong>{rewardLabels[reward.rewardType]}</strong>
                    <small>{reward.enabled ? "ENABLED" : "DISABLED"}</small>
                  </div>
                  <label>
                    Reward amount
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      required
                      value={updates[reward.rewardType]?.amount ?? reward.amount}
                      onChange={(event) => updateField(reward, "amount", event.target.value)}
                    />
                  </label>
                  <label>
                    Daily limit (0 disables)
                    <input
                      name="dailyLimit"
                      type="number"
                      min="0"
                      max="1000"
                      step="1"
                      required
                      value={updates[reward.rewardType]?.dailyLimit ?? reward.dailyLimit}
                      onChange={(event) => updateField(reward, "dailyLimit", event.target.value)}
                    />
                  </label>
                  <label>
                    Cooldown (seconds)
                    <input
                      name="cooldownSeconds"
                      type="number"
                      min="0"
                      max="86400"
                      step="1"
                      required
                      value={updates[reward.rewardType]?.cooldownSeconds ?? reward.cooldownSeconds}
                      onChange={(event) => updateField(reward, "cooldownSeconds", event.target.value)}
                    />
                  </label>
                  <button className="control-button control-button--primary" type="submit" disabled={savingReward === reward.rewardType}>
                    {savingReward === reward.rewardType ? "Saving…" : "Save configuration"}
                  </button>
                </form>
              ))}
            </div>
          )}
        </DataState>
      </section>
    </main>
  );
}

export default AdminPage;

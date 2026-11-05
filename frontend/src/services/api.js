import { createApiRequest } from "./apiRequest.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");
const request = createApiRequest({ apiBaseUrl });

export const api = {
  login(credentials) {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });
  },

  register(details) {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: details.name,
        email: details.email,
        password: details.password,
      }),
    });
  },

  getCurrentUser() {
    return request("/api/auth/me");
  },

  updateProfile(_token, updates) {
    return request("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  logout() {
    return request("/api/auth/logout", {
      method: "POST",
    });
  },

  getDashboard() {
    return request("/api/player/dashboard");
  },

  getWalletBalance() {
    return request("/api/wallet/balance");
  },

  purchaseHint(requestId) {
    return request("/api/wallet/hints", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
  },

  getProgress() {
    return request("/api/player/progress");
  },

  startGameSession(_token, levelNumber) {
    return request("/api/player/sessions", {
      method: "POST",
      body: JSON.stringify({ levelNumber }),
    });
  },

  saveGameActions(_token, sessionId, actions, options = {}) {
    return request(`/api/player/sessions/${sessionId}/actions`, {
      method: "PUT",
      body: JSON.stringify({ actions }),
      ...options,
    });
  },

  getHistory() {
    return request("/api/player/history").then((result) => result.history);
  },

  getLeaderboard() {
    return request("/api/player/leaderboard").then((result) => result.players);
  },

  async getProfile() {
    const [profile, dashboard, progress] = await Promise.all([
      request("/api/auth/me"),
      request("/api/player/dashboard"),
      request("/api/player/progress"),
    ]);
    return {
      player: profile.user,
      stats: {
        completedLevels: dashboard.stats.completedLevels,
        totalScore: dashboard.stats.totalScore,
        totalStars: progress.levels.reduce(
          (total, level) => total + (level.status === "completed" ? level.stars : 0),
          0,
        ),
      },
    };
  },

  getAchievements() {
    return request("/api/achievements").then((result) => result.achievements);
  },

  getAdminDashboard() {
    return request("/api/admin/dashboard");
  },

  getAdminRewardConfigurations() {
    return request("/api/admin/reward-configurations");
  },

  updateAdminRewardConfiguration(_token, rewardType, updates) {
    return request(`/api/admin/reward-configurations/${rewardType}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  async getWallet() {
    const [wallet, history, rewardConfiguration, rewardHistory, gameHistory] = await Promise.all([
      request("/api/wallet/balance"),
      request("/api/wallet/transactions"),
      request("/api/rewards/configuration"),
      request("/api/rewards/history"),
      request("/api/player/history"),
    ]);
    return {
      ...wallet,
      rewardConfiguration,
      rewardHistory: rewardHistory.rewards,
      gameSessions: gameHistory.history,
      transactions: history.transactions.map((transaction) => ({
        id: transaction.id,
        reason: transaction.reason,
        type: transaction.type,
        createdAt: transaction.createdAt,
        amount: transaction.amount,
        referenceId: transaction.referenceId,
      })),
    };
  },

  startReward(_token, rewardType, referenceId) {
    return request("/api/rewards/sessions", {
      method: "POST",
      body: JSON.stringify({
        rewardType,
        ...(referenceId ? { referenceId } : {}),
      }),
    });
  },

  verifyReward(_token, sessionId) {
    return request(`/api/rewards/sessions/${sessionId}/verify`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};

import { randomUUID } from "node:crypto";

export class RewardVerificationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "RewardVerificationError";
    this.statusCode = statusCode;
  }
}

export class RewardProviderAdapter {
  constructor({ name, isSimulation = false }) {
    if (typeof name !== "string" || name.trim().length < 2) {
      throw new Error("A reward provider adapter requires a name.");
    }
    this.name = name;
    this.isSimulation = isSimulation;
  }

  async verify() {
    throw new Error("Reward provider adapters must implement verify().");
  }
}

export class DisabledRewardProvider extends RewardProviderAdapter {
  constructor() {
    super({ name: "unconfigured" });
  }

  async verify() {
    throw new RewardVerificationError(503, "Rewarded ads are unavailable because no ad provider is configured.");
  }
}

export class DevelopmentSimulationProvider extends RewardProviderAdapter {
  constructor({ minimumWatchSeconds = 5, nodeEnvironment = process.env.NODE_ENV } = {}) {
    if (!Number.isSafeInteger(minimumWatchSeconds) || minimumWatchSeconds < 1 || minimumWatchSeconds > 300) {
      throw new Error("REWARD_SIMULATION_MIN_WATCH_SECONDS must be an integer from 1 to 300.");
    }
    super({ name: "development_simulation", isSimulation: true });
    this.nodeEnvironment = nodeEnvironment;
    this.minimumWatchSeconds = minimumWatchSeconds;
  }

  async verify(rewardSession, now = new Date()) {
    if (this.nodeEnvironment === "production") {
      throw new RewardVerificationError(
        503,
        "Development reward simulation is disabled in production.",
      );
    }
    if (now.getTime() - rewardSession.createdAt.getTime() < this.minimumWatchSeconds * 1000) {
      throw new RewardVerificationError(
        425,
        `Development simulation is not ready yet. Wait ${this.minimumWatchSeconds} seconds.`,
      );
    }
    return {
      verified: true,
      verificationId: `dev-sim-${randomUUID()}`,
      verifiedAt: now,
      provider: this.name,
    };
  }
}

export function createRewardProvider({
  providerName = process.env.REWARDED_AD_PROVIDER ||
    (process.env.NODE_ENV === "production" ? "unconfigured" : "development_simulation"),
  nodeEnvironment = process.env.NODE_ENV,
  minimumWatchSeconds = Number(process.env.REWARD_SIMULATION_MIN_WATCH_SECONDS || 5),
  providerAdapters = {},
} = {}) {
  if (providerName === "development_simulation" && nodeEnvironment !== "production") {
    return new DevelopmentSimulationProvider({ minimumWatchSeconds, nodeEnvironment });
  }
  return providerAdapters[providerName] || new DisabledRewardProvider();
}

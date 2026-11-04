import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Achievement from "../../src/models/Achievement.js";
import GameSession from "../../src/models/GameSession.js";
import LevelProgress from "../../src/models/LevelProgress.js";
import RewardConfiguration from "../../src/models/RewardConfiguration.js";
import RewardSession from "../../src/models/RewardSession.js";
import RewardUsage from "../../src/models/RewardUsage.js";
import User from "../../src/models/User.js";
import Wallet from "../../src/models/Wallet.js";
import WalletTransaction from "../../src/models/WalletTransaction.js";

const backendDirectory = fileURLToPath(new URL("../..", import.meta.url));
const integrationJwtSecret = "isolated-mongodb-integration-secret-0123456789";
const models = [
  Achievement,
  GameSession,
  LevelProgress,
  RewardConfiguration,
  RewardSession,
  RewardUsage,
  User,
  Wallet,
  WalletTransaction,
];

export function validateTestDatabaseUri(environment) {
  const uri = environment.MONGODB_TEST_URI?.trim();
  if (!uri) return null;

  if (environment.NODE_ENV === "production") {
    throw new Error("MongoDB integration tests cannot run with NODE_ENV=production.");
  }
  if (uri === environment.MONGODB_URI) {
    throw new Error("MONGODB_TEST_URI must not equal MONGODB_URI.");
  }

  const match = /^mongodb(?:\+srv)?:\/\/([^/?#]+)\/([^/?#]+)(?:\?.*)?$/i.exec(uri);
  if (!match || !/^apple_worm_adventure_test_[a-z0-9_]+$/i.test(match[2])) {
    throw new Error(
      "MONGODB_TEST_URI must target a database named apple_worm_adventure_test_<suffix>.",
    );
  }

  const hosts = match[1].slice(match[1].lastIndexOf("@") + 1).split(",");
  const isLoopback = hosts.every((host) =>
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host));
  if (!isLoopback) {
    throw new Error(
      "MongoDB integration tests only allow loopback hosts; remote databases are not supported.",
    );
  }

  return uri;
}

export const testDatabaseUri = validateTestDatabaseUri(process.env);
export const databaseTestSkipReason = testDatabaseUri
  ? false
  : "Set MONGODB_TEST_URI to an isolated apple_worm_adventure_test_<suffix> database.";

async function findAvailablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function startBackend(port, scopedDatabaseUri) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      MONGODB_URI: scopedDatabaseUri,
      JWT_SECRET: integrationJwtSecret,
      JWT_EXPIRES_IN: "1h",
      FRONTEND_ORIGIN: "http://localhost:5173",
      REWARDED_AD_PROVIDER: "development_simulation",
      REWARD_SIMULATION_MIN_WATCH_SECONDS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Test backend exited before readiness.\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`);
      const report = await response.json();
      if (response.ok && report.database?.connected === true) {
        return { child, baseUrl, output: () => output };
      }
    } catch {
      await delay(100);
    }
    await delay(100);
  }

  await stopBackend({ child });
  throw new Error(`Test backend did not become ready within 20 seconds.\n${output}`);
}

async function stopBackend(backend) {
  if (!backend || backend.child.exitCode !== null || backend.child.signalCode !== null) return;
  const exited = new Promise((resolve) => backend.child.once("exit", resolve));
  backend.child.kill("SIGTERM");
  const stoppedGracefully = await Promise.race([
    exited.then(() => true),
    delay(5000).then(() => false),
  ]);
  if (!stoppedGracefully && backend.child.exitCode === null && backend.child.signalCode === null) {
    const forcedExit = new Promise((resolve) => backend.child.once("exit", resolve));
    backend.child.kill("SIGKILL");
    await forcedExit;
  }
}

async function deleteTestUser(userId) {
  const ownerId = new mongoose.Types.ObjectId(userId);
  await Promise.all([
    Achievement.deleteMany({ user: ownerId }),
    GameSession.deleteMany({ user: ownerId }),
    LevelProgress.deleteMany({ user: ownerId }),
    RewardSession.deleteMany({ user: ownerId }),
    RewardUsage.deleteMany({ user: ownerId }),
    WalletTransaction.deleteMany({ user: ownerId }),
    Wallet.deleteMany({ user: ownerId }),
  ]);
  await User.deleteOne({ _id: ownerId });
}

export async function createIntegrationContext({ databaseSuffix = "default" } = {}) {
  assert.ok(testDatabaseUri, databaseTestSkipReason);
  assert.match(databaseSuffix, /^[a-z0-9_]+$/i);
  const uriParts = /^(mongodb(?:\+srv)?:\/\/[^/]+\/)([^?]+)(.*)$/i.exec(testDatabaseUri);
  assert.ok(uriParts, "The validated MongoDB test URI must contain a database name.");
  const scopedDatabaseUri =
    `${uriParts[1]}${uriParts[2]}_${databaseSuffix}${uriParts[3]}`;
  assert.notEqual(scopedDatabaseUri, process.env.MONGODB_URI);
  const port = await findAvailablePort();
  let backend;
  const userIds = new Set();
  try {
    backend = await startBackend(port, scopedDatabaseUri);
    await mongoose.connect(scopedDatabaseUri, { serverSelectionTimeoutMS: 5000 });
    await Promise.all(models.map((model) => model.init()));
  } catch (error) {
    await stopBackend(backend);
    await mongoose.disconnect();
    throw error;
  }

  async function request(path, {
    method = "GET",
    body,
    cookie,
    token,
    headers = {},
  } = {}) {
    const response = await fetch(`${backend.baseUrl}${path}`, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return {
      response,
      body: await response.json().catch(() => ({})),
    };
  }

  async function register(displayName) {
    const email = `integration-${randomUUID()}@example.test`;
    const password = "integration-test-password";
    const result = await request("/api/auth/register", {
      method: "POST",
      body: { displayName, email, password },
    });
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    userIds.add(result.body.user.id);
    return { ...result, email, password };
  }

  async function login(email, password) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const setCookie = result.response.headers.get("set-cookie");
    assert.ok(setCookie, "login should set the HttpOnly session cookie");
    return { ...result, cookie: setCookie.split(";")[0] };
  }

  return {
    get baseUrl() { return backend.baseUrl; },
    request,
    register,
    login,
    async restartBackend() {
      await stopBackend(backend);
      backend = await startBackend(port, scopedDatabaseUri);
    },
    async close() {
      await stopBackend(backend);
      try {
        for (const userId of userIds) await deleteTestUser(userId);
      } finally {
        await mongoose.disconnect();
      }
    },
  };
}

export function routeActions(level) {
  const route = [];
  for (let row = 0; row < level.board.rows; row += 2) {
    const forward = route.length === 0 || route.at(-1).column === 0;
    const columns = forward
      ? Array.from({ length: level.board.columns }, (_, column) => column)
      : Array.from({ length: level.board.columns }, (_, column) => level.board.columns - column - 1);
    for (const column of columns) route.push({ row, column });
    if (row + 1 < level.board.rows) {
      route.push({ row: row + 1, column: route.at(-1).column });
    }
  }
  const directions = [];
  for (let index = level.board.worm.length; index < route.length; index += 1) {
    const previous = route[index - 1];
    const next = route[index];
    directions.push(
      next.row < previous.row ? "up" :
        next.row > previous.row ? "down" :
          next.column < previous.column ? "left" : "right",
    );
  }
  return directions;
}

export const waitForSimulation = () => delay(1100);

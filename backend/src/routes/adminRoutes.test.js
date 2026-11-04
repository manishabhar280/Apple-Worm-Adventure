import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createAdminRouter } from "./adminRoutes.js";
import { createAdminService } from "../services/adminService.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
const playerId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const adminId = "bbbbbbbbbbbbbbbbbbbbbbbb";

function tokenFor(id) {
  return jwt.sign({ sub: id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "apple-worm-adventure",
    audience: "apple-worm-adventure-client",
  });
}

function createConfigModel(configurations) {
  return {
    findOne(filter) {
      return {
        session() {
          return Promise.resolve(configurations.find((entry) => entry.rewardType === filter.rewardType) || null);
        },
      };
    },
  };
}

async function createServer({ adminService } = {}) {
  const users = new Map([
    [playerId, { _id: playerId, role: "player", isActive: true }],
    [adminId, { _id: adminId, role: "admin", isActive: true }],
  ]);
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({
    UserModel: { findById: (id) => Promise.resolve(users.get(String(id)) || null) },
    adminService: adminService || {
      getDashboard: async () => ({ users: { total: 2, active: 2 } }),
      updateRewardConfiguration: async (_admin, rewardType, updates) => ({ rewardType, updates }),
    },
    rewardService: { getConfiguration: async () => ({ rewards: [] }) },
  }));
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

async function request(context, path, { id = playerId, method = "GET", body } = {}) {
  const response = await fetch(`${context.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFor(id)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}

test("admin endpoints reject players and allow admins to view the dashboard", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const playerDashboard = await request(context, "/api/admin/dashboard");
  const playerConfigurations = await request(context, "/api/admin/reward-configurations");
  const adminDashboard = await request(context, "/api/admin/dashboard", { id: adminId });
  const adminConfigurations = await request(context, "/api/admin/reward-configurations", { id: adminId });

  assert.equal(playerDashboard.response.status, 403);
  assert.equal(playerConfigurations.response.status, 403);
  assert.equal(adminDashboard.response.status, 200);
  assert.equal(adminConfigurations.response.status, 200);
  assert.equal(adminDashboard.body.users.total, 2);
});

test("reward configuration updates validate inputs and atomically record audit changes", async (t) => {
  const configurations = [{
    rewardType: "bonus_coins",
    amount: 25,
    dailyLimit: 3,
    cooldownSeconds: 60,
    enabled: true,
    description: "Earn bonus coins.",
    save: async () => {},
  }];
  const auditRecords = [];
  const AdminAuditLogModel = {
    async create(records) { auditRecords.push(...records); },
  };
  const adminService = createAdminService({
    RewardConfigurationModel: createConfigModel(configurations),
    AdminAuditLogModel,
    startSession: async () => ({
      withTransaction: (operation) => operation(),
      endSession: async () => {},
    }),
  });
  const context = await createServer({ adminService });
  t.after(context.close);

  const invalid = await request(context, "/api/admin/reward-configurations/bonus_coins", {
    id: adminId,
    method: "PATCH",
    body: { amount: -1 },
  });
  const updated = await request(context, "/api/admin/reward-configurations/bonus_coins", {
    id: adminId,
    method: "PATCH",
    body: { amount: 40, dailyLimit: 5, cooldownSeconds: 120 },
  });
  const playerUpdate = await request(context, "/api/admin/reward-configurations/bonus_coins", {
    method: "PATCH",
    body: { amount: 1 },
  });

  assert.equal(invalid.response.status, 400);
  assert.equal(updated.response.status, 200);
  assert.equal(configurations[0].amount, 40);
  assert.equal(configurations[0].dailyLimit, 5);
  assert.equal(configurations[0].cooldownSeconds, 120);
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].admin, adminId);
  assert.equal(auditRecords[0].changes.length, 3);
  assert.equal(playerUpdate.response.status, 403);
});

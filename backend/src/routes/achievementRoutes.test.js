import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import test from "node:test";
import { errorHandler } from "../middleware/errorHandler.js";
import { createAchievementRouter } from "./achievementRoutes.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
const playerId = "aaaaaaaaaaaaaaaaaaaaaaaa";

function tokenFor(id) {
  return jwt.sign({ sub: id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "apple-worm-adventure",
    audience: "apple-worm-adventure-client",
  });
}

async function createServer() {
  const app = express();
  app.use("/api/achievements", createAchievementRouter({
    UserModel: {
      findById: (id) => Promise.resolve(
        id === playerId
          ? { _id: playerId, role: "player", isActive: true }
          : null,
      ),
    },
    achievementService: {
      updateProgress: async (user) => [{
        key: "first-level",
        userId: String(user._id),
        progress: 1,
        target: 1,
        unlocked: true,
      }],
    },
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

test("achievement endpoint requires authentication and returns caller-scoped progress", async (t) => {
  const context = await createServer();
  t.after(context.close);
  const unauthorized = await fetch(`${context.url}/api/achievements`);
  const ownProgress = await fetch(`${context.url}/api/achievements`, {
    headers: { Authorization: `Bearer ${tokenFor(playerId)}` },
  });
  const body = await ownProgress.json();

  assert.equal(unauthorized.status, 401);
  assert.equal(ownProgress.status, 200);
  assert.equal(body.achievements[0].userId, playerId);
});

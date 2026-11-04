import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { once } from "node:events";
import test from "node:test";
import { authCookieName, createAuthenticate, requireRole } from "../middleware/authenticate.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { createAuthRouter } from "./authRoutes.js";
import { createAuthService } from "../services/authService.js";

process.env.JWT_SECRET ??= "test_only_secret_that_is_not_used_in_production_12345";
process.env.JWT_EXPIRES_IN = "15m";

function createUserRepository() {
  const users = [];
  let nextId = 1;

  return {
    users,
    findOne({ email }) {
      const result = () => Promise.resolve(users.find((user) => user.email === email) || null);
      return {
        select: result,
        then: (resolve, reject) => result().then(resolve, reject),
      };
    },
    async create(values) {
      if (users.some((user) => user.email === values.email)) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }
      const user = {
        ...values,
        _id: String(nextId++),
        avatar: "",
        isActive: true,
        tokenVersion: 0,
        createdAt: new Date(),
      };
      users.push(user);
      return user;
    },
    async findById(id) {
      return users.find((user) => user._id === String(id)) || null;
    },
    async findByIdAndUpdate(id, update) {
      const user = users.find((item) => item._id === String(id));
      if (!user) {
        return null;
      }
      Object.assign(user, update.$set);
      for (const [field, amount] of Object.entries(update.$inc || {})) {
        user[field] = (user[field] || 0) + amount;
      }
      return user;
    },
  };
}

async function createTestServer() {
  const User = createUserRepository();
  const authService = createAuthService({ User });
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({ UserModel: User, authService }));
  app.get(
    "/api/admin",
    createAuthenticate(authService),
    requireRole("admin"),
    (_request, response) => response.json({ access: "granted" }),
  );
  app.use(errorHandler);

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    User,
    baseUrl,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function jsonRequest(baseUrl, path, { token, cookie, ...options } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  return { response, body: await response.json() };
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";")[0];
}

test("registration hashes the password and issues an HttpOnly session cookie", async (t) => {
  const context = await createTestServer();
  t.after(context.close);

  const { response, body } = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Apple Worm",
      email: "PLAYER@EXAMPLE.TEST",
      password: "orchard-password-1",
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(body.user.displayName, "Apple Worm");
  assert.equal(body.user.email, "player@example.test");
  assert.equal(body.user.role, "player");
  assert.equal(body.token, undefined);
  assert.match(response.headers.get("set-cookie"), new RegExp(`^${authCookieName}=`));
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal("passwordHash" in body.user, false);
  assert.notEqual(context.User.users[0].passwordHash, "orchard-password-1");
  assert.match(context.User.users[0].passwordHash, /^\$2[aby]\$/);
});

test("login issues a session cookie only for valid credentials", async (t) => {
  const context = await createTestServer();
  t.after(context.close);

  await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "player@example.test",
      password: "correct-horse-42",
    }),
  });
  const { response, body } = await jsonRequest(context.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "PLAYER@example.test",
      password: "correct-horse-42",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.token, undefined);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal(body.user.email, "player@example.test");
});

test("production session cookies use Secure and cross-origin SameSite attributes", async (t) => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });
  const context = await createTestServer();
  t.after(context.close);
  const { response } = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "player@example.test",
      password: "correct-horse-42",
    }),
  });

  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /; Secure/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=None/i);
});

test("invalid email or password returns the same unauthorized response", async (t) => {
  const context = await createTestServer();
  t.after(context.close);

  await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "player@example.test",
      password: "correct-horse-42",
    }),
  });

  const wrongPassword = await jsonRequest(context.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "player@example.test", password: "wrong-password" }),
  });
  const unknownEmail = await jsonRequest(context.baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "missing@example.test", password: "wrong-password" }),
  });

  assert.equal(wrongPassword.response.status, 401);
  assert.equal(unknownEmail.response.status, 401);
  assert.equal(wrongPassword.body.error.message, unknownEmail.body.error.message);
});

test("protected profile routes require a token, allow profile updates, and logout", async (t) => {
  const context = await createTestServer();
  t.after(context.close);

  const unauthorized = await jsonRequest(context.baseUrl, "/api/auth/me");
  assert.equal(unauthorized.response.status, 401);

  const registered = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "player@example.test",
      password: "correct-horse-42",
    }),
  });
  const cookie = sessionCookie(registered.response);
  const origin = "http://localhost:5173";
  const profile = await jsonRequest(context.baseUrl, "/api/auth/me", { cookie });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.user.email, "player@example.test");

  const updated = await jsonRequest(context.baseUrl, "/api/auth/me", {
    cookie,
    method: "PATCH",
    body: JSON.stringify({ displayName: "New Orchard Name", avatar: "worm.png" }),
    headers: { Origin: origin },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.user.displayName, "New Orchard Name");
  assert.equal("passwordHash" in updated.body.user, false);

  const logout = await jsonRequest(context.baseUrl, "/api/auth/logout", {
    cookie,
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(logout.response.status, 200);
  assert.match(logout.body.message, /Logged out/);
  assert.match(logout.response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/i);
  const revoked = await jsonRequest(context.baseUrl, "/api/auth/me", { cookie });
  assert.equal(revoked.response.status, 401);
  assert.equal(context.User.users[0].tokenVersion, 1);
});

test("player tokens are denied admin access and invalid tokens are rejected", async (t) => {
  const context = await createTestServer();
  t.after(context.close);

  const registered = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "player@example.test",
      password: "correct-horse-42",
    }),
  });

  const forbidden = await jsonRequest(context.baseUrl, "/api/admin", {
    cookie: sessionCookie(registered.response),
  });
  context.User.users[0].role = "admin";
  const allowedAdmin = await jsonRequest(context.baseUrl, "/api/admin", {
    cookie: sessionCookie(registered.response),
  });

  const invalidToken = await jsonRequest(context.baseUrl, "/api/auth/me", {
    token: "not-a-valid-token",
  });

  assert.equal(forbidden.response.status, 403);
  assert.equal(allowedAdmin.response.status, 200);
  assert.deepEqual(allowedAdmin.body, { access: "granted" });
  assert.equal(invalidToken.response.status, 401);
});

test("expired JWTs are rejected", async (t) => {
  const context = await createTestServer();
  t.after(context.close);
  await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "player@example.test",
      password: "correct-horse-42",
    }),
  });
  const expiredToken = jwt.sign(
    { sub: context.User.users[0]._id, tokenVersion: 0 },
    process.env.JWT_SECRET,
    {
      expiresIn: -1,
      issuer: "apple-worm-adventure",
      audience: "apple-worm-adventure-client",
    },
  );
  const result = await jsonRequest(context.baseUrl, "/api/auth/me", { token: expiredToken });
  assert.equal(result.response.status, 401);
});

test("registration validates input and rejects duplicate accounts", async (t) => {
  const context = await createTestServer();
  t.after(context.close);

  const invalid = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "X",
      email: "not-an-email",
      password: "short",
      role: "admin",
    }),
  });
  assert.equal(invalid.response.status, 400);
  const tooManyPasswordBytes = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Orchard Player",
      email: "utf8@example.test",
      password: "é".repeat(37),
    }),
  });
  assert.equal(tooManyPasswordBytes.response.status, 400);

  const validBody = JSON.stringify({
    displayName: "Orchard Player",
    email: "player@example.test",
    password: "correct-horse-42",
  });
  await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: validBody,
  });
  const duplicate = await jsonRequest(context.baseUrl, "/api/auth/register", {
    method: "POST",
    body: validBody,
  });

  assert.equal(duplicate.response.status, 409);
});

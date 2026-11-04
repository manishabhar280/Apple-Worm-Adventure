import { expect, test } from "@playwright/test";

const frontendOrigin = "http://127.0.0.1:4173";

function createApiState() {
  return {
    user: null,
    session: null,
    balance: 25,
    transactions: [],
    purchases: new Map(),
  };
}

async function mockApi(page, state) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const corsHeaders = {
      "access-control-allow-origin": frontendOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type",
      "content-type": "application/json",
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    let status = 200;
    let body = {};
    if (path === "/api/auth/me") {
      status = state.user ? 200 : 401;
      body = state.user ? { user: state.user } : { error: { message: "Unauthorized" } };
    } else if (path === "/api/auth/register" || path === "/api/auth/login") {
      state.user = {
        id: "000000000000000000000001",
        displayName: "Apple Explorer",
        email: "apple@example.test",
        avatar: "",
        role: "player",
        createdAt: new Date().toISOString(),
      };
      body = { user: state.user };
      status = path.endsWith("/register") ? 201 : 200;
    } else if (path === "/api/auth/logout") {
      state.user = null;
      body = { message: "Logged out successfully." };
    } else if (path === "/api/player/progress") {
      body = {
        unlockedLevel: 1,
        levels: [],
        activeSession: state.session,
      };
    } else if (path === "/api/player/dashboard") {
      body = {
        stats: {
          completedLevels: 0,
          totalLevels: 50,
          totalScore: 0,
          totalMoves: state.session?.moves || 0,
          unlockedLevel: 1,
        },
        resume: state.session
          ? {
              levelNumber: state.session.levelNumber,
              sessionId: state.session.id,
              actions: state.session.actions,
            }
          : { levelNumber: 1, sessionId: null, actions: [] },
        recentActivity: [],
      };
    } else if (path === "/api/player/sessions" && request.method() === "POST") {
      state.session = {
        id: "000000000000000000000002",
        levelNumber: 1,
        status: "in_progress",
        score: 0,
        moves: 0,
        stars: 0,
        actions: [],
      };
      status = 201;
      body = { session: state.session };
    } else if (/^\/api\/player\/sessions\/[^/]+\/actions$/.test(path)) {
      const { actions } = request.postDataJSON();
      state.session = {
        ...state.session,
        actions,
        moves: actions.length,
        status: "in_progress",
      };
      body = {
        session: state.session,
        progress: {
          unlockedLevel: 1,
          levels: [],
          activeSession: state.session,
        },
      };
    } else if (path === "/api/player/leaderboard") {
      body = { players: [] };
    } else if (path === "/api/player/history") {
      body = { history: [] };
    } else if (path === "/api/achievements") {
      body = { achievements: [] };
    } else if (path === "/api/wallet/balance") {
      body = { balance: state.balance, currency: "COIN" };
    } else if (path === "/api/wallet/transactions") {
      body = { transactions: state.transactions };
    } else if (path === "/api/wallet/hints" && request.method() === "POST") {
      const { requestId } = request.postDataJSON();
      const existing = state.purchases.get(requestId);
      if (existing) {
        body = { ...existing, duplicate: true };
      } else if (state.balance < 5) {
        status = 409;
        body = { error: { message: "Insufficient coin balance." } };
      } else {
        state.balance -= 5;
        const transaction = {
          id: requestId,
          type: "debit",
          amount: 5,
          reason: "Gameplay hint",
          source: "gameplay",
          referenceId: requestId,
          createdAt: new Date().toISOString(),
        };
        state.transactions.push(transaction);
        body = {
          balance: state.balance,
          currency: "COIN",
          transaction,
          duplicate: false,
        };
        state.purchases.set(requestId, body);
      }
    } else if (path === "/api/rewards/configuration") {
      body = {
        provider: "unconfigured",
        simulated: false,
        rewards: ["bonus_coins", "hint"].map((rewardType) => ({
          rewardType,
          amount: rewardType === "bonus_coins" ? 25 : 1,
          description: "Unavailable in this browser test.",
          enabled: false,
          dailyLimit: 3,
          cooldownSeconds: 60,
        })),
      };
    } else if (path === "/api/rewards/history") {
      body = { rewards: [] };
    }

    await route.fulfill({
      status,
      headers: corsHeaders,
      body: JSON.stringify(body),
    });
  });
}

async function registerPlayer(page) {
  await page.goto("/register");
  await page.getByLabel("Player name").fill("Apple Explorer");
  await page.getByLabel("Email address").fill("apple@example.test");
  await page.getByLabel("Password").fill("integration-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Hello, Apple!" })).toBeVisible();
}

test("registers, plays, saves, reloads, and resumes an authenticated game", async ({ page }) => {
  const state = createApiState();
  await mockApi(page, state);

  await page.goto("/wallet");
  await expect(page).toHaveURL(/\/login$/);
  await registerPlayer(page);

  await page.getByRole("button", { name: "Resume level 1" }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(
    page.getByRole("region", { name: "Puzzle board" })
      .getByRole("heading", { name: "First Harvest" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => state.session?.actions.length).toBe(1);
  await page.getByRole("button", { name: /Hint · 5 coins/ }).click();
  await expect(page.getByRole("status")).toContainText(/Hint purchased for 5 coins \(20 remaining\)/);
  expect(state.balance).toBe(20);
  expect(state.transactions).toHaveLength(1);

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello, Apple!" })).toBeVisible();
  await page.getByRole("button", { name: "Resume level 1" }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator(".game-status-label")).toHaveText("playing");
});

test("wallet and leaderboard navigation works at desktop and mobile widths", async ({ page }) => {
  const state = createApiState();
  await mockApi(page, state);
  await registerPlayer(page);

  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
  await expect(page.getByText("Provider not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unavailable" }).first()).toBeDisabled();
  await expect(page.locator(".wallet-balance-card strong")).toContainText("25");
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The orchard levels" })).toBeVisible();
  await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
  const viewportHasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(viewportHasNoHorizontalOverflow).toBe(true);
});

import { expect, test } from "@playwright/test";
import { TOTAL_LEVELS } from "../../shared/levelData.js";
import {
  createDefaultGuestProgress,
  GUEST_PROGRESS_STORAGE_KEY,
} from "../src/data/guestProgress.js";
import { levels } from "../src/data/levelData.js";

async function trackApiRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      requests.push(request.url());
    }
  });
  return requests;
}
cd
async function readGuestProgress(page) {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key)),
    GUEST_PROGRESS_STORAGE_KEY,
  );
}

async function dispatchTouchSwipe(session, start, end) {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: start.x, y: start.y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: start.x + (end.x - start.x) * 0.6, y: start.y + (end.y - start.y) * 0.6 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: end.x, y: end.y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function completeLevelOne(page) {
  const route = [];
  for (let row = 0; row < 9; row += 2) {
    const columns = route.length === 0 || route.at(-1).column === 0
      ? Array.from({ length: 9 }, (_, column) => column)
      : Array.from({ length: 9 }, (_, column) => 8 - column);
    for (const column of columns) route.push({ row, column });
    if (row + 1 < 9) {
      route.push({ row: row + 1, column: route.at(-1).column });
    }
  }

  let collectedApple = false;
  let remainingApples = await page.locator(".board-apple").count();
  for (let index = 3; index < route.length; index += 1) {
    const previous = route[index - 1];
    const next = route[index];
    const key = next.row < previous.row
      ? "ArrowUp"
      : next.row > previous.row
        ? "ArrowDown"
        : next.column < previous.column
          ? "ArrowLeft"
          : "ArrowRight";
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
    const applesAfterMove = await page.locator(".board-apple").count();
    if (applesAfterMove < remainingApples) {
      collectedApple = true;
      await expect(page.locator(".apple-collection-effect")).toBeAttached();
    }
    remainingApples = applesAfterMove;
  }
  return collectedApple;
}

test("starts immediately as a guest without authentication requests or account UI", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: /PLAY NOW/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in|log in|sign up|create account/i })).toHaveCount(0);
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(
    page.getByRole("region", { name: "Puzzle board" })
      .getByRole("heading", { name: "First Harvest" }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("keyboard navigation reaches every guest page without browser errors or unhandled rejections", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  await page.addInitScript(() => {
    window.__qaUnhandledRejections = [];
    window.addEventListener("unhandledrejection", (event) => {
      window.__qaUnhandledRejections.push(String(event.reason));
    });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/levels");
  const pages = [
    { navigation: "Statistics", heading: "Player statistics", path: "/statistics" },
    { navigation: "Achievements", heading: "Achievements", path: "/achievements" },
    { navigation: "Settings", heading: "Settings", path: "/settings" },
    { navigation: "Daily Challenge", heading: "Daily Challenge", path: "/daily" },
    { navigation: "Worm Collection", heading: "Worm Collection", path: "/collection" },
    { navigation: "Levels", heading: "The 100-level journey", path: "/levels" },
  ];

  for (const destination of pages) {
    const navigationButton = page.getByRole("button", {
      name: destination.navigation,
      exact: true,
    });
    await navigationButton.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(page.getByRole("heading", {
      name: destination.heading,
      exact: true,
    })).toBeVisible();
  }

  const homeButton = page.getByRole("button", {
    name: "Home",
    exact: true,
  });
  await homeButton.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: /PLAY NOW/ })).toBeVisible();
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  await expect(page.getByRole("grid", { name: "Level 1 game board" })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => window.__qaUnhandledRejections)).toEqual([]);
});

test("renders configured collectibles and exposes daily challenge and cosmetic pages", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apple-worm-adventure.guest-progress", JSON.stringify({
      version: 1,
      unlockedLevel: 5,
      records: {
        1: { score: 100, moves: 8, stars: 2 },
        2: { score: 100, moves: 12, stars: 2 },
        3: { score: 100, moves: 18, stars: 2 },
        4: { score: 100, moves: 26, stars: 2 },
      },
      activeGame: { levelNumber: 5, actions: [] },
      settings: { reducedMotion: false },
    }));
  });
  await page.goto("/game");
  await expect(page.getByRole("grid", { name: "Level 5 game board" })).toBeVisible();
  await expect(page.locator(".board-cell--golden-apple")).toHaveCount(1);

  await page.getByRole("button", { name: "Daily Challenge", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daily Challenge" })).toBeVisible();
  await expect(page.locator(".daily-challenge-reward")).toContainText("local cosmetic progress");
  await expect(page.getByRole("button", { name: "Resume Level 5" })).toBeVisible();
  const savedProgress = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("apple-worm-adventure.guest-progress")));
  expect(savedProgress.activeGame.levelNumber).toBe(5);

  await page.getByRole("button", { name: "Worm Collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Worm Collection" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Worm skin preview" })).toBeVisible();
  await expect(page.locator(".worm-skin-card")).toHaveCount(5);
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 780 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `collection should fit a ${width}px viewport`,
    ).toBe(true);
  }
});

test("starts a daily challenge without advancing regular level unlocks", async ({ page }) => {
  await page.goto("/daily");
  await page.getByRole("button", { name: "Start today's challenge" }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByRole("region", { name: "Puzzle board" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem("apple-worm-adventure.guest-progress"));
    return {
      unlockedLevel: progress.unlockedLevel,
      challengeDate: progress.activeGame?.challengeDate,
    };
  })).toEqual({
    unlockedLevel: 1,
    challengeDate: expect.any(String),
  });
});

test("collects a golden apple, persists its reward, and prevents replay reward farming", async ({ page }) => {
  const progress = createDefaultGuestProgress();
  progress.unlockedLevel = 5;
  progress.records = Object.fromEntries(levels.slice(0, 4).map((level) => [
    level.number,
    { score: 100, moves: level.parMoves, stars: 2 },
  ]));
  progress.activeGame = { levelNumber: 5, actions: [] };
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, { key: GUEST_PROGRESS_STORAGE_KEY, value: progress });

  const actions = [
    "down", "down", "down", "down", "right", "up", "up", "up",
    "right", "right", "right", "right", "down", "left", "left",
    "down", "down", "down", "down", "down", "down", "right", "right", "right",
  ];
  const keyForDirection = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  };
  await page.goto("/game");
  await expect(page.getByRole("grid", { name: "Level 5 game board" })).toBeVisible();

  async function completeGoldenRoute() {
    for (const [index, direction] of actions.entries()) {
      await page.keyboard.press(keyForDirection[direction]);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      if (index < actions.length - 1) {
        await expect.poll(async () =>
          (await readGuestProgress(page)).activeGame?.actions.length ?? 0,
        ).toBe(index + 1);
      }
    }
    await expect(page.locator(".game-status-label")).toHaveText("won");
    await expect(page.locator(".collectible-goal-hud"))
      .toContainText("Golden Apple 1/1");
    await expect.poll(async () => (await readGuestProgress(page)).engagement.coins)
      .toBe(25);
  }

  await completeGoldenRoute();
  const firstCompletion = await readGuestProgress(page);
  expect(firstCompletion.engagement.rewardedCollectibles).toEqual(["5:golden:golden-5"]);
  await page.locator(".level-complete-card")
    .getByRole("button", { name: "Replay Level" }).click();
  await expect(page.locator(".game-status-label")).toHaveText("ready");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);
  await completeGoldenRoute();
  const replayCompletion = await readGuestProgress(page);
  expect(replayCompletion.engagement.coins).toBe(firstCompletion.engagement.coins);
  expect(replayCompletion.engagement.rewardedCollectibles)
    .toEqual(firstCompletion.engagement.rewardedCollectibles);

  await page.reload();
  await expect.poll(async () => (await readGuestProgress(page)).engagement.coins)
    .toBe(25);
});

test("equips an unlocked worm skin and restores it in gameplay after reload", async ({ page }) => {
  const progress = createDefaultGuestProgress();
  progress.unlockedLevel = 6;
  progress.records = Object.fromEntries(levels.slice(0, 5).map((level) => [
    level.number,
    { score: 100, moves: level.parMoves, stars: 2 },
  ]));
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, { key: GUEST_PROGRESS_STORAGE_KEY, value: progress });

  await page.goto("/collection");
  const fireSkin = page.getByRole("article", { name: "Fire Worm, unlocked" });
  const iceSkin = page.getByRole("article", { name: "Ice Worm, locked" });
  await expect(fireSkin.getByRole("button", { name: "Equip" })).toBeEnabled();
  await expect(iceSkin.getByRole("button", { name: "Equip" })).toBeDisabled();
  await fireSkin.getByRole("button", { name: "Equip" }).click();
  await expect.poll(async () => (await readGuestProgress(page)).engagement.selectedSkin)
    .toBe("fire");

  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await page.getByRole("button", { name: /^Level 6:/ }).click();
  await expect(page.getByRole("grid", { name: "Level 6 game board" })).toBeVisible();
  await expect(page.locator(".worm-layer")).toHaveClass(/worm-layer--skin-fire/);
  await expect.poll(async () =>
    (await readGuestProgress(page)).activeGame?.levelNumber,
  ).toBe(6);
  await page.reload();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByRole("grid", { name: "Level 6 game board" })).toBeVisible();
  await expect(page.locator(".worm-layer")).toHaveClass(/worm-layer--skin-fire/);
});

test("saves an in-progress puzzle locally and restores it after reload and reopening", async ({ page, browser }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame?.actions)
    .toEqual(["right"]);

  await page.reload();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator(".game-status-label")).toHaveText("playing");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame?.actions)
    .toEqual(["right"]);

  const savedBrowserState = await page.context().storageState();
  const reopenedContext = await browser.newContext({ storageState: savedBrowserState });
  const reopenedPage = await reopenedContext.newPage();
  await reopenedPage.goto("/");
  await expect(reopenedPage).toHaveURL(/\/game$/);
  await expect(reopenedPage.locator(".game-status-label")).toHaveText("playing");
  expect(apiRequests).toEqual([]);
  await reopenedContext.close();
});

test("mobile board swipes work across the board once, ignore taps, and respect pause controls", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/game");
  await expect(page.getByRole("grid", { name: "Level 1 game board" })).toBeVisible();
  const session = await context.newCDPSession(page);
  const board = await page.locator(".game-board").boundingBox();
  const gestureStart = {
    x: board.x + board.width * 0.68,
    y: board.y + board.height * 0.72,
  };

  const pauseButton = page.getByRole("button", { name: "Pause" });
  await pauseButton.scrollIntoViewIfNeeded();
  const pauseBox = await pauseButton.boundingBox();
  const boardAfterScroll = await page.locator(".game-board").boundingBox();
  await dispatchTouchSwipe(session, {
    x: pauseBox.x + pauseBox.width / 2,
    y: pauseBox.y + pauseBox.height / 2,
  }, {
    x: boardAfterScroll.x + boardAfterScroll.width * 0.7,
    y: boardAfterScroll.y + boardAfterScroll.height * 0.7,
  });
  await expect(page.locator(".game-status-label")).toHaveText("ready");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));

  const refreshedBoard = await page.locator(".game-board").boundingBox();
  gestureStart.x = refreshedBoard.x + refreshedBoard.width * 0.68;
  gestureStart.y = refreshedBoard.y + refreshedBoard.height * 0.72;
  await dispatchTouchSwipe(session, gestureStart, gestureStart);
  await dispatchTouchSwipe(session, gestureStart, {
    x: gestureStart.x + 8,
    y: gestureStart.y + 3,
  });
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await dispatchTouchSwipe(session, gestureStart, {
    x: gestureStart.x + 42,
    y: gestureStart.y + 2,
  });
  await expect(page.locator(".game-status-label")).toHaveText("playing");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual(["right"]);
  await expect(page.locator(".stat-value").nth(2)).toHaveText("01");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.locator(".game-board").evaluate((element) => ({
    touchAction: getComputedStyle(element).touchAction,
    userSelect: getComputedStyle(element).userSelect,
    overscrollBehavior: getComputedStyle(element).overscrollBehavior,
  }))).toEqual({
    touchAction: "none",
    userSelect: "none",
    overscrollBehavior: "contain",
  });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".game-status-label")).toHaveText("paused");
  await expect(page.getByRole("dialog", { name: "Adventure paused" })).toBeVisible();
  await dispatchTouchSwipe(session, gestureStart, {
    x: gestureStart.x,
    y: gestureStart.y + 45,
  });
  await expect(page.locator(".stat-value").nth(2)).toHaveText("01");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual(["right"]);
  await page.getByRole("dialog").getByRole("button", { name: "Restart level" }).click();
  await expect(page.locator(".game-status-label")).toHaveText("ready");
  await expect(page.locator(".stat-value").nth(2)).toHaveText("00");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);

  await session.detach();
  await context.close();
});

test("mobile-first gameplay fits portrait and landscape viewports with usable touch targets", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();
  await page.goto("/game");
  const board = page.getByRole("grid", { name: "Level 1 game board" });
  await expect(board).toBeVisible();
  await expect(page.locator('meta[name="viewport"]'))
    .toHaveAttribute("content", /viewport-fit=cover/);

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.evaluate(() => {
      const boardRect = document.querySelector(".game-board").getBoundingClientRect();
      const pauseRect = document.querySelector(".game-controls [aria-label='Pause'], .game-controls button:nth-child(2)")
        .getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        board: {
          left: boardRect.left,
          right: boardRect.right,
          top: boardRect.top,
          bottom: boardRect.bottom,
          width: boardRect.width,
          height: boardRect.height,
        },
        pauseTarget: { width: pauseRect.width, height: pauseRect.height },
        touchAction: getComputedStyle(document.querySelector(".game-board")).touchAction,
      };
    });

    expect(layout.documentWidth, `no horizontal page overflow at ${viewport.width}x${viewport.height}`)
      .toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.board.left).toBeGreaterThanOrEqual(0);
    expect(layout.board.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.board.bottom).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.board.height).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.pauseTarget.height).toBeGreaterThanOrEqual(44);
    expect(layout.touchAction).toBe("none");
  }

  const pauseDialog = page.getByRole("dialog", { name: "Adventure paused" });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(pauseDialog).toBeVisible();
  const dialogBounds = await pauseDialog.boundingBox();
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(844);
  await pauseDialog.getByRole("button", { name: "Resume adventure" }).click();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settingSwitch = page.getByRole("switch", { name: "Sound Effects" });
  await expect(settingSwitch).toBeVisible();
  expect(await settingSwitch.evaluate((element) =>
    element.getBoundingClientRect().height,
  )).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await context.close();
});

test("shows one continuous progression with sequentially locked levels", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/levels");

  await expect(page.getByRole("heading", { name: "The 100-level journey" })).toBeVisible();
  const progression = page.getByRole("group", { name: "Continuous level progression" });
  await expect(progression.getByRole("button", { name: /^Level \d+:/ }))
    .toHaveCount(TOTAL_LEVELS);
  await expect(page.getByRole("button", { name: /^Level 1:.*unlocked/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Level 2:.*locked/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Level 100:.*locked/ })).toBeDisabled();
  await expect(page.getByRole("heading", { name: /World|Chapter|Difficulty/ })).toHaveCount(0);

  for (const width of [320, 393, 440]) {
    await page.setViewportSize({ width, height: 852 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `level selection should fit a ${width}px viewport`,
    ).toBe(true);
  }
  expect(apiRequests).toEqual([]);
});

test("opens the guest statistics dashboard with saved totals, dark mode, and responsive layout", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  const progress = {
    version: 1,
    unlockedLevel: 4,
    records: {
      1: { score: 120, moves: 8, stars: 3 },
      2: { score: 250, moves: 11, stars: 2 },
      3: { score: 180, moves: 14, stars: 3 },
    },
    activeGame: null,
    settings: { reducedMotion: false },
    achievements: {
      "first-apple": { unlockedAt: "2026-11-07T10:00:00.000Z" },
    },
  };
  await page.addInitScript(({ progressKey, savedProgress }) => {
    window.localStorage.setItem(progressKey, JSON.stringify(savedProgress));
    window.localStorage.setItem("apple-worm-adventure.settings", JSON.stringify({
      version: 1,
      soundEffects: false,
      backgroundMusic: false,
      vibration: false,
      darkMode: true,
      reducedMotion: false,
    }));
  }, { progressKey: GUEST_PROGRESS_STORAGE_KEY, savedProgress: progress });

  await page.goto("/levels");
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(page).toHaveURL(/\/statistics$/);
  await expect(page.getByRole("heading", { name: "Player statistics" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Overall level completion" }))
    .toHaveAttribute("aria-valuenow", "3");
  await expect(page.locator(".statistics-overview")).toContainText("3 / 100 levels complete");
  await expect(page.locator(".statistics-card-grid").first()).toContainText("8");
  await expect(page.locator(".statistics-card-grid").first()).toContainText("97");
  const performanceCards = page.locator(".statistics-card-grid--performance .statistics-card");
  const expectedApples = levels.slice(0, 3)
    .reduce((total, level) => total + level.board.apples.length, 0);
  await expect(performanceCards.nth(0)).toContainText(String(expectedApples));
  await expect(performanceCards.nth(1)).toContainText("33");
  await expect(performanceCards.nth(2)).toContainText("250");
  await expect(performanceCards.nth(2)).toContainText("Level 2");
  await expect(performanceCards.nth(3)).toContainText("Level 3");
  await expect(performanceCards.nth(4)).toContainText("183");
  await expect(page.getByRole("list", { name: "Saved score by level" }).getByRole("listitem"))
    .toHaveCount(3);
  await expect(page.getByRole("list", { name: "Recent achievements" }))
    .toContainText("First Apple");
  await expect(page.getByRole("heading", { name: "Latest journey levels" })).toBeVisible();
  await expect(page.locator(".statistics-level-history li").first()).toContainText("Level 3");
  await expect(page.locator(".statistics-level-history li").last()).toContainText("Level 1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".statistics-panel").first())
    .toHaveCSS("background-color", "rgb(34, 43, 36)");

  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `statistics should fit a ${width}px viewport`,
    ).toBe(true);
  }
  expect(apiRequests).toEqual([]);
});

test("shows a clear first-steps state for a new guest and opens level selection", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/statistics");

  await expect(page.getByRole("heading", { name: "Player statistics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your first apple is waiting" }))
    .toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Overall level completion" }))
    .toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByText("Complete a level to see your saved scores here.", {
    exact: true,
  })).toBeVisible();
  await expect(page.locator(".loading-spinner")).toHaveCount(0);

  await page.getByRole("button", { name: "Explore levels" }).click();
  await expect(page).toHaveURL(/\/levels$/);
  await expect(page.getByRole("heading", { name: "The 100-level journey" }))
    .toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("offers an explicit retry after a transient local progress save failure", async ({ page }) => {
  await page.addInitScript((progressKey) => {
    const storage = window.localStorage;
    const nativeSetItem = storage.setItem.bind(storage);
    let failFirstProgressWrite = true;
    Object.defineProperty(storage, "setItem", {
      configurable: true,
      value(key, value) {
      if (key === progressKey && failFirstProgressWrite) {
        failFirstProgressWrite = false;
        throw new DOMException("Temporary storage failure", "QuotaExceededError");
      }
        return nativeSetItem(key, value);
      },
    });
    window.restoreProgressStorageWrite = () => {
      Object.defineProperty(storage, "setItem", {
        configurable: true,
        value: nativeSetItem,
      });
    };
  }, GUEST_PROGRESS_STORAGE_KEY);
  await page.goto("/");

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Temporary storage failure");
  await expect(alert.getByRole("button", { name: "Retry save" })).toBeVisible();
  await page.evaluate(() => window.restoreProgressStorageWrite());
  await alert.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => (await readGuestProgress(page)).unlockedLevel)
    .toBe(1);
});

test("completing a level saves score and stars, unlocks the next level, and updates local milestones", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  expect(await completeLevelOne(page)).toBe(true);

  await expect(page.locator(".game-status-label")).toHaveText("won");
  await expect(page.locator(".achievement-toast")).toContainText(/achievements? unlocked/i);
  await expect(page.locator(".achievement-toast")).toContainText("First Apple");
  await expect(page.getByRole("heading", { name: "Level complete!" })).toBeVisible();
  await expect(page.getByLabel(/\d stars earned/)).toBeVisible();
  await expect(page.locator(".level-complete-card").getByText(/\d+ points/)).toBeVisible();
  await expect(page.locator(".level-complete-card").getByText(/\d+ moves/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next Level" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay Level" }).first()).toBeVisible();
  await expect.poll(async () => {
    const progress = await readGuestProgress(page);
    return { unlockedLevel: progress.unlockedLevel, recordCount: Object.keys(progress.records).length };
  }).toEqual({ unlockedLevel: 2, recordCount: 1 });
  const progress = await readGuestProgress(page);
  expect(progress.records["1"].score).toBeGreaterThan(0);
  expect(progress.records["1"].stars).toBeGreaterThanOrEqual(1);
  expect(progress.achievements["first-apple"].unlockedAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T/,
  );

  await page.getByRole("button", { name: "Next Level" }).click();
  await expect(
    page.getByRole("region", { name: "Puzzle board" })
      .getByRole("heading", { name: "Clover Crossing" }),
  ).toBeVisible();
  await expect(page.locator(".stat-value").first()).toHaveText("02");
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Level 2:.*unlocked/ })).toBeEnabled();
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
  await expect(page.locator(".achievement-card--unlocked").first()).toBeVisible();
  for (const width of [320, 393, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `achievement collection should fit a ${width}px viewport`,
    ).toBe(true);
  }
  await page.reload();
  await expect(page.locator(".achievement-card--unlocked").first()).toBeVisible();
  await expect(page.locator(".achievement-toast")).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("region", { name: "Achievement collection summary" }))
    .toContainText("2 / 17 earned");
  await expect(page.getByRole("progressbar", {
    name: "Achievement collection completion",
  })).toHaveAttribute("aria-valuenow", "2");
  expect(apiRequests).toEqual([]);
});

test("restarts the current level without changing guest progress", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  const wormHead = page.locator(".worm-position").last();
  const startingHeadX = await wormHead.evaluate((element) => element.getBoundingClientRect().x);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () =>
    wormHead.evaluate((element) => element.getBoundingClientRect().x),
  ).toBeGreaterThan(startingHeadX);
  await expect(page.locator(".game-status-label")).toHaveText("playing");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual(["right"]);

  await page.getByRole("button", { name: "Restart Level" }).click();
  await expect(page.locator(".game-status-label")).toHaveText("ready");
  await expect(page.locator(".stat-value").nth(2)).toHaveText("00");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);
  for (const width of [320, 393, 768, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `game screen should fit a ${width}px viewport`,
    ).toBe(true);
    await expect(page.getByRole("button", { name: "Restart Level" })).toBeVisible();
  }
  expect(apiRequests).toEqual([]);
});

test("pause freezes input, resume restores play, restart is safe, and exit preserves the active level", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  const progress = {
    version: 1,
    unlockedLevel: 2,
    records: { 1: { score: 120, moves: 8, stars: 2 } },
    activeGame: { levelNumber: 1, actions: [] },
    settings: { reducedMotion: true },
    achievements: {},
  };
  await page.addInitScript(({ progressKey, savedProgress }) => {
    window.localStorage.setItem(progressKey, JSON.stringify(savedProgress));
    window.localStorage.setItem("apple-worm-adventure.settings", JSON.stringify({
      version: 1,
      soundEffects: false,
      backgroundMusic: false,
      vibration: false,
      darkMode: true,
      reducedMotion: true,
    }));
  }, { progressKey: GUEST_PROGRESS_STORAGE_KEY, savedProgress: progress });

  await page.goto("/game");
  await page.getByRole("button", { name: "Pause" }).click();
  const pauseDialog = page.getByRole("dialog", { name: "Adventure paused" });
  await expect(pauseDialog).toBeVisible();
  await expect(pauseDialog.getByRole("button", { name: "Resume adventure" }))
    .toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".game-status-label")).toHaveText("paused");
  await expect(page.locator(".stat-value").nth(2)).toHaveText("00");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);

  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    ),
  );
  const narrowViewportLayout = await page.evaluate(() => {
    const offenders = Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 &&
          (bounds.left < -1 || bounds.right > window.innerWidth + 1);
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === "string" ? element.className : "",
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      }));
    return {
      fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders,
    };
  });
  expect(narrowViewportLayout.fits, JSON.stringify(narrowViewportLayout)).toBe(true);
  expect(await pauseDialog.getByRole("button", { name: "Resume adventure" })
    .evaluate((button) => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await pauseDialog.evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).animationDuration),
  )).toBeLessThanOrEqual(0.0001);
  await expect(pauseDialog).toHaveCSS("background-color", "rgb(34, 43, 36)");

  await pauseDialog.getByRole("button", { name: "Resume adventure" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".game-status-label")).toHaveText("playing");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual(["right"]);

  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restart level" }).click();
  await expect(page.locator(".game-status-label")).toHaveText("ready");
  await expect(page.locator(".stat-value").nth(2)).toHaveText("00");
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual([]);
  expect((await readGuestProgress(page)).records["1"]).toEqual({
    score: 120,
    moves: 8,
    stars: 2,
  });

  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Exit to levels" }).click();
  await expect(page).toHaveURL(/\/levels$/);
  await expect(page.getByRole("button", { name: "Resume Level 1" })).toBeVisible();
  await expect.poll(async () => (await readGuestProgress(page)).activeGame.actions)
    .toEqual(["right"]);

  await page.getByRole("button", { name: "Resume Level 1" }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator(".game-status-label")).toHaveText("playing");
  await expect(page.locator(".stat-value").nth(2)).toHaveText("01");
  await page.locator(".game-header").getByRole("button", {
    name: "Apple Worm Adventure home",
  }).click();
  await expect(page.getByRole("button", { name: /PLAY NOW/ })).toBeVisible();
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  await expect(page.locator(".stat-value").nth(2)).toHaveText("01");
  expect(apiRequests).toEqual([]);
});

test("reduced motion disables board movement transitions", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("apple-worm-adventure.settings", JSON.stringify({
      version: 1,
      soundEffects: false,
      backgroundMusic: false,
      vibration: false,
      darkMode: false,
      reducedMotion: true,
    }));
  });
  await page.goto("/game");
  await expect(page.locator(".worm-position").first()).toBeVisible();
  expect(await page.locator(".worm-position").first().evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).transitionDuration),
  )).toBeLessThanOrEqual(0.0001);
  expect(await page.locator(".board-apple").first().evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).animationDuration),
  )).toBeLessThanOrEqual(0.0001);
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  await expect(page.locator(".achievement-card").first()).toBeVisible();
  expect(await page.locator(".achievement-card").first().evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).transitionDuration),
  )).toBeLessThanOrEqual(0.0001);
});

test("plays original audio only after interaction and respects both audio settings", async ({ page }) => {
  await page.addInitScript(() => {
    window.__audioCounts = {
      contexts: 0,
      oscillators: 0,
      buffers: 0,
      bufferSources: 0,
      starts: 0,
      stops: 0,
      resumes: 0,
    };
    const counts = window.__audioCounts;
    const parameter = () => ({
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    });
    const node = () => ({
      connect() {},
      disconnect() {},
      start() { counts.starts += 1; },
      stop() { counts.stops += 1; },
    });
    window.AudioContext = class {
      constructor() {
        counts.contexts += 1;
        this.currentTime = 0;
        this.sampleRate = 8;
        this.state = "suspended";
        this.destination = {};
      }
      createOscillator() {
        counts.oscillators += 1;
        return { ...node(), frequency: parameter() };
      }
      createGain() { return { ...node(), gain: parameter() }; }
      createBufferSource() {
        counts.bufferSources += 1;
        return node();
      }
      createBuffer(channels, length) {
        counts.buffers += 1;
        const samples = Array.from({ length: channels }, () => new Float32Array(length));
        return { getChannelData: (channel) => samples[channel] };
      }
      resume() {
        counts.resumes += 1;
        this.state = "running";
        return Promise.resolve();
      }
      close() { return Promise.resolve(); }
    };
    window.localStorage.setItem("apple-worm-adventure.settings", JSON.stringify({
      version: 1,
      soundEffects: true,
      backgroundMusic: true,
      vibration: false,
      darkMode: false,
      reducedMotion: false,
    }));
  });
  const apiRequests = await trackApiRequests(page);
  await page.goto("/game");
  await expect(page.getByRole("grid", { name: "Level 1 game board" })).toBeVisible();
  expect(await page.evaluate(() => window.__audioCounts.contexts)).toBe(0);

  await page.getByRole("grid", { name: "Level 1 game board" }).click();
  expect(await page.evaluate(() => window.__audioCounts.bufferSources)).toBe(1);
  expect(await page.evaluate(() => window.__audioCounts.resumes)).toBe(1);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.__audioCounts.oscillators)).toBe(1);
  expect(await page.evaluate(() => window.__audioCounts.starts)).toBe(2);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog", { name: "Adventure paused" })).toBeVisible();
  expect(await page.evaluate(() => window.__audioCounts.oscillators)).toBe(3);
  await page.getByRole("dialog").getByRole("button", {
    name: "Resume adventure",
  }).click();
  await expect(page.locator(".game-status-label")).toHaveText("playing");
  expect(await page.evaluate(() => window.__audioCounts.oscillators)).toBe(6);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(await page.evaluate(() => window.__audioCounts.stops)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__audioCounts.bufferSources)).toBe(1);
  await page.getByRole("switch", { name: "Sound Effects" }).click();
  expect(await page.evaluate(() => window.__audioCounts.oscillators)).toBe(6);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  expect(await page.evaluate(() => window.__audioCounts.bufferSources)).toBe(1);
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  const gameBoard = page.getByRole("grid", { name: "Level 1 game board" });
  await expect(gameBoard).toBeVisible();
  expect(await page.evaluate(() => window.__audioCounts.bufferSources)).toBe(1);
  await gameBoard.click();
  expect(await page.evaluate(() => window.__audioCounts.bufferSources)).toBe(2);
  expect(apiRequests).toEqual([]);
});

test("keeps guest hints free and safely omits wallet, boosters, and rewarded ads", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: /PLAY NOW/ }).click();
  await page.getByRole("button", { name: "Free hint" }).click();
  await expect(page.getByRole("status")).toContainText("Try moving");
  await expect(page.getByRole("button", { name: /Wallet|Leaderboard|Profile/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Boosters" })).toHaveCount(0);
  await expect(page.getByText(/rewarded ad|sign in|create account/i)).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test("persists guest settings and redirects old account URLs without showing auth pages", async ({ page }) => {
  const apiRequests = await trackApiRequests(page);
  await page.goto("/settings");

  const switches = {
    soundEffects: page.getByRole("switch", { name: "Sound Effects" }),
    backgroundMusic: page.getByRole("switch", { name: "Background Music" }),
    vibration: page.getByRole("switch", { name: "Vibration" }),
    darkMode: page.getByRole("switch", { name: "Dark Mode" }),
    reducedMotion: page.getByRole("switch", { name: "Reduced Motion" }),
  };
  await expect(page.getByText(/original cues play for moves/i)).toBeVisible();
  await expect(page.getByText(/original 8-bit arcade music starts during gameplay/i)).toBeVisible();
  const progressBeforeSettingsChange = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    GUEST_PROGRESS_STORAGE_KEY,
  );
  for (const setting of Object.values(switches)) {
    await setting.click();
    await expect(setting).toHaveAttribute("aria-checked", "true");
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("apple-worm-adventure.settings"),
  ))).toEqual({
    version: 1,
    soundEffects: true,
    backgroundMusic: true,
    vibration: true,
    darkMode: true,
    reducedMotion: true,
  });
  expect(await page.evaluate(
    (key) => window.localStorage.getItem(key),
    GUEST_PROGRESS_STORAGE_KEY,
  )).toBe(progressBeforeSettingsChange);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".app-shell")).toHaveClass(/app-shell--reduced-motion/);
  await expect.poll(() => page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )).toBe("rgb(23, 29, 25)");
  expect(await page.locator(".setting-switch").first().evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).transitionDuration),
  )).toBeLessThanOrEqual(0.0001);

  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      `settings should fit a ${width}px viewport`,
    ).toBe(true);
  }

  await page.reload();
  for (const setting of Object.values(switches)) {
    await expect(setting).toHaveAttribute("aria-checked", "true");
  }
  await expect(page.locator(".app-shell")).toHaveClass(/app-shell--reduced-motion/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const url of ["/login", "/register", "/wallet", "/profile", "/leaderboard"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: /PLAY NOW/ })).toBeVisible();
  }
  await expect(page.locator(".hero-copy h1")).toHaveCSS("color", "rgb(237, 242, 235)");
  await expect(page.locator(".landing-features article").first())
    .toHaveCSS("background-color", "rgb(34, 43, 36)");
  await expect(page.getByRole("button", { name: /sign in|log in|sign up|create account/i })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

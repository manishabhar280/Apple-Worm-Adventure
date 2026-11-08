import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGuestSettings,
  createDefaultGuestSettings,
  GUEST_SETTINGS_STORAGE_KEY,
  isValidGuestSettings,
  readGuestSettings,
  saveGuestSettings,
  vibrateForMove,
} from "./guestSettings.js";

function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, GUEST_SETTINGS_STORAGE_KEY);
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, GUEST_SETTINGS_STORAGE_KEY);
      value = nextValue;
    },
  };
}

test("provides safe defaults and honors the operating-system motion preference", () => {
  assert.deepEqual(readGuestSettings(createMemoryStorage()).settings,
    createDefaultGuestSettings());
  assert.equal(
    readGuestSettings(createMemoryStorage(), { prefersReducedMotion: true })
      .settings.reducedMotion,
    true,
  );
});

test("saves and restores all preferences under their separate versioned key", () => {
  const storage = createMemoryStorage();
  const settings = {
    ...createDefaultGuestSettings(),
    soundEffects: true,
    backgroundMusic: true,
    vibration: true,
    darkMode: true,
    reducedMotion: true,
  };

  saveGuestSettings(settings, storage);
  assert.deepEqual(readGuestSettings(storage), { settings, canSave: true, error: "" });
  assert.match(storage.getItem(GUEST_SETTINGS_STORAGE_KEY), /"version":1/);
});

test("does not overwrite invalid or unsupported settings", () => {
  const storage = createMemoryStorage('{"version":7}');
  const result = readGuestSettings(storage);

  assert.equal(result.canSave, false);
  assert.match(result.error, /unsupported version/);
  assert.equal(storage.getItem(GUEST_SETTINGS_STORAGE_KEY), '{"version":7}');
});

test("keeps settings separate from existing guest progress storage", () => {
  const values = new Map([
    ["apple-worm-adventure.guest-progress", '{"existing":"save"}'],
  ]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const before = values.get("apple-worm-adventure.guest-progress");
  saveGuestSettings(createDefaultGuestSettings(), storage);

  assert.equal(values.get("apple-worm-adventure.guest-progress"), before);
  assert.notEqual(GUEST_SETTINGS_STORAGE_KEY, "apple-worm-adventure.guest-progress");
});

test("applies dark mode and reduced-motion state to the document root", () => {
  const documentRef = { documentElement: { dataset: {} } };
  applyGuestSettings({
    ...createDefaultGuestSettings(),
    darkMode: true,
    reducedMotion: true,
  }, documentRef);

  assert.deepEqual(documentRef.documentElement.dataset, {
    theme: "dark",
    reducedMotion: "true",
  });
});

test("uses vibration only when enabled and gracefully handles unsupported devices", () => {
  let duration;
  assert.equal(vibrateForMove(true, { vibrate(value) { duration = value; return true; } }), true);
  assert.equal(duration, 12);
  assert.equal(vibrateForMove(false, { vibrate() { throw new Error("must not run"); } }), false);
  assert.equal(vibrateForMove(true, {}), false);
  assert.equal(vibrateForMove(true, { vibrate() { throw new Error("unsupported"); } }), false);
});

test("rejects malformed or unexpected settings values", () => {
  assert.equal(isValidGuestSettings({
    ...createDefaultGuestSettings(),
    credential: "not-allowed",
  }), false);
  assert.equal(isValidGuestSettings({
    ...createDefaultGuestSettings(),
    darkMode: "yes",
  }), false);
});

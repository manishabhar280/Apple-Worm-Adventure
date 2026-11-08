export const GUEST_SETTINGS_STORAGE_KEY = "apple-worm-adventure.settings";
export const GUEST_SETTINGS_VERSION = 1;

export function createDefaultGuestSettings({
  legacyReducedMotion = false,
  prefersReducedMotion = false,
} = {}) {
  return {
    version: GUEST_SETTINGS_VERSION,
    soundEffects: false,
    backgroundMusic: false,
    vibration: false,
    darkMode: false,
    reducedMotion: Boolean(legacyReducedMotion || prefersReducedMotion),
  };
}

const settingNames = [
  "soundEffects",
  "backgroundMusic",
  "vibration",
  "darkMode",
  "reducedMotion",
];

export function isValidGuestSettings(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === settingNames.length + 1 &&
    Object.keys(value).every((key) => key === "version" || settingNames.includes(key)) &&
    value.version === GUEST_SETTINGS_VERSION &&
    settingNames.every((setting) => typeof value[setting] === "boolean");
}

export function readGuestSettings(
  storage,
  {
    legacyReducedMotion = false,
    prefersReducedMotion = false,
  } = {},
) {
  try {
    const target = storage ?? globalThis.localStorage;
    const serialized = target.getItem(GUEST_SETTINGS_STORAGE_KEY);
    if (serialized === null) {
      return {
        settings: createDefaultGuestSettings({ legacyReducedMotion, prefersReducedMotion }),
        canSave: true,
        error: "",
      };
    }

    const settings = JSON.parse(serialized);
    if (!isValidGuestSettings(settings)) {
      return {
        settings: createDefaultGuestSettings({ legacyReducedMotion, prefersReducedMotion }),
        canSave: false,
        error: "Saved settings are invalid or from an unsupported version. They were left unchanged.",
      };
    }
    return { settings, canSave: true, error: "" };
  } catch {
    return {
      settings: createDefaultGuestSettings({ legacyReducedMotion, prefersReducedMotion }),
      canSave: false,
      error: "Settings could not be read from this browser. You can play, but preferences may not be saved.",
    };
  }
}

export function saveGuestSettings(settings, storage) {
  if (!isValidGuestSettings(settings)) {
    throw new Error("Settings could not be saved because their data is invalid.");
  }
  const target = storage ?? globalThis.localStorage;
  target.setItem(GUEST_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function applyGuestSettings(settings, documentRef = globalThis.document) {
  if (!documentRef?.documentElement) return;
  documentRef.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  documentRef.documentElement.dataset.reducedMotion =
    settings.reducedMotion ? "true" : "false";
}

export function vibrateForMove(enabled, navigatorRef = globalThis.navigator) {
  if (!enabled || typeof navigatorRef?.vibrate !== "function") return false;
  try {
    return navigatorRef.vibrate(12) === true;
  } catch {
    return false;
  }
}

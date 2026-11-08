export const WORM_SKINS = Object.freeze([
  {
    id: "classic",
    name: "Classic Worm",
    description: "The familiar orchard explorer.",
    requirement: "Available from the start.",
    completedLevels: 0,
  },
  {
    id: "fire",
    name: "Fire Worm",
    description: "A warm ember-red look.",
    requirement: "Complete 5 levels.",
    completedLevels: 5,
  },
  {
    id: "ice",
    name: "Ice Worm",
    description: "A cool frozen-blue look.",
    requirement: "Complete 25 levels.",
    completedLevels: 25,
  },
  {
    id: "rainbow",
    name: "Rainbow Worm",
    description: "A bright spectrum of colors.",
    requirement: "Complete 50 levels.",
    completedLevels: 50,
  },
  {
    id: "galaxy",
    name: "Galaxy Worm",
    description: "A deep cosmic violet look.",
    requirement: "Complete all 100 levels.",
    completedLevels: 100,
  },
]);

export function getCompletedLevelCount(records = {}) {
  if (records === null || typeof records !== "object" || Array.isArray(records)) return 0;
  return Object.keys(records).filter((level) =>
    Number.isInteger(Number(level)) &&
    Number(level) >= 1 &&
    Number(level) <= 100,
  ).length;
}

export function isWormSkinUnlocked(skinId, records = {}) {
  const skin = WORM_SKINS.find(({ id }) => id === skinId);
  return Boolean(skin && getCompletedLevelCount(records) >= skin.completedLevels);
}

export function getUnlockedWormSkins(records = {}) {
  return WORM_SKINS.filter(({ id }) => isWormSkinUnlocked(id, records));
}

export function getEquippedWormSkin(selectedSkin, records = {}) {
  return isWormSkinUnlocked(selectedSkin, records) ? selectedSkin : "classic";
}

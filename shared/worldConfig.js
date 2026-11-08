export const WORLDS = [
  {
    id: "forest",
    name: "Forest World",
    description: "Follow leafy trails through the heart of the orchard.",
    theme: "A welcoming woodland of winding paths and sunlit clearings.",
    levelStart: 1,
    levelEnd: 25,
    unlockRequirement: { type: "initial" },
    visualTheme: {
      icon: "🌲",
      accent: "#557a43",
      surface: "linear-gradient(135deg, #f1f8e9, #ffffff)",
      boardBackground: "#c5d6b7",
      tileLight: "#dce9d2",
      tileDark: "#cbdcc0",
      particle: "🍃",
      decoration: "🌿  🌼  🍃",
    },
    completionRequirement: {
      type: "complete-all-world-levels",
    },
  },
  {
    id: "desert",
    name: "Desert World",
    description: "Cross warm dunes and uncover the routes hidden in the sand.",
    theme: "A golden desert of sun-baked trails and shifting sands.",
    levelStart: 26,
    levelEnd: 50,
    unlockRequirement: { type: "complete-world", worldId: "forest" },
    visualTheme: {
      icon: "🏜️",
      accent: "#b77936",
      surface: "linear-gradient(135deg, #fff4dc, #ffffff)",
      boardBackground: "#e5c998",
      tileLight: "#f4dfb7",
      tileDark: "#e9d1a2",
      particle: "✦",
      decoration: "🌵  ☀️  🪨",
    },
    completionRequirement: {
      type: "complete-all-world-levels",
    },
  },
  {
    id: "ice",
    name: "Ice World",
    description: "Plan each move carefully across cool, slippery passages.",
    theme: "A crystalline landscape of frosted paths and quiet glaciers.",
    levelStart: 51,
    levelEnd: 75,
    unlockRequirement: { type: "complete-world", worldId: "desert" },
    visualTheme: {
      icon: "❄️",
      accent: "#43829a",
      surface: "linear-gradient(135deg, #e8f7fb, #ffffff)",
      boardBackground: "#b7dce8",
      tileLight: "#e1f3f7",
      tileDark: "#cbe8ef",
      particle: "❄",
      decoration: "❄️  🧊  ✧",
    },
    completionRequirement: {
      type: "complete-all-world-levels",
    },
  },
  {
    id: "lava",
    name: "Lava World",
    description: "Take on the final 25 trails in a blazing volcanic realm.",
    theme: "A dramatic volcanic world of glowing stone and molten rivers.",
    levelStart: 76,
    levelEnd: 100,
    unlockRequirement: { type: "complete-world", worldId: "ice" },
    visualTheme: {
      icon: "🌋",
      accent: "#ba5641",
      surface: "linear-gradient(135deg, #fff0e8, #ffffff)",
      boardBackground: "#543b3b",
      tileLight: "#75504a",
      tileDark: "#624542",
      particle: "✦",
      decoration: "🌋  🔥  ◈",
    },
    completionRequirement: {
      type: "complete-all-world-levels",
    },
  },
];

export function getWorldById(worldId) {
  return WORLDS.find((world) => world.id === worldId);
}

export function getWorldForLevel(levelNumber) {
  if (!Number.isInteger(levelNumber)) return undefined;
  return WORLDS.find(
    (world) => levelNumber >= world.levelStart && levelNumber <= world.levelEnd,
  );
}

function completedLevelSet(completedLevels) {
  return completedLevels instanceof Set
    ? completedLevels
    : new Set(completedLevels);
}

export function hasWorldCompletion(world, completedLevels) {
  const completed = completedLevelSet(completedLevels);
  const requirement = world.completionRequirement;
  let count = 0;
  for (let level = world.levelStart; level <= world.levelEnd; level += 1) {
    if (completed.has(level)) count += 1;
  }
  return requirement.type === "complete-all-world-levels" &&
    count === world.levelEnd - world.levelStart + 1;
}

export function isWorldUnlocked(world, completedLevels) {
  if (!world) return false;
  if (world.unlockRequirement.type === "initial") return true;
  if (world.unlockRequirement.type === "complete-world") {
    const requiredWorld = getWorldById(world.unlockRequirement.worldId);
    return requiredWorld
      ? hasWorldCompletion(requiredWorld, completedLevels)
      : false;
  }
  return false;
}

export function getWorldProgress(world, completedLevels, unlockedLevel = 1) {
  const completed = completedLevelSet(completedLevels);
  let completedCount = 0;
  for (let level = world.levelStart; level <= world.levelEnd; level += 1) {
    if (completed.has(level)) completedCount += 1;
  }
  const totalLevels = world.levelEnd - world.levelStart + 1;
  return {
    completedCount,
    totalLevels,
    availableCount: Math.max(
      0,
      Math.min(world.levelEnd, unlockedLevel) - world.levelStart + 1,
    ),
    isComplete: completedCount === totalLevels,
    isUnlocked: isWorldUnlocked(world, completed),
  };
}

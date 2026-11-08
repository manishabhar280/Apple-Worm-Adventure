export const BOOSTER_CATALOG = Object.freeze({
  undo: Object.freeze({
    id: "undo",
    name: "Undo",
    price: 8,
    description: "Rewind the most recent accepted move.",
  }),
  shield: Object.freeze({
    id: "shield",
    name: "Shield",
    price: 12,
    description: "Stop one eligible in-board collision.",
  }),
  extra_moves: Object.freeze({
    id: "extra_moves",
    name: "Extra Moves",
    price: 10,
    description: "Add three moves, up to twice per level.",
    amount: 3,
    maxUsesPerLevel: 2,
  }),
  hint: Object.freeze({
    id: "hint",
    name: "Hint",
    price: 5,
    description: "Reveal one valid next move when the solver supports it.",
  }),
  freeze: Object.freeze({
    id: "freeze",
    name: "Freeze",
    price: 10,
    description: "Pause moving obstacles for three accepted moves.",
    duration: 3,
  }),
});

export const BOOSTER_IDS = Object.freeze(Object.keys(BOOSTER_CATALOG));
export const BOOSTER_ACTIONS = Object.freeze(
  BOOSTER_IDS.map((boosterId) => `booster:${boosterId}`),
);

export function isBoosterId(boosterId) {
  return Object.hasOwn(BOOSTER_CATALOG, boosterId);
}

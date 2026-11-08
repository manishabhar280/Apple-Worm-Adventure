const levelNames = [
  "First Harvest",
  "Clover Crossing",
  "Meadow Munch",
  "Orchard Trail",
  "Dewdrop Lane",
  "The Greenway",
  "Bramble Bend",
  "Sunny Switchback",
  "Crisp Canyon",
  "Mossy Mile",
  "Apple Acres",
  "Fernwood Run",
  "Winding Meadow",
  "Bumblebee Pass",
  "Pippin Path",
  "The Long Rows",
  "Golden Grove",
  "Leafy Labyrinth",
  "Cider Circuit",
  "Thicket Trek",
  "Windfall Way",
  "The Orchard Maze",
  "Rustle Ridge",
  "Harvest Hollow",
  "Greenhouse Gauntlet",
  "Bountiful Bend",
  "The Hidden Rows",
  "Bramblewood",
  "Autumn Approach",
  "Puzzler's Patch",
  "Applewood Loop",
  "The Deep Orchard",
  "Hedgehog Highway",
  "The Twisting Trail",
  "Crispwood Crossing",
  "Harvest Moon",
  "The Walled Garden",
  "Copperleaf Course",
  "Wildwood Weave",
  "The Grand Orchard",
  "Thornberry Trail",
  "The Apple Maze",
  "Evergreen Passage",
  "Orchard Overlook",
  "The Final Rows",
  "Golden Harvest",
  "Worm's-Eye View",
  "The Last Apple",
  "Everlasting Orchard",
  "Home at Last",
  "Whispering Willow",
  "The Moonlit Grove",
  "Cinnamon Circuit",
  "The Secret Orchard",
  "Foxglove Crossing",
  "The Honeycomb Maze",
  "Silverleaf Trail",
  "The Quiet Canopy",
  "Brambleberry Run",
  "The Lantern Orchard",
  "Pinecone Passage",
  "The Orchard Below",
  "Thistledown Track",
  "The Amber Labyrinth",
  "Firefly Fields",
  "The Crooked Bough",
  "Clover Crown",
  "The Hidden Hollow",
  "Starlight Switchback",
  "The Mossy Keep",
  "Wildflower Way",
  "The Tanglewood",
  "Moonapple Meadow",
  "The Briar Gate",
  "The Twilit Trail",
  "The Orchard Crown",
  "Dappled Dells",
  "The Winding Bough",
  "The Silver Orchard",
  "The Elder Grove",
  "Foxfire Crossing",
  "The Thorned Path",
  "The Overgrown Maze",
  "The Sunken Garden",
  "The Old Orchard",
  "The Emerald Circuit",
  "The Crowned Canopy",
  "The Last Labyrinth",
  "The Wildwood Crown",
  "The Celestial Grove",
  "The Orchard Eternal",
  "The Golden Labyrinth",
  "The Master Gardener",
  "The Final Harvest",
  "The Worm's Triumph",
  "The Heart of the Orchard",
  "The Infinite Bough",
  "The Grand Harvest",
  "The Everlasting Path",
  "The Orchard Beyond",
];

export const TOTAL_LEVELS = 100;
export const DIFFICULTY_TIERS = [
  "Easy",
  "Medium",
  "Hard",
  "Expert",
  "Master",
];

function getDifficulty(number) {
  const tierIndex = Math.min(
    DIFFICULTY_TIERS.length - 1,
    Math.floor(((number - 1) * DIFFICULTY_TIERS.length) / TOTAL_LEVELS),
  );
  return DIFFICULTY_TIERS[tierIndex];
}

function createRoute(rows, columns) {
  const route = [];
  let direction = 1;

  for (let row = 0; row < rows; row += 2) {
    if (direction === 1) {
      for (let column = 0; column < columns; column += 1) {
        route.push({ row, column });
      }
    } else {
      for (let column = columns - 1; column >= 0; column -= 1) {
        route.push({ row, column });
      }
    }

    const nextRow = row + 1;
    if (nextRow < rows) {
      route.push({
        row: nextRow,
        column: direction === 1 ? columns - 1 : 0,
      });
    }
    direction *= -1;
  }
  return route;
}

function hashPosition(levelNumber, row, column) {
  return ((row + 1) * 73856093) ^ ((column + 1) * 19349663) ^ (levelNumber * 83492791);
}

function createLevel(number) {
  const rows = 9 + Math.floor((number - 1) / 12) * 2;
  const columns = 9 + Math.floor((number - 1) / 16) * 2;
  const route = createRoute(rows, columns);
  const routeKeys = new Set(route.map(({ row, column }) => `${row}:${column}`));
  const startingWorm = route.slice(0, 3);
  const appleCount = Math.min(1 + Math.floor((number - 1) / 9), 6);
  const apples = Array.from({ length: appleCount }, (_, index) => {
    const pathIndex = Math.floor(
      ((index + 1) * (route.length - 4)) / (appleCount + 1),
    );
    return route[Math.max(3, pathIndex)];
  });
  const appleKeys = new Set(apples.map(({ row, column }) => `${row}:${column}`));
  const obstacleCount = number;
  const obstacleCandidates = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = `${row}:${column}`;
      const nearStart = startingWorm.some(
        (segment) =>
          Math.abs(segment.row - row) + Math.abs(segment.column - column) <= 1,
      );
      if (!routeKeys.has(key) && !appleKeys.has(key) && !nearStart) {
        obstacleCandidates.push({ row, column });
      }
    }
  }

  obstacleCandidates.sort(
    (first, second) =>
      hashPosition(number, first.row, first.column) -
      hashPosition(number, second.row, second.column),
  );

  return {
    number,
    name: levelNames[number - 1],
    difficulty: getDifficulty(number),
    description:
      number < 10
        ? "A sunny little puzzle to get you started."
        : number < 25
          ? "More apples and a longer trail through the orchard."
          : number < 40
            ? "A bigger board and a trickier route await."
            : "The orchard's toughest winding trails are yours to solve.",
    objective: `Collect ${appleCount} ${appleCount === 1 ? "apple" : "apples"} and reach the portal.`,
    parMoves: route.length - startingWorm.length,
    board: {
      rows,
      columns,
      worm: startingWorm,
      apples,
      obstacles: obstacleCandidates.slice(0, obstacleCount),
      portal: route[route.length - 1],
    },
  };
}

export const levels = Array.from({ length: TOTAL_LEVELS }, (_, index) =>
  createLevel(index + 1),
);

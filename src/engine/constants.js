// Faithful base-game Catan constants (2020/2015 5th-edition rulebook).
// Pure data — imported by both the engine and the UI.

/** The five producible resources, in canonical order. */
export const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'];

/** Terrain type -> resource it produces (desert produces nothing). */
export const TERRAIN_RESOURCE = {
  hills: 'brick',
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
};

/** How many of each terrain hex are on the 19-hex island. */
export const TERRAIN_COUNTS = {
  forest: 4,
  pasture: 4,
  fields: 4,
  hills: 3,
  mountains: 3,
  desert: 1,
};

/** The 18 number tokens placed on the 18 non-desert hexes. */
export const TOKEN_MULTISET = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Tokens drawn in red — the most frequently rolled; never adjacent in random setup. */
export const RED_TOKENS = [6, 8];

/** Pip count (dots) under each token = number of dice combinations that roll it. */
export const PIPS = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

/** Bank starts with this many cards of each resource. */
export const BANK_PER_RESOURCE = 19;

/** Development-card deck composition (25 cards total). */
export const DEV_DECK_COUNTS = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};

/** Pieces each player owns (their private supply). */
export const PIECE_LIMITS = {
  settlements: 5,
  cities: 4,
  roads: 15,
};

/** Resource cost to build/buy each thing. */
export const COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  devCard: { ore: 1, wool: 1, grain: 1 },
};

/** Victory-point values. */
export const VP = {
  settlement: 1,
  city: 2,
  longestRoad: 2,
  largestArmy: 2,
  victoryPoint: 1,
};

/** The 9 harbors: four generic 3:1 and one 2:1 for each resource. */
export const PORT_TYPES = [
  '3:1', '3:1', '3:1', '3:1',
  'brick', 'lumber', 'wool', 'grain', 'ore',
];

/** Minimums for the two special cards. */
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

/** Robber triggers a discard for players holding strictly more than this. */
export const ROBBER_HAND_LIMIT = 7;

/** Colour-blind-safe player colours (reinforced by patterns/labels in the UI). */
export const PLAYER_COLORS = [
  { id: 'red', label: 'Red', hex: '#d64550' },
  { id: 'blue', label: 'Blue', hex: '#2d7dd2' },
  { id: 'orange', label: 'Orange', hex: '#f4a020' },
  { id: 'violet', label: 'Violet', hex: '#8c4fbf' },
];

/** Victory-point target and starting bonus per rule variant. */
export const TARGET_VP = { standard: 10, quick: 8 };
export const QUICK_PLAY_BONUS_RESOURCES = 1;

/** Condition keys in display order. Labels and descriptions live in the string table. */
export const CONDITIONS = [
  "blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed",
  "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious", "concentration", "exhaustion", "dying",
] as const;

export type ConditionKey = typeof CONDITIONS[number];

export const EXPERIENCE_BY_CHALLENGE: Record<string, number> = {
  "0": 10, "1/8": 25, "0.125": 25, "1/4": 50, "0.25": 50, "1/2": 100, "0.5": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

/** D&D 5e (2014) per-character XP thresholds by level: [easy, medium, hard, deadly]. */
export const THRESHOLDS: number[][] = [
  [], [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];

export type DifficultyLevel = "trivial" | "easy" | "medium" | "hard" | "deadly";

/** Encounter multiplier by number of enemies. */
export const encounterMultiplier = (enemies: number): number =>
  enemies <= 1 ? 1 : enemies === 2 ? 1.5 : enemies <= 6 ? 2 : enemies <= 10 ? 2.5 : enemies <= 14 ? 3 : 4;

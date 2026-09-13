export type ParticipantKind = "player" | "enemy" | "ally";

export interface Trait { name: string; desc: string }

export interface Statblock {
  name: string;
  size?: string; type?: string; subtype?: string; alignment?: string;
  ac?: number | string; ac_class?: string; hp?: number; hit_dice?: string; speed?: string;
  stats?: number[]; saves?: Record<string, number>[] | Record<string, number>;
  skillsaves?: Record<string, number>[] | Record<string, number>; senses?: string;
  languages?: string; cr?: string | number; damage_resistances?: string;
  damage_immunities?: string; damage_vulnerabilities?: string; condition_immunities?: string;
  traits?: Trait[]; actions?: Trait[]; bonus_actions?: Trait[]; reactions?: Trait[];
  legendary_actions?: Trait[]; lair_actions?: Trait[]; regional_effects?: Trait[];
  homebrew_notes?: Trait[]; spells?: unknown[]; image?: string;
}

export interface Participant {
  id: string; name: string; kind: ParticipantKind; initiative: number | null; modifier: number;
  ac: number; hpMax: number; hp: number; temporaryHp: number; conditions: string[];
  note: string; hidden: boolean; group?: string; source?: string; statblock?: Statblock;
  cr?: string; xp?: number; level?: number;
}

export interface Combat { name: string; active: boolean; round: number; turn: number; participants: Participant[]; log: string[]; selected?: string }
export interface EncounterMember { source: string; name: string; quantity: number; group: boolean }
export interface EncounterSet { name: string; description: string; members: EncounterMember[] }
export interface ChatMessage { role: "user" | "model"; text: string; time: number }

export interface Settings {
  apiKey: string; model: string; temperature: number; systemPrompt: string; maxContext: number;
  activePointerPath: string; campaignPath: string; worldDayPath: string; includeCampaign: boolean;
  includeWorldDay: boolean; includeActiveNote: boolean; includeCombat: boolean; bestiaryPath: string;
  partyPath: string; useAverageHitPoints: boolean; groupInitiative: boolean; models: string[];
}

export const DEFAULTS: Settings = {
  apiKey: "", model: "gemini-3.8-flash", temperature: 0.8,
  systemPrompt: "You are a tabletop RPG co-facilitator. Be concise, preserve supplied canon, label inventions as suggestions, offer options instead of decisions, and never reveal secrets in read-aloud text.",
  maxContext: 24000, activePointerPath: "Active.md", campaignPath: "", worldDayPath: "",
  includeCampaign: true, includeWorldDay: true, includeActiveNote: true, includeCombat: true,
  bestiaryPath: "", partyPath: "", useAverageHitPoints: true, groupInitiative: true,
  models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash"]
};

export const EXPERIENCE_BY_CHALLENGE: Record<string, number> = { "0": 10, "1/8": 25, "0.125": 25, "1/4": 50, "0.25": 50, "1/2": 100, "0.5": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000 };
export const THRESHOLDS: number[][] = [[], [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100], [300, 600, 900, 1400], [350, 750, 1000, 1700], [450, 900, 1100, 2100], [550, 1100, 1300, 2400], [600, 1200, 1600, 2800]];

export type ParticipantKind = "player" | "enemy" | "ally";

export interface Trait { name: string; desc: string }

export interface Statblock {
  name: string;
  size?: string; type?: string; subtype?: string; alignment?: string;
  ac?: number | string; ac_class?: string;
  hp?: number; hit_dice?: string; speed?: string;
  stats?: number[];
  saves?: Record<string, number>[] | Record<string, number>;
  skillsaves?: Record<string, number>[] | Record<string, number>;
  senses?: string; languages?: string; cr?: string | number;
  damage_resistances?: string; damage_immunities?: string; damage_vulnerabilities?: string; condition_immunities?: string;
  traits?: Trait[]; actions?: Trait[]; bonus_actions?: Trait[]; reactions?: Trait[];
  legendary_actions?: Trait[]; lair_actions?: Trait[]; regional_effects?: Trait[]; homebrew_notes?: Trait[];
  spells?: unknown[];
  image?: string;
}

export interface Participant {
  id: string;
  name: string;
  kind: ParticipantKind;
  initiative: number | null;
  modifier: number;
  ac: number;
  hpMax: number;
  hp: number;
  temporaryHp: number;
  /** Condition keys from CONDITIONS, stored independently of the display language. */
  conditions: string[];
  note: string;
  /** Hidden from the players, for example during an ambush. */
  hidden: boolean;
  /** Shared-initiative group, for example several identical creatures. */
  group?: string;
  /** Vault path of the note the participant came from. */
  source?: string;
  statblock?: Statblock;
  cr?: string;
  xp?: number;
  level?: number;
}

export interface Combat {
  name: string;
  active: boolean;
  round: number;
  /** Index into the sorted participant list. */
  turn: number;
  participants: Participant[];
  log: string[];
  /** Id of the participant whose card is shown. */
  selected?: string;
}

export interface EncounterMember { source: string; name: string; quantity: number; group: boolean }
export interface EncounterSet { name: string; description: string; members: EncounterMember[] }

export interface ChatMessage { role: "user" | "model"; text: string; time: number }

export interface Settings {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  maxContext: number;
  activePointerPath: string;
  campaignPath: string;
  worldDayPath: string;
  includeCampaign: boolean;
  includeWorldDay: boolean;
  includeActiveNote: boolean;
  includeCombat: boolean;
  bestiaryPath: string;
  partyPath: string;
  /** Enemies get average hit points instead of rolled hit dice. */
  useAverageHitPoints: boolean;
  groupInitiative: boolean;
  models: string[];
  /** Comma-separated phrases that follow an attack bonus in statblock text, such as "to hit". */
  attackBonusPhrases: string;
}

export const DEFAULTS: Settings = {
  apiKey: "",
  model: "gemini-3.8-flash",
  temperature: 0.8,
  systemPrompt: `You co-run a tabletop RPG session. You work for the game master, not for the players.
Rules:
- Answer briefly and concretely. The GM reads this at the table, between two sentences from the players.
- Stay within the canon of the supplied context (campaign, notes, combat state). If you invent something, mark it "(suggestion)".
- Offer options, not decisions: two or three variants, one sentence each, unless the GM asks for a single thing.
- Scene descriptions: three senses, at most four sentences, ready to read aloud.
- NPCs: speak from what they want and what they fear; this is in the "wants" and "secret" fields.
- Give mechanics in the format of the campaign's system (for D&D 5e: DC, d20, advantage or disadvantage). Do not invent rules that are not in the context; if you do not know, say so.
- Never reveal secrets in text marked as read-aloud.`,
  maxContext: 24000,
  activePointerPath: "Active.md",
  campaignPath: "",
  worldDayPath: "",
  includeCampaign: true,
  includeWorldDay: true,
  includeActiveNote: true,
  includeCombat: true,
  bestiaryPath: "",
  partyPath: "",
  useAverageHitPoints: true,
  groupInitiative: true,
  models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash"],
  attackBonusPhrases: "to hit",
};

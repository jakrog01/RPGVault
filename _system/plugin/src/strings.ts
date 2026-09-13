export const englishStrings = {
  combat: "Combat", assistant: "Assistant", openCombat: "Open combat tracker", openAssistant: "Open assistant", nextTurn: "Combat: next turn", previousTurn: "Combat: previous turn", rollInitiative: "Combat: roll initiative", clearCombat: "Combat: clear", selectedText: "Assistant: ask about selected text", selectText: "Select text first.",
  apiKey: "API key", apiKeyDescription: "Stored locally in this plugin data file. Do not commit it.", model: "Model", fetchModels: "Fetch models", temperature: "Temperature", systemPrompt: "System prompt", contextLimit: "Context limit", activePointer: "Active run pointer", campaignOverride: "Campaign note override", dayOverride: "World-day note override", bestiaryOverride: "Bestiary folder override", partyOverride: "Party folder override", averageHitPoints: "Use average enemy hit points", sharedInitiative: "Use shared initiative for groups",
  campaignContext: "Campaign", dayContext: "World day", noteContext: "Note", combatContext: "Combat", attachNote: "Attach a note", newConversation: "New conversation", ready: "The assistant is ready.", addKey: "Add a Google AI key in Table Tools settings to begin.", message: "Message", send: "Send", stop: "Stop", conditions: "Conditions", add: "Add", save: "Save", remove: "Remove", edit: "Edit", start: "Start", round: "Round", players: "Players", enemies: "Enemies", emptyCombat: "Combat is empty.", damage: "Damage", healing: "Healing", temporaryHitPoints: "Temporary hit points", invalidStatblock: "Invalid statblock YAML",
  conditionBlinded: "Blinded", conditionCharmed: "Charmed", conditionDeafened: "Deafened", conditionFrightened: "Frightened", conditionGrappled: "Grappled", conditionIncapacitated: "Incapacitated", conditionInvisible: "Invisible", conditionParalyzed: "Paralyzed", conditionPetrified: "Petrified", conditionPoisoned: "Poisoned", conditionProne: "Prone", conditionRestrained: "Restrained", conditionStunned: "Stunned", conditionUnconscious: "Unconscious", conditionConcentration: "Concentration", conditionExhaustion: "Exhaustion", conditionDying: "Dying"
} as const;

export type StringKey = keyof typeof englishStrings;
export type Strings = typeof englishStrings;
export const createStrings = (override: unknown): Strings => {
  if (!override || typeof override !== "object" || Array.isArray(override)) return englishStrings;
  const result = { ...englishStrings } as Record<StringKey, string>;
  for (const key of Object.keys(englishStrings) as StringKey[]) if (typeof (override as Record<string, unknown>)[key] === "string") result[key] = (override as Record<string, string>)[key];
  return result;
};

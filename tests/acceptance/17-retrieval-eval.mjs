// Prompt 17: retrieval quality gate over a two-campaign vault, lexical only (embedding provider none).
// Recall@5 and MRR are measured on distinct note paths from hybridSearch; any cross-scope or spoiler leak fails.
import { assert, boot, createVault, idle, run, startObsidian, test, unload } from "./support.mjs"

const NOTES = [
  // Glassgate, system dnd5e: people
  ["Campaigns/Glass/Npcs/Erin Vale.md", { type: "npc", aliases: ["Harbor Master"] }, "# Erin Vale\nErin runs the harbor office and inspects every ship that docks.\n\n## Wants\nShe wants the harbor chain repaired before the storm season.\n\n## Fears\nShe fears the smugglers bribed her deputy."],
  ["Campaigns/Glass/Npcs/Tobias Reed.md", { type: "npc" }, "# Tobias Reed\nTobias is the deputy harbor clerk.\n\n## Secret\nHe takes silver from the smugglers to forget cargo manifests."],
  ["Campaigns/Glass/Npcs/Mira Quell.md", { type: "npc", aliases: ["The Clockmaker"] }, "# Mira Quell\nMira repairs the great clock in the gate tower.\n\n## Wants\nShe wants brass gears from the collapsed foundry."],
  ["Campaigns/Glass/Npcs/Captain Hale.md", { type: "npc" }, "# Captain Hale\nHale commands the city watch from the north barracks.\n\n## Temperament\nStern, fair, and tired of politics."],
  ["Campaigns/Glass/Npcs/Old Bess.md", { type: "npc" }, "# Old Bess\nBess sells fried eels by the fish market and hears every rumour."],
  ["Campaigns/Glass/Npcs/Lord Anselm.md", { type: "npc" }, "# Lord Anselm\nAnselm chairs the merchant council.\n\n## Agenda\nHe plans to tax the lighthouse keepers."],
  // Glassgate: places
  ["Campaigns/Glass/Locations/Gate Tower.md", { type: "location" }, "# Gate Tower\nThe tower holds the storm-powered gate mechanism and the great clock.\n\n## Hazards\nLoose stairs and lightning rods that arc during storms."],
  ["Campaigns/Glass/Locations/Fish Market.md", { type: "location" }, "# Fish Market\nStalls of eels, crabs, and salt cod crowd the lower quay at dawn."],
  ["Campaigns/Glass/Locations/Collapsed Foundry.md", { type: "location" }, "# Collapsed Foundry\nA burned foundry east of the canal, full of rusted molds and brass scrap.\n\n## Danger\nThe floor gives way above a flooded cellar."],
  ["Campaigns/Glass/Locations/Lighthouse.md", { type: "location" }, "# Lighthouse\nThe lighthouse keepers burn whale oil and log every passing vessel."],
  ["Campaigns/Glass/Locations/North Barracks.md", { type: "location" }, "# North Barracks\nWatch headquarters with a small armory and three cells."],
  // Glassgate: factions and quests
  ["Campaigns/Glass/Factions/Tide Smugglers.md", { type: "faction" }, "# Tide Smugglers\nA crew moving stolen memory glass through the harbor at low tide.\n\n## Leader\nA masked woman called the Heron."],
  ["Campaigns/Glass/Factions/Merchant Council.md", { type: "faction" }, "# Merchant Council\nSeven guild heads who control tariffs and the harbor chain budget."],
  ["Campaigns/Glass/Quests/Broken Chain.md", { type: "quest", status: "active" }, "# Broken Chain\nRepair the harbor chain before the storm season; the council refuses to fund it."],
  ["Campaigns/Glass/Quests/Missing Gears.md", { type: "quest", status: "dormant" }, "# Missing Gears\nRecover brass gears from the collapsed foundry for the clockmaker."],
  ["Campaigns/Glass/Secrets/The Heron.md", { type: "lore", "gm-only": true }, "# The Heron\nThe Heron is secretly Lord Anselm's daughter, Celia."],
  // Glassgate: bestiary, homebrew, lore
  ["Library/Mechanics/dnd5e/Bestiary/Storm Wisp.md", { type: "creature", system: "dnd5e" }, ["# Storm Wisp", "```statblock", "name: Storm Wisp", "ac: 14", "hp: 22", "```", "Feeds on static. Resistant to lightning damage."].join("\n")],
  ["Library/Mechanics/dnd5e/Bestiary/Harbor Ghoul.md", { type: "creature", system: "dnd5e" }, ["# Harbor Ghoul", "```statblock", "name: Harbor Ghoul", "ac: 12", "hp: 30", "```", "Drowned sailors that paralyse with a touch."].join("\n")],
  ["Library/Mechanics/dnd5e/Rules/Grappling.md", { type: "rules", system: "dnd5e" }, "# Grappling\nA grapple uses a Strength (Athletics) check contested by the target."],
  ["Library/Mechanics/dnd5e/Rules/Falling.md", { type: "rules", system: "dnd5e" }, "# Falling\nA creature takes 1d6 bludgeoning damage for every 10 feet it falls."],
  ["Campaigns/Glass/Mechanics/Storm Surge.md", { type: "rules", system: "dnd5e" }, "# Storm Surge\nDuring storms, lightning spells deal an extra die of damage in Glassgate."],
  ["Library/House/Critical Hits.md", { type: "rules", subtype: "house-rule", system: "dnd5e" }, "# Critical Hits\nAt our table a critical hit maximises the first damage die."],
  ["Campaigns/Glass/Lore/Memory Glass.md", { type: "lore" }, "# Memory Glass\nGlass shards that store a stolen day of someone's past. Touching one replays the memory."],
  ["Campaigns/Glass/Lore/History of the Gate.md", { type: "lore" }, `# History of the Gate\n${"The gate was built by storm-callers three centuries ago to trade with distant ports. ".repeat(12)}\n\n## The Sealing\nThe last storm-caller sealed the gate after the Drowned War.`],
  // Runs
  ["Runs/Harbor/Session 03.md", { type: "session" }, "# Session 03\nThe party chased the smugglers across rooftops and lost them near the lighthouse. Kestrel broke her wrist."],
  ["Runs/Harbor/Session 04.md", { type: "session" }, "# Session 04\nThe party bargained with Old Bess for a rumour about the Heron's boat."],
  ["Parties/Watch/Kestrel.md", { type: "pc" }, "# Kestrel\nA half-elf ranger with a hawk named Pip. Wields a longbow."],
  ["Parties/Watch/Dorian.md", { type: "pc" }, "# Dorian\nA dwarf cleric of the tide god who carries a silver bell."],
  // Ember, system coc7e: must never appear in the Glassgate GM scope
  ["Campaigns/Ember/Campaign.md", { type: "campaign", system: "coc7e" }, "Campaign: Ember."],
  ["Campaigns/Ember/Npcs/Harbor Master Kline.md", { type: "npc" }, "# Harbor Master Kline\nKline runs the Arkham harbor office and hides cult cargo."],
  ["Campaigns/Ember/Mechanics/Grappling.md", { type: "rules", system: "coc7e" }, "# Grappling\nEmber grapple uses a Fighting (Brawl) roll."],
  ["Library/Mechanics/coc7e/Rules/Sanity.md", { type: "rules", system: "coc7e" }, "# Sanity\nLose sanity points when witnessing the mythos."],
  ["Archive/Old Harbor Notes.md", { type: "lore" }, "# Old Harbor Notes\nDiscarded notes about the harbor chain."],
]

// [question, expected path]
const GM_QUESTIONS = [
  ["what does erin want", "Campaigns/Glass/Npcs/Erin Vale.md"],
  ["who is the harbor master", "Campaigns/Glass/Npcs/Erin Vale.md"],
  ["what is erin afraid of", "Campaigns/Glass/Npcs/Erin Vale.md"],
  ["which clerk takes bribes from smugglers", "Campaigns/Glass/Npcs/Tobias Reed.md"],
  ["who repairs the clock", "Campaigns/Glass/Npcs/Mira Quell.md"],
  ["the clockmaker", "Campaigns/Glass/Npcs/Mira Quell.md"],
  ["who commands the watch", "Campaigns/Glass/Npcs/Captain Hale.md"],
  ["who sells eels and hears rumours", "Campaigns/Glass/Npcs/Old Bess.md"],
  ["who wants to tax the lighthouse keepers", "Campaigns/Glass/Npcs/Lord Anselm.md"],
  ["hazards in the gate tower", "Campaigns/Glass/Locations/Gate Tower.md"],
  ["where can I buy crabs at dawn", "Campaigns/Glass/Locations/Fish Market.md"],
  ["danger in the burned foundry", "Campaigns/Glass/Locations/Collapsed Foundry.md"],
  ["what oil do the keepers burn", "Campaigns/Glass/Locations/Lighthouse.md"],
  ["how many cells in the barracks", "Campaigns/Glass/Locations/North Barracks.md"],
  ["who leads the smugglers", "Campaigns/Glass/Factions/Tide Smugglers.md"],
  ["who controls tariffs", "Campaigns/Glass/Factions/Merchant Council.md"],
  ["repairing the harbor chain quest", "Campaigns/Glass/Quests/Broken Chain.md"],
  ["recover gears for the clockmaker", "Campaigns/Glass/Quests/Missing Gears.md"],
  ["storm wisp armor class", "Library/Mechanics/dnd5e/Bestiary/Storm Wisp.md"],
  ["drowned sailors that paralyse", "Library/Mechanics/dnd5e/Bestiary/Harbor Ghoul.md"],
  ["how does grappling work", "Library/Mechanics/dnd5e/Rules/Grappling.md"],
  ["damage from falling", "Library/Mechanics/dnd5e/Rules/Falling.md"],
  ["lightning spells during storms", "Campaigns/Glass/Mechanics/Storm Surge.md"],
  ["critical hit house rule", "Library/House/Critical Hits.md"],
  ["what does memory glass do", "Campaigns/Glass/Lore/Memory Glass.md"],
  ["who sealed the gate", "Campaigns/Glass/Lore/History of the Gate.md"],
  ["when did kestrel break her wrist", "Runs/Harbor/Session 03.md"],
  ["rumour about the heron's boat", "Runs/Harbor/Session 04.md"],
  ["ranger with a hawk", "Parties/Watch/Kestrel.md"],
  ["cleric with a silver bell", "Parties/Watch/Dorian.md"],
  ["who is the heron really", "Campaigns/Glass/Secrets/The Heron.md"],
  ["inspecting ships", "Campaigns/Glass/Npcs/Erin Vale.md"],
  // Harder: no names, inflections, common words, distractors
  ["which deputy is being bribed", "Campaigns/Glass/Npcs/Tobias Reed.md"],
  ["what are the dangers of the foundry cellar", "Campaigns/Glass/Locations/Collapsed Foundry.md"],
  ["mechanism that powers the gate", "Campaigns/Glass/Locations/Gate Tower.md"],
  ["stolen glass moved at low tide", "Campaigns/Glass/Factions/Tide Smugglers.md"],
  ["how much damage when someone falls forty feet", "Library/Mechanics/dnd5e/Rules/Falling.md"],
  ["which quest is dormant", "Campaigns/Glass/Quests/Missing Gears.md"],
  ["the council refuses to pay for repairs", "Campaigns/Glass/Quests/Broken Chain.md"],
  ["creature resistant to lightning", "Library/Mechanics/dnd5e/Bestiary/Storm Wisp.md"],
  ["who chased smugglers over the rooftops", "Runs/Harbor/Session 03.md"],
  ["shards that replay a memory", "Campaigns/Glass/Lore/Memory Glass.md"],
  ["what did the storm-callers build", "Campaigns/Glass/Lore/History of the Gate.md"],
  ["who logs passing vessels", "Campaigns/Glass/Locations/Lighthouse.md"],
]

const OUT_OF_GLASS = path => path.startsWith("Campaigns/Ember/") || path.startsWith("Library/Mechanics/coc7e/") || path.startsWith("Archive/")

async function glassVault(role = "gm") {
  const env = createVault()
  env.files.get("Campaigns/Glass/Campaign.md").content = "Campaign: Glassgate, a storm-gate city."
  for (const [path, frontmatter, content] of NOTES) env.addFile(path, content, frontmatter)
  if (role === "player") {
    env.addFile("Runs/Table/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
    env.addFile("Runs/Table/State.md", "")
    env.files.get("Active.md").frontmatter.run = "[[Runs/Table/Run]]"
  }
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin, 10000)
  assert.equal(plugin.settings.embeddingProvider, "none", "the gate measures lexical retrieval")
  return plugin
}

const distinctPaths = hits => [...new Set(hits.map(hit => hit.chunk.path))]

test("GM questions: recall@5 >= 0.95 and MRR >= 0.90, with no note from another campaign, system, or the archive", async () => {
  const plugin = await glassVault("gm")
  let found = 0
  let reciprocal = 0
  const misses = []
  const leaks = []
  for (const [question, expected] of GM_QUESTIONS) {
    const ranked = distinctPaths(await plugin.index.hybridSearch(question, undefined, 50))
    const rank = ranked.indexOf(expected)
    if (rank >= 0 && rank < 5) found++
    else misses.push(`${question} -> ${JSON.stringify(ranked.slice(0, 5))}`)
    if (rank >= 0) reciprocal += 1 / (rank + 1)
    leaks.push(...ranked.slice(0, 10).filter(OUT_OF_GLASS).map(path => `${question} -> ${path}`))
  }
  const recall = found / GM_QUESTIONS.length
  const mrr = reciprocal / GM_QUESTIONS.length
  console.log(`        recall@5 ${recall.toFixed(3)}  MRR ${mrr.toFixed(3)}  (${GM_QUESTIONS.length} questions)`)
  assert.deepEqual(leaks, [], "cross-scope leak")
  assert.ok(recall >= 0.95, `recall@5 ${recall.toFixed(3)} below 0.95; misses:\n${misses.join("\n")}`)
  assert.ok(mrr >= 0.9, `MRR ${mrr.toFixed(3)} below 0.90`)
  await unload(plugin)
}, 60000)

test("player questions never surface GM material, and still find the party and the run", async () => {
  const plugin = await glassVault("player")
  const forbidden = path => path.startsWith("Campaigns/") || path.startsWith("Library/") || OUT_OF_GLASS(path) || path.startsWith("Runs/Harbor/")
  const leaks = []
  for (const [question] of GM_QUESTIONS) leaks.push(...distinctPaths(await plugin.index.hybridSearch(question, undefined, 50)).filter(forbidden).map(path => `${question} -> ${path}`))
  assert.deepEqual(leaks, [], "player scope leak")
  assert.equal(distinctPaths(await plugin.index.hybridSearch("ranger with a hawk"))[0], "Parties/Watch/Kestrel.md")
  assert.equal(distinctPaths(await plugin.index.hybridSearch("cleric with a silver bell"))[0], "Parties/Watch/Dorian.md")
  await unload(plugin)
}, 60000)

await run("17-retrieval-eval")

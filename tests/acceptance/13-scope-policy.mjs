// Prompt 13: scope policy files, role detection, campaign boundaries for rules, and rule precedence.
import { assert, boot, candidate, createVault, idle, openAssistant, paths, posts, run, sleep, sseResponse, startObsidian, test, unload, until } from "./support.mjs"

/** Asks the model mock to call one tool and returns the functionResponse.response the plugin sent back. */
async function callTool(env, plugin, name, args) {
  plugin.settings.apiKey = "AIzaTEST"
  const view = await openAssistant(env, plugin)
  let round = 0
  env.network.fetch = async () => round++ === 0 ? sseResponse([candidate([{ functionCall: { name, args } }])]) : sseResponse([candidate([{ text: "ok" }])])
  const before = posts(env).length
  await view.send(`call ${name}`)
  await until(() => !view.busy, 5000, "tool round finished")
  const request = posts(env)[before + 1]
  assert.ok(request, "a follow-up request carries the tool result")
  const part = request.contents.at(-1).parts.find(entry => entry.functionResponse?.name === name)
  assert.ok(part, `functionResponse for ${name} present`)
  return part.functionResponse.response
}

function rulesVault() {
  const env = createVault()
  env.addFile("Library/Mechanics/dnd5e/Rules/Flanking.md", "# Flanking\nFlanking grants no advantage in the core rules.", { type: "rules", system: "dnd5e" })
  env.addFile("Campaigns/Glass/Mechanics/Flanking.md", "# Flanking\nFlanking grants plus one in Glassgate.", { type: "rules", system: "dnd5e" })
  env.addFile("Library/House/Flanking.md", "# Flanking\nFlanking grants advantage at our table.", { type: "rules", subtype: "house-rule", system: "dnd5e" })
  env.addFile("Campaigns/Ember/Campaign.md", "Campaign: Ember.", { type: "campaign", system: "dnd5e" })
  env.addFile("Campaigns/Ember/Mechanics/Flanking.md", "# Flanking\nEmber flanking gives plus five.", { type: "rules", system: "dnd5e" })
  return env
}

test("lookup_rule orders house rule, campaign homebrew, then system rules, with kinds", async () => {
  const env = rulesVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const response = await callTool(env, plugin, "lookup_rule", { query: "flanking" })
  const results = response.results ?? []
  assert.deepEqual(results.map(result => result.kind), ["house-rule", "homebrew", "system"])
  assert.ok(results[0].citation.includes("Library/House/Flanking"))
  assert.ok(results[1].citation.includes("Campaigns/Glass/Mechanics/Flanking"))
  await unload(plugin)
})

test("another campaign's homebrew with the same system is invisible to search, lookup_rule, and read_note", async () => {
  const env = rulesVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.ok(!paths(plugin.index.search("ember flanking plus five", undefined, 100)).includes("Campaigns/Ember/Mechanics/Flanking.md"))
  const rules = await callTool(env, plugin, "lookup_rule", { query: "ember flanking plus five" })
  assert.ok(!JSON.stringify(rules).includes("Campaigns/Ember"), "lookup_rule leaked Ember homebrew")
  const note = await callTool(env, plugin, "read_note", { path: "Campaigns/Ember/Mechanics/Flanking.md" })
  assert.ok(note.error && !JSON.stringify(note).includes("plus five"), "read_note returned Ember homebrew")
  await unload(plugin)
})

test("a rules note that names a campaign is visible only in that campaign, whatever its system", async () => {
  const env = rulesVault()
  env.addFile("Library/House/Ember Only.md", "# Sparks\nSparkrule applies to Ember.", { type: "rules", subtype: "house-rule", system: "dnd5e", campaign: "[[Campaigns/Ember/Campaign]]" })
  env.addFile("Library/House/Glass Only.md", "# Shards\nShardrule applies to Glassgate.", { type: "rules", subtype: "house-rule", system: "pf2e", campaign: "[[Campaigns/Glass/Campaign]]" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("sparkrule")), [])
  assert.deepEqual(paths(plugin.index.search("shardrule")), ["Library/House/Glass Only.md"])
  await unload(plugin)
})

test("without an active run and without overrides no rules note is retrievable", async () => {
  const env = rulesVault()
  env.files.get("Active.md").frontmatter.run = ""
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("flanking", undefined, 100)), [])
  await unload(plugin)
})

test("the role comes from run frontmatter, not from the path", async () => {
  const env = createVault()
  env.addFile("Campaigns/Glass/Secret.md", "The vault code is nine.", { type: "lore" })
  env.addFile("Runs/Glass-Player-S01/Run.md", "", { type: "run", role: "gm", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Glass-Player-S01/State.md", "")
  env.addFile("Runs/Table/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Table/State.md", "")
  env.files.get("Active.md").frontmatter.run = "[[Runs/Glass-Player-S01/Run]]"
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.equal(plugin.index.scope().role, "gm")
  assert.deepEqual(paths(plugin.index.search("vault code nine")), ["Campaigns/Glass/Secret.md"])
  env.files.get("Active.md").frontmatter.run = "[[Runs/Table/Run]]"
  assert.equal(plugin.index.scope().role, "player")
  assert.deepEqual(paths(plugin.index.search("vault code nine")), [])
  await unload(plugin)
})

const policy = (gm, player) => JSON.stringify({ version: 1, gm, player })
const ALL_GM = ["run", "state", "campaign", "party", "system", "homebrew", "house-rule"]

test("a shipped policy at _system/assistant/scope.json is honoured", async () => {
  const env = rulesVault()
  env.adapterFiles.set("_system/assistant/scope.json", policy(ALL_GM.filter(kind => kind !== "system"), ["run", "state", "party"]))
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.ok(!paths(plugin.index.search("core rules", undefined, 100)).includes("Library/Mechanics/dnd5e/Rules/Flanking.md"))
  assert.ok(paths(plugin.index.search("glassgate", undefined, 100)).includes("Campaigns/Glass/Mechanics/Flanking.md"))
  await unload(plugin)
})

test("a local policy overrides the shipped one and takes effect when it changes, without reload", async () => {
  const env = createVault()
  env.addFile("Parties/Watch/Aria.md", "Aria hums a lullaby.", { type: "pc" })
  env.adapterFiles.set("_system/assistant/scope.json", policy(ALL_GM, ["run", "state", "party"]))
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.deepEqual(paths(plugin.index.search("lullaby")), ["Parties/Watch/Aria.md"])
  env.adapterFiles.set("_local/assistant/scope.json", policy(ALL_GM.filter(kind => kind !== "party"), ["run", "state"]))
  const file = env.addFile("_local/assistant/scope.json", "", null)
  env.emit("create", file)
  env.emit("modify", file)
  await sleep(50)
  await idle(plugin)
  await until(() => paths(plugin.index.search("lullaby")).length === 0, 3000, "party hidden after the local policy changed")
  await unload(plugin)
})

test("an invalid local policy shows the localised notice and keeps the shipped policy", async () => {
  const env = createVault()
  env.addFile("Parties/Watch/Aria.md", "Aria hums a lullaby.", { type: "pc" })
  env.adapterFiles.set("_system/assistant/scope.json", policy(ALL_GM, ["run", "state", "party"]))
  env.adapterFiles.set("_local/assistant/scope.json", "{ not json")
  env.addFile("_local/assistant/scope.json", "", null)
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.equal(typeof plugin.strings.assistantScopePolicyInvalid, "string", "contract: string key assistantScopePolicyInvalid")
  assert.ok(env.notices.includes(plugin.strings.assistantScopePolicyInvalid), `notices were ${JSON.stringify(env.notices)}`)
  assert.deepEqual(paths(plugin.index.search("lullaby")), ["Parties/Watch/Aria.md"])
  await unload(plugin)
})

await run("13-scope-policy")

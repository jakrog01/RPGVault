// Prompt 14: policy kinds and exclusions are enforced everywhere, and retrieved rules follow precedence.
import { assert, boot, createVault, idle, openAssistant, paths, run, startObsidian, test, unload } from "./support.mjs"

function rulesVault() {
  const env = createVault()
  env.addFile("Library/Mechanics/dnd5e/Rules/Flanking.md", "# Flanking\nFlanking grants no advantage in the core rules.", { type: "rules", system: "dnd5e" })
  env.addFile("Campaigns/Glass/Mechanics/Flanking.md", "# Flanking\nFlanking grants plus one in Glassgate.", { type: "rules", system: "dnd5e" })
  env.addFile("Library/House/Flanking.md", "# Flanking\nFlanking grants advantage at our table.", { type: "rules", subtype: "house-rule", system: "dnd5e" })
  return env
}

const policy = value => JSON.stringify({ version: 1, ...value })

test("a policy without house-rule hides house rules from a GM scope", async () => {
  const env = rulesVault()
  env.adapterFiles.set("_system/assistant/scope.json", policy({ gm: ["run", "state", "campaign", "party", "system", "homebrew"], player: ["run", "state", "party"] }))
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const found = paths(plugin.index.search("flanking", undefined, 20))
  assert.ok(!found.includes("Library/House/Flanking.md"), `found ${JSON.stringify(found)}`)
  assert.ok(found.includes("Campaigns/Glass/Mechanics/Flanking.md"))
  await unload(plugin)
})

test("policy exclude prefixes hide matching notes, and the shipped policy file stays valid", async () => {
  const env = rulesVault()
  env.addFile("Campaigns/Glass/Secret/Plot.md", "The twist is the mayor.", { type: "lore" })
  env.addFile("Campaigns/Glass/Open/Plot.md", "The mayor opens the fair.", { type: "lore" })
  env.adapterFiles.set("_local/assistant/scope.json", policy({ exclude: ["Campaigns/Glass/Secret/"], gm: ["run", "state", "campaign", "party", "system", "homebrew", "house-rule"], player: ["run", "state", "party"] }))
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const found = paths(plugin.index.search("mayor", undefined, 20))
  assert.ok(!found.includes("Campaigns/Glass/Secret/Plot.md"), `found ${JSON.stringify(found)}`)
  assert.ok(found.includes("Campaigns/Glass/Open/Plot.md"))
  await unload(plugin)
})

test("## Retrieved lists rule chunks as house rule, campaign homebrew, then system", async () => {
  const env = rulesVault()
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openAssistant(env, plugin)
  const context = await view.buildContext("flanking rule")
  const start = context.indexOf("## Retrieved")
  assert.ok(start >= 0, "context has a Retrieved section")
  const order = [...context.slice(start).matchAll(/\[\[([^\]#|]+)/g)].map(match => match[1]).filter(path => /Flanking/.test(path))
  assert.deepEqual(order, ["Library/House/Flanking.md", "Campaigns/Glass/Mechanics/Flanking.md", "Library/Mechanics/dnd5e/Rules/Flanking.md"])
  await unload(plugin)
})

await run("14-policy-and-precedence")

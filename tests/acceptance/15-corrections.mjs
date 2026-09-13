// Prompt 15: the shipped policy file must not hide run state or rules, and precedence must not crowd out relevant notes.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { assert, boot, createVault, idle, openAssistant, paths, run, startObsidian, test, unload } from "./support.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const shippedPolicy = () => readFileSync(path.join(root, "_system/assistant/scope.json"), "utf8")

test("with the real shipped policy a GM run can retrieve its State.md and a rules note outside the standard roots", async () => {
  const env = createVault()
  env.adapterFiles.set("_system/assistant/scope.json", shippedPolicy())
  env.files.get("Runs/Harbor/State.md").content = "State: the obsidianbell is cracked."
  env.addFile("Library/Rules/Grapple.md", "# Grapple\nGrappleclause uses strength.", { type: "rules", system: "dnd5e" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.ok(paths(plugin.index.search("obsidianbell")).includes("Runs/Harbor/State.md"), "State.md hidden by the shipped policy")
  assert.ok(paths(plugin.index.search("grappleclause")).includes("Library/Rules/Grapple.md"), "rules note hidden by the shipped policy")
  await unload(plugin)
})

test("with the real shipped policy a player run can retrieve its own State.md", async () => {
  const env = createVault()
  env.adapterFiles.set("_system/assistant/scope.json", shippedPolicy())
  env.addFile("Runs/Table/Run.md", "", { type: "run", role: "player", campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Table/State.md", "State: the player found the silverkey.")
  env.files.get("Active.md").frontmatter.run = "[[Runs/Table/Run]]"
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.equal(plugin.index.scope().role, "player")
  assert.ok(paths(plugin.index.search("silverkey")).includes("Runs/Table/State.md"))
  await unload(plugin)
})

test("rule precedence does not push the best-matching note out of ## Retrieved", async () => {
  const env = createVault()
  for (let index = 0; index < 12; index++) env.addFile(`Library/Mechanics/dnd5e/Rules/R${index}.md`, `# Rule ${index}\nWhen travelling near a harbor, roll a check.`, { type: "rules", system: "dnd5e" })
  env.addFile("Campaigns/Glass/Npcs/Erin.md", "# Erin\nErin is the harbor master. Erin wants the harbor chain repaired. Erin fears the harbor guild.", { type: "npc" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const question = "what does erin the harbor master want"
  assert.equal(paths(plugin.index.search(question, undefined, 20))[0], "Campaigns/Glass/Npcs/Erin.md", "precondition: Erin ranks first")
  const view = await openAssistant(env, plugin)
  const context = await view.buildContext(question)
  const cited = [...context.slice(context.indexOf("## Retrieved")).matchAll(/\[\[([^\]#|]+)/g)].map(match => match[1])
  assert.equal(cited[0], "Campaigns/Glass/Npcs/Erin.md", `Retrieved order was ${JSON.stringify(cited)}`)
  await unload(plugin)
})

await run("15-corrections")

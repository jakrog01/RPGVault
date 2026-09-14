// Prompt 16: campaign skills respect the player barrier, and invalid-skill notices are not repeated.
import { assert, boot, candidate, createVault, idle, openAssistant, posts, run, sleep, sseResponse, startObsidian, test, unload, until } from "./support.mjs"

const skillFile = (name, description, body) => ["---", `name: ${name}`, `description: ${description}`, "---", body].join("\n")

function campaignSkillVault(role) {
  const env = createVault()
  env.addFile("_system/assistant/skills/scene-description.md", skillFile("scene-description", "Describe a scene.", "SCENEBODY"), { name: "scene-description", description: "Describe a scene." })
  env.addFile("Campaigns/Glass/Assistant/skills/mayor.md", skillFile("mayor-voice", "Voice the mayor.", "SPOILERBODY the mayor leads the cult."), { name: "mayor-voice", description: "Voice the mayor." })
  env.addFile("Runs/Table/Run.md", "", { type: "run", role, campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]" })
  env.addFile("Runs/Table/State.md", "")
  env.files.get("Active.md").frontmatter.run = "[[Runs/Table/Run]]"
  return env
}

async function askForSkill(env, plugin) {
  plugin.settings.apiKey = "AIzaTEST"
  const view = await openAssistant(env, plugin)
  let round = 0
  env.network.fetch = async () => round++ === 0 ? sseResponse([candidate([{ functionCall: { name: "load_skill", args: { name: "mayor-voice" } } }])]) : sseResponse([candidate([{ text: "ok" }])])
  await view.send("Load the mayor skill")
  await until(() => !view.busy, 5000, "answer")
  return JSON.stringify(posts(env))
}

test("a player run neither lists nor loads campaign skills", async () => {
  const env = campaignSkillVault("player")
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const traffic = await askForSkill(env, plugin)
  assert.ok(traffic.includes("scene-description: Describe a scene."), "shared skills stay available to players")
  assert.ok(!traffic.includes("mayor-voice: Voice the mayor."), "campaign skill listed for a player run")
  assert.ok(!traffic.includes("SPOILERBODY"), "campaign skill body returned to a player run")
  await unload(plugin)
})

test("a GM run lists and loads campaign skills", async () => {
  const env = campaignSkillVault("gm")
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const traffic = await askForSkill(env, plugin)
  assert.ok(traffic.includes("mayor-voice: Voice the mayor."))
  assert.ok(traffic.includes("SPOILERBODY"))
  await unload(plugin)
})

test("the invalid-skill notice appears once per change of the invalid set, not once per reload", async () => {
  const env = campaignSkillVault("gm")
  env.addFile("_local/assistant/skills/broken.md", "no frontmatter", null)
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const mentions = () => env.notices.filter(notice => String(notice).includes("_local/assistant/skills/"))
  await until(() => mentions().length === 1, 2000, "initial notice")
  const scene = env.files.get("_system/assistant/skills/scene-description.md")
  scene.content = skillFile("scene-description", "Paint a scene.", "SCENEBODY v2")
  scene.frontmatter = { name: "scene-description", description: "Paint a scene." }
  env.emit("modify", scene.file)
  env.emit("changed", scene.file)
  env.emit("changed", env.files.get("Active.md").file)
  await sleep(200)
  await until(() => plugin.skills.get("scene-description")?.description === "Paint a scene.", 2000, "valid skill reloaded")
  assert.equal(mentions().length, 1, `notices after unrelated reloads: ${JSON.stringify(env.notices)}`)
  const second = env.addFile("_local/assistant/skills/also-broken.md", "still no frontmatter", null)
  env.emit("create", second)
  env.emit("changed", second)
  await until(() => mentions().length === 2, 2000, "notice for the new invalid file")
  await sleep(200)
  assert.equal(mentions().length, 2)
  assert.ok(String(mentions()[1]).includes("_local/assistant/skills/also-broken.md"))
  await unload(plugin)
})

await run("16-corrections")

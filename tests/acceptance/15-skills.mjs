// Prompt 15: skills come from frontmatter, reload on change, report invalid files, and load through hints or load_skill.
import { assert, boot, candidate, createVault, idle, openAssistant, posts, run, sleep, sseResponse, startObsidian, test, unload, until } from "./support.mjs"

const skillFile = (name, description, body) => ["---", `name: ${name}`, `description: ${description}`, "---", body].join("\n")

function skillVault() {
  const env = createVault()
  env.addFile("_system/assistant/skills/scene-description.md", skillFile("scene-description", "Describe a scene.", "SCENEBODY use three senses."), { name: "scene-description", description: "Describe a scene." })
  env.addFile("_system/assistant/skills/rules-adjudication.md", skillFile("rules-adjudication", "Adjudicate rules.", "RULESBODY call lookup_rule first."), { name: "rules-adjudication", description: "Adjudicate rules." })
  return env
}

async function ready(env) {
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  plugin.settings.apiKey = "AIzaTEST"
  const view = await openAssistant(env, plugin)
  env.network.fetch = async () => sseResponse([candidate([{ text: "Done." }])])
  return { plugin, view }
}

const requestText = request => JSON.stringify(request)

test("frontmatter values containing colons are read intact from the metadata cache", async () => {
  const env = skillVault()
  env.addFile("_local/assistant/skills/colon.md", skillFile("colon-skill", "Rules: use lookup_rule, then cite.", "COLONBODY"), { name: "colon-skill", description: "Rules: use lookup_rule, then cite." })
  const { plugin } = await ready(env)
  assert.equal(plugin.skills.get("colon-skill")?.description, "Rules: use lookup_rule, then cite.")
  assert.equal(plugin.skills.get("colon-skill")?.body, "COLONBODY")
  await unload(plugin)
})

test("an invalid skill file raises one localised notice naming its path and is skipped", async () => {
  const env = skillVault()
  env.addFile("_local/assistant/skills/broken.md", ["---", "name: broken", "---", "No description."].join("\n"), { name: "broken" })
  const { plugin } = await ready(env)
  assert.equal(typeof plugin.strings.assistantSkillInvalid, "string", "contract: string key assistantSkillInvalid")
  const matching = env.notices.filter(notice => String(notice).includes("_local/assistant/skills/broken.md"))
  assert.equal(matching.length, 1, `notices were ${JSON.stringify(env.notices)}`)
  assert.equal(plugin.skills.has("broken"), false)
  await unload(plugin)
})

test("editing a skill file changes the skills list sent with the next question", async () => {
  const env = skillVault()
  const { plugin, view } = await ready(env)
  env.editFile("_system/assistant/skills/scene-description.md", skillFile("scene-description", "Paint a vivid scene.", "SCENEBODY v2"), { name: "scene-description", description: "Paint a vivid scene." })
  await sleep(50)
  await idle(plugin)
  await until(() => plugin.skills.get("scene-description")?.description === "Paint a vivid scene.", 3000, "skill reloaded")
  await view.send("Anything new?")
  await until(() => !view.busy, 5000, "answer")
  assert.ok(requestText(posts(env).at(-1)).includes("scene-description: Paint a vivid scene."))
  await unload(plugin)
})

test("skill bodies are not sent with a free question, but load_skill returns the body", async () => {
  const env = skillVault()
  const { plugin, view } = await ready(env)
  await view.send("Tell me about the docks")
  await until(() => !view.busy, 5000, "answer")
  const first = requestText(posts(env).at(-1))
  assert.ok(first.includes("scene-description: Describe a scene."), "skill names and descriptions are listed")
  assert.ok(!first.includes("SCENEBODY") && !first.includes("RULESBODY"), "skill bodies leaked into a free question")
  let round = 0
  env.network.fetch = async () => round++ === 0 ? sseResponse([candidate([{ functionCall: { name: "load_skill", args: { name: "rules-adjudication" } } }])]) : sseResponse([candidate([{ text: "Loaded." }])])
  await view.send("Load the rules skill")
  await until(() => !view.busy, 5000, "answer")
  assert.ok(requestText(posts(env).at(-1)).includes("RULESBODY"))
  await unload(plugin)
})

test("quick prompts send the matching skill body in the first request", async () => {
  const env = skillVault()
  const { plugin, view } = await ready(env)
  const buttons = []
  const collect = element => { if (element.classes?.has("tt-as-quick-button")) buttons.push(element); element.children?.forEach(collect) }
  collect(view.contentEl)
  const scene = buttons.find(button => button.attributes?.title === plugin.strings.quickScenePrompt)
  assert.ok(scene, "scene quick prompt button exists")
  const before = posts(env).length
  scene.onclick()
  await until(() => posts(env).length > before && !view.busy, 5000, "quick prompt answered")
  const first = posts(env)[before]
  assert.ok(requestText(first).includes("SCENEBODY"), "scene-description body missing from the first request")
  assert.ok(first.contents.at(-1).parts[0].text.endsWith(`GM question: ${plugin.strings.quickScenePrompt.trim()}`), "quick prompt text unchanged")
  await unload(plugin)
})

await run("15-skills")

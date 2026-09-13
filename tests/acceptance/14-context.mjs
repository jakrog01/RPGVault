// Prompt 14: budgeted context, retrieval instructions, deduplication, Sources, and chunk headers.
import { assert, boot, candidate, createVault, idle, openAssistant, paths, posts, run, sseResponse, startObsidian, test, unload, until } from "./support.mjs"

const find = (root, predicate, found = []) => {
  if (predicate(root)) found.push(root)
  for (const child of root.children ?? []) find(child, predicate, found)
  return found
}
const textOf = element => `${element.ownText ?? ""}${(element.children ?? []).map(textOf).join("")}`

test("retrieval instructions are sent as a second system instruction part", async () => {
  const env = createVault()
  env.addFile("Campaigns/Glass/Docks.md", "The docks smell of tar.", { type: "location" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  plugin.settings.apiKey = "AIzaTEST"
  plugin.settings.systemPrompt = "Custom GM prompt."
  const view = await openAssistant(env, plugin)
  env.network.fetch = async () => sseResponse([candidate([{ text: "Tar." }])])
  await view.send("What do the docks smell of?")
  await until(() => !view.busy, 5000, "answer")
  const parts = posts(env).at(-1).system_instruction.parts
  assert.equal(typeof plugin.strings.assistantRetrievalInstructions, "string", "contract: string key assistantRetrievalInstructions")
  assert.equal(parts[0].text, "Custom GM prompt.")
  assert.equal(parts[1]?.text, plugin.strings.assistantRetrievalInstructions)
  await unload(plugin)
})

test("pinned notes are not repeated in ## Retrieved", async () => {
  const env = createVault()
  env.files.get("Campaigns/Glass/Campaign.md").content = "Campaign: Glassgate, city of the storm gate."
  env.files.get("Runs/Harbor/State.md").content = "State: the storm gate is open."
  const active = env.addFile("Campaigns/Glass/Gate.md", "The storm gate hums at night.", { type: "location" })
  env.addFile("Campaigns/Glass/Tower.md", "The storm tower watches the gate.", { type: "location" })
  env.workspace.activeFile = active
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openAssistant(env, plugin)
  const context = await view.buildContext("storm gate")
  const retrieved = context.slice(context.indexOf("## Retrieved"))
  const cited = [...retrieved.matchAll(/\[\[([^\]#|]+)/g)].map(match => match[1])
  assert.ok(cited.includes("Campaigns/Glass/Tower.md"), `cited ${JSON.stringify(cited)}`)
  for (const pinned of ["Campaigns/Glass/Campaign.md", "Runs/Harbor/State.md", "Runs/Harbor/Run.md", "Campaigns/Glass/Gate.md"]) assert.ok(!cited.includes(pinned), `${pinned} repeated`)
  await unload(plugin)
})

test("default settings keep pinned and retrieved context within the token budget without truncation", async () => {
  const env = createVault()
  const paragraph = "The lantern guild meets in the harbor hall and argues about oil prices. ".repeat(32)
  for (let index = 0; index < 8; index++) env.addFile(`Campaigns/Glass/Guild/G${index}.md`, `# Guild ${index}\n${paragraph}`, { type: "lore" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const view = await openAssistant(env, plugin)
  const context = await view.buildContext("lantern guild harbor hall")
  assert.ok(!context.includes("[context truncated]"), "context was truncated")
  assert.ok(Math.ceil(context.length / 4) <= plugin.settings.contextBudgetTokens, `about ${Math.ceil(context.length / 4)} tokens > budget ${plugin.settings.contextBudgetTokens}`)
  assert.ok(/\[\[Campaigns\/Glass\/Guild\//.test(context), "at least one guild chunk retrieved")
  await unload(plugin)
})

test("each answer shows a Sources list whose entries open the cited notes", async () => {
  const env = createVault()
  env.addFile("Campaigns/Glass/Docks.md", "The docks smell of tar and brine.", { type: "location" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  plugin.settings.apiKey = "AIzaTEST"
  const view = await openAssistant(env, plugin)
  env.network.fetch = async () => sseResponse([candidate([{ text: "Tar and brine." }])])
  await view.send("What do the docks smell of, tar or brine?")
  await until(() => !view.busy, 5000, "answer")
  const models = find(view.contentEl, element => element.classes?.has("tt-as-model"))
  const sources = find(models.at(-1), element => element.classes?.has("tt-as-sources"))
  assert.equal(sources.length, 1, "final answer has one .tt-as-sources element")
  assert.ok(textOf(sources[0]).includes(plugin.strings.assistantSources), "contract: string key assistantSources rendered")
  const entries = find(sources[0], element => element.classes?.has("tt-as-source"))
  const entry = entries.find(element => element.attributes?.["data-path"] === "Campaigns/Glass/Docks.md")
  assert.ok(entry, `source entries: ${JSON.stringify(entries.map(element => element.attributes?.["data-path"]))}`)
  await entry.onclick?.({ preventDefault() {} })
  assert.ok(env.opened.some(target => String(target).startsWith("Campaigns/Glass/Docks")), `opened ${JSON.stringify(env.opened)}`)
  await unload(plugin)
})

test("chunk breadcrumbs carry the full heading path and fenced headings do not split", async () => {
  const env = createVault()
  env.addFile("Campaigns/Glass/Harbor.md", "# Harbor\nThe harbor is busy.\n\n## Docks\nQuartermaster Vell counts crates.\n\n```\n# not a heading\nprinted sign\n```\nMore about Vell.", { type: "location" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  const hit = plugin.index.search("quartermaster vell")[0]
  assert.equal(hit?.chunk.breadcrumb, "Harbor > Docks")
  assert.ok(hit.chunk.text.includes("printed sign") && hit.chunk.text.includes("More about Vell"), "the fenced block stays inside the Docks chunk")
  assert.ok(!plugin.index.search("printed sign").some(result => result.chunk.breadcrumb.includes("not a heading")))
  await unload(plugin)
})

test("note type and path segments are searchable through the chunk header", async () => {
  const env = createVault()
  env.addFile("Campaigns/Glass/Locations/Blue Door.md", "Painted shutters and a brass knocker.", { type: "tavern" })
  const plugin = await boot(env)
  startObsidian(env)
  await idle(plugin)
  assert.ok(paths(plugin.index.search("tavern")).includes("Campaigns/Glass/Locations/Blue Door.md"), "type is searchable")
  assert.ok(paths(plugin.index.search("locations")).includes("Campaigns/Glass/Locations/Blue Door.md"), "folder is searchable")
  await unload(plugin)
})

await run("14-context")

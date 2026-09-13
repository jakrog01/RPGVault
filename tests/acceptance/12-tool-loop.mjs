// Prompt 12: the Gemini tool loop replays model turns exactly and always ends with a visible answer.
import { assert, boot, candidate, createVault, openAssistant, posts, run, sseResponse, startObsidian, test, unload, until } from "./support.mjs"

async function assistant({ fetch, requestUrl, maxToolSteps } = {}) {
  const env = createVault()
  const plugin = await boot(env)
  startObsidian(env)
  plugin.settings.apiKey = "AIzaTEST"
  if (maxToolSteps) plugin.settings.maxToolSteps = maxToolSteps
  const view = await openAssistant(env, plugin)
  if (fetch) env.network.fetch = fetch
  if (requestUrl) env.network.requestUrl = requestUrl
  return { env, plugin, view }
}

const roll = { name: "roll_dice", args: { expression: "1d4" } }

test("text and a signed function call streamed in separate chunks are replayed unchanged", async () => {
  let round = 0
  const { env, plugin, view } = await assistant({
    fetch: async () => round++ === 0
      ? sseResponse([candidate([{ text: "Let me " }]), candidate([{ text: "check. " }]), candidate([{ functionCall: roll, thoughtSignature: "SIG" }])])
      : sseResponse([candidate([{ text: "You rolled." }])]),
  })
  await view.send("Roll for me")
  await until(() => !view.busy, 5000, "answer finished")
  const [, second] = posts(env)
  assert.ok(second, "a second request follows the tool call")
  assert.deepEqual(second.contents.at(-2), { role: "model", parts: [{ text: "Let me check. " }, { functionCall: roll, thoughtSignature: "SIG" }] })
  const response = second.contents.at(-1).parts.find(part => part.functionResponse)
  assert.equal(response?.functionResponse?.name, "roll_dice")
  assert.ok(view.history.at(-1).text.includes("You rolled."))
  await unload(plugin)
})

test("a thought signature arriving in its own chunk is kept after the function call", async () => {
  let round = 0
  const { env, plugin, view } = await assistant({
    fetch: async () => round++ === 0
      ? sseResponse([candidate([{ functionCall: roll }]), candidate([{ text: "", thoughtSignature: "LATE" }])])
      : sseResponse([candidate([{ text: "Done." }])]),
  })
  await view.send("Roll")
  await until(() => !view.busy, 5000, "answer finished")
  const replayed = posts(env)[1]?.contents.at(-2)
  assert.deepEqual(replayed, { role: "model", parts: [{ functionCall: roll }, { text: "", thoughtSignature: "LATE" }] })
  await unload(plugin)
})

test("reaching the tool step limit shows the localised limit message", async () => {
  const { plugin, view } = await assistant({ maxToolSteps: 2, fetch: async () => sseResponse([candidate([{ functionCall: roll }])]) })
  await view.send("Loop forever")
  await until(() => !view.busy, 5000, "loop stopped")
  assert.ok(view.history.at(-1).text.includes(plugin.strings.assistantToolLimit), `answer was ${JSON.stringify(view.history.at(-1).text)}`)
  await unload(plugin)
})

test("the non-streaming fallback runs tools and answers", async () => {
  let round = 0
  const { env, plugin, view } = await assistant({
    fetch: async () => { throw new TypeError("blocked") },
    requestUrl: async () => ({ status: 200, json: round++ === 0 ? candidate([{ functionCall: roll, thoughtSignature: "SIG" }]) : candidate([{ text: "Fallback rolled." }]) }),
  })
  await view.send("Roll offline")
  await until(() => !view.busy, 5000, "answer finished")
  assert.equal(view.history.at(-1).text, "Fallback rolled.")
  const second = JSON.parse(env.requests.filter(request => request.method === "POST").at(-1).body)
  assert.deepEqual(second.contents.at(-2).parts, [{ functionCall: roll, thoughtSignature: "SIG" }])
  await unload(plugin)
})

test("the tool trace is stored on the final answer and rendered with it", async () => {
  let round = 0
  const { plugin, view } = await assistant({
    fetch: async () => round++ === 0 ? sseResponse([candidate([{ functionCall: roll }])]) : sseResponse([candidate([{ text: "Rolled." }])]),
  })
  await view.send("Roll with trace")
  await until(() => !view.busy, 5000, "answer finished")
  const trace = view.history.at(-1).toolTrace
  assert.equal(trace?.length, 1)
  assert.equal(trace[0].name, "roll_dice")
  const messages = []
  const collect = element => { if (element.classes?.has("tt-as-model")) messages.push(element); element.children?.forEach(collect) }
  collect(view.contentEl)
  const last = messages.at(-1)
  const found = []
  const find = element => { if (element.classes?.has("tt-as-tool-trace")) found.push(element); element.children?.forEach(find) }
  find(last)
  assert.equal(found.length, 1, "the final model message contains one .tt-as-tool-trace element")
  assert.ok(JSON.stringify(found[0], (key, value) => key === "parent" ? undefined : value).includes(plugin.strings.assistantToolTrace))
  await unload(plugin)
})

test("stopping during a tool round ends the loop with the stopped marker and no further requests", async () => {
  let round = 0
  const { env, plugin, view } = await assistant({
    fetch: async (_url, options) => round++ === 0
      ? sseResponse([candidate([{ functionCall: roll }])])
      : sseResponse([candidate([{ text: "Partial" }])], { signal: options.signal, hold: true }),
  })
  const sending = view.send("Roll slowly")
  await until(() => posts(env).length === 2, 5000, "second request started")
  view.controller.abort()
  await sending
  await until(() => !view.busy, 5000, "stopped")
  assert.ok(view.history.at(-1).text.includes(plugin.strings.stopped))
  assert.equal(posts(env).length, 2)
  await unload(plugin)
})

await run("12-tool-loop")

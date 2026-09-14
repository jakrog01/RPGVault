import assert from "node:assert/strict"
import { boot, createVault, idle, startObsidian, unload } from "./acceptance/support.mjs"

const env = createVault({
  adapterFiles: [["_local/systems/dnd5e/package.json", JSON.stringify({ id: "dnd5e", name: "Local Fifth Edition" })]],
})
const plugin = await boot(env)
plugin.settings.openHomeOnStartup = false
startObsidian(env)
await idle(plugin)
await plugin.commands.find(command => command.id === "open-home").callback()
const view = env.leaves.find(leaf => leaf.type === "tt-home").view
assert.ok(view.contentEl.textContent.includes("Local Fifth Edition"), "the local system package overrides the shipped package")
await unload(plugin)
console.log("home local system: clean")

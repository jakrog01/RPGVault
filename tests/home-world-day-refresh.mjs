import assert from "node:assert/strict"
import { boot, createVault, idle, startObsidian, unload, until } from "./acceptance/support.mjs"

const env = createVault()
env.addFile("Runs/Harbor/World Day.md", "# World Day\n\nDay one", { type: "world-day" })
const plugin = await boot(env)
plugin.settings.openHomeOnStartup = false
startObsidian(env)
await idle(plugin)
await plugin.commands.find(command => command.id === "open-home").callback()
const view = env.leaves.find(leaf => leaf.type === "tt-home").view
env.editFile("Runs/Harbor/World Day.md", "# World Day\n\nDay two", { type: "world-day" })
await until(() => view.contentEl.textContent.includes("Day two"), 2000, "world day refresh")
assert.ok(!view.contentEl.textContent.includes("Day one"))
await unload(plugin)
console.log("home world day refresh: clean")

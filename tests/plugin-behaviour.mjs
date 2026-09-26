import { runScenario } from "./support/plugin-scenario.mjs"
import assert from "node:assert/strict"
import { createEnvironment } from "./support/obsidian.mjs"

const updateEnvironment = createEnvironment()
updateEnvironment.adapterFiles.set("_system/manifest.json", JSON.stringify({ release: { repo: "owner/repo", asset: "RPGVault.zip", api: "https://example.invalid" } }))
updateEnvironment.adapterFiles.set("_system/VERSION", "1.9.0\n")
updateEnvironment.adapterFiles.set(".rpgvault/state.json", JSON.stringify({ installedVersion: "1.9.0", installId: "test" }))
updateEnvironment.network.requestUrl = async () => ({ status: 200, json: { tag_name: "v1.10.0" } })
const UpdateTools = updateEnvironment.load()
const updatePlugin = new UpdateTools(updateEnvironment.app, { id: "table-tools" })
const updateResult = await updatePlugin.checkForUpdates()
assert.equal(updateResult.latestVersion, "1.10.0", "release tags lose one v prefix")
assert.equal(updateResult.newer, true, "numeric release segments compare by value")
assert.equal(JSON.parse(updateEnvironment.adapterFiles.get(".rpgvault/state.json")).updateCheck.latestVersion, "1.10.0", "valid checks record their version")
updateEnvironment.app.vault.adapter.getBasePath = () => process.cwd()
const runnerOutput = []
const runnerExit = await updatePlugin.commandRunner("-e", ["process.stdout.write('runner output')"], chunk => runnerOutput.push(chunk))
assert.equal(runnerExit, 0, "the desktop runner resolves the child exit code")
assert.equal(runnerOutput.join(""), "runner output", "the desktop runner forwards output chunks")

// The full user-interface scenario with the shipped English strings.
await runScenario()
console.log("plugin behaviour gate: clean")

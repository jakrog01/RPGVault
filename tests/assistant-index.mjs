import assert from "node:assert/strict"
import { runScenario } from "./support/plugin-scenario.mjs"

const { env, plugin } = await runScenario()
env.addFile("Campaigns/Glass/Secret.md", "The harbor password is ember.", { "gm-only": true, type: "npc" })
env.addFile("Campaigns/Glass/Npcs/Erin.md", "# Motives\nErin protects the harbor.", { type: "npc", aliases: ["Captain Erin"] })
await plugin.index.rebuild()
const gm = plugin.index.scope()
assert.ok(plugin.index.search("Captain Erin", gm).some(hit => hit.chunk.path.endsWith("Erin.md")))
assert.ok(plugin.index.search("password", gm).some(hit => hit.chunk.path.endsWith("Secret.md")))
env.addFile("Runs/Glass-Player-S01/Run.md", "", { campaign: "[[Campaigns/Glass/Campaign]]", party: "[[Parties/Watch/Party]]", role: "player" })
env.addFile("Runs/Glass-Player-S01/State.md", "")
env.files.get("Active.md").frontmatter.run = "[[Runs/Glass-Player-S01/Run]]"
const player = plugin.index.scope()
assert.equal(plugin.index.search("password", player).length, 0)
console.log("assistant index gate: clean")

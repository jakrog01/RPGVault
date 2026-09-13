// Runs every locked acceptance test file for one prompt: node tests/acceptance/run.mjs <NN>
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const prompt = process.argv[2]
if (!prompt) {
  console.error("usage: node tests/acceptance/run.mjs <prompt number>")
  process.exit(2)
}
const directory = path.dirname(fileURLToPath(import.meta.url))
const files = readdirSync(directory).filter(name => name.startsWith(`${prompt}-`) && name.endsWith(".mjs")).sort()
if (!files.length) {
  console.error(`no acceptance tests for prompt ${prompt}`)
  process.exit(2)
}
let failed = 0
for (const file of files) {
  console.log(file)
  const result = spawnSync(process.execPath, [path.join(directory, file)], { stdio: "inherit", timeout: 180000 })
  if (result.status !== 0) failed++
}
console.log(`acceptance ${prompt}: ${files.length - failed}/${files.length} files passed`)
process.exit(failed ? 1 : 0)

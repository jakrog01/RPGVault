import fs from 'node:fs/promises'
import path from 'node:path'

const field = (text, key) => text.match(new RegExp(`^${key}:\\s*["']?([^\\n"']+)["']?\\s*$`, 'm'))?.[1]?.trim() ?? ''
const target = value => value.replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '')

export const loadSystemPackage = async (vaultRoot, system) => {
  const local = path.join(vaultRoot, '_local', 'systems', system, 'package.json')
  const shipped = path.join(vaultRoot, '_system', 'systems', system, 'package.json')
  const source = await fs.readFile(local, 'utf8').catch(() => fs.readFile(shipped, 'utf8').catch(() => fs.readFile(path.join(vaultRoot, '_system', 'systems', 'generic', 'package.json'), 'utf8')))
  return JSON.parse(source)
}

export const resolveRunContext = async (vaultRoot, runFile) => {
  const run = path.resolve(vaultRoot, runFile)
  const text = await fs.readFile(run, 'utf8')
  const campaignName = target(field(text, 'campaign'))
  const partyName = target(field(text, 'party'))
  const campaign = campaignName ? path.join(vaultRoot, 'Campaigns', campaignName, 'Campaign.md') : null
  const party = partyName ? path.join(vaultRoot, 'Parties', partyName, 'Party.md') : null
  const state = path.join(path.dirname(run), 'State.md')
  const campaignText = campaign ? await fs.readFile(campaign, 'utf8').catch(() => '') : ''
  const system = field(campaignText, 'system') || 'generic'
  return { run, campaign, party, state, system, package: await loadSystemPackage(vaultRoot, system) }
}

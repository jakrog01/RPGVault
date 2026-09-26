import { requestUrl } from "obsidian";

interface VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, value: string): Promise<void>;
}

export interface ReleaseSource { repo: string; asset: string; api: string }
export interface ReleaseCheck { source: ReleaseSource; latestVersion: string; installedVersion: string; newer: boolean }
export interface RecordedUpdate { latestVersion: string; installedVersion: string }

/** The shipped layer is read-only at runtime; the manifest allows this prefix and nothing deeper. */
const SHIPPED = "_system/";
const STATE = ".rpgvault/state.json";

const readJson = async (adapter: VaultAdapter, path: string): Promise<unknown> => JSON.parse(await adapter.read(path));

/** Builds a path in the manifest-allowlisted shipped prefix. */
export const shippedPath = (path: string): string => `${SHIPPED}${path}`;

export const releaseVersion = (tag: unknown): string | null => {
  if (typeof tag !== "string") return null;
  const value = tag.replace(/^v/, "");
  return /^\d+(\.\d+)*$/.test(value) ? value : null;
};

export const compareReleaseVersions = (left: string, right: string): number => {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
};

export const releaseSource = async (adapter: VaultAdapter): Promise<ReleaseSource> => {
  const manifest = await readJson(adapter, `${SHIPPED}manifest.json`) as { release?: Partial<ReleaseSource> };
  let local: Partial<ReleaseSource> = {};
  try {
    local = await readJson(adapter, "_local/release.json") as Partial<ReleaseSource>;
  } catch { /* The local release override is optional. */ }
  const source: Partial<ReleaseSource> = { ...manifest.release };
  for (const key of ["repo", "asset", "api"] as const) {
    const value = local?.[key];
    if (typeof value === "string" && value) source[key] = value;
  }
  if (typeof source.repo !== "string" || typeof source.asset !== "string" || typeof source.api !== "string") {
    throw new Error("release source is not configured");
  }
  return { repo: source.repo, asset: source.asset, api: source.api };
};

export const checkLatestRelease = async (adapter: VaultAdapter): Promise<ReleaseCheck> => {
  const source = await releaseSource(adapter);
  const response = await requestUrl({ url: `${source.api.replace(/\/$/, "")}/repos/${source.repo}/releases/latest`, throw: false });
  if (response.status !== 200) throw new Error(`release host returned ${response.status}`);
  const latestVersion = releaseVersion((response.json as { tag_name?: unknown } | null)?.tag_name);
  if (!latestVersion) throw new Error("release host returned no valid version tag");
  const installedVersion = (await adapter.read(`${SHIPPED}VERSION`)).trim();
  const state = await readJson(adapter, STATE) as Record<string, unknown>;
  state.updateCheck = { checkedAt: new Date().toISOString(), latestVersion, repo: source.repo };
  await adapter.write(STATE, `${JSON.stringify(state, null, 2)}\n`);
  return { source, latestVersion, installedVersion, newer: compareReleaseVersions(latestVersion, installedVersion) > 0 };
};

/** Reads a valid, newer recorded release without contacting the release host. */
export const recordedUpdate = async (adapter: VaultAdapter): Promise<RecordedUpdate | null> => {
  try {
    const state = await readJson(adapter, STATE) as { updateCheck?: { latestVersion?: unknown } };
    const latestVersion = releaseVersion(state.updateCheck?.latestVersion);
    const installedVersion = releaseVersion((await adapter.read(`${SHIPPED}VERSION`)).trim());
    if (!latestVersion || !installedVersion || compareReleaseVersions(latestVersion, installedVersion) <= 0) return null;
    return { latestVersion, installedVersion };
  } catch {
    return null;
  }
};

/** True when `.rpgvault/state.json` holds a check younger than `within` milliseconds. */
export const checkedRecently = async (adapter: VaultAdapter, within: number): Promise<boolean> => {
  try {
    const state = await readJson(adapter, STATE) as { updateCheck?: { checkedAt?: unknown } };
    const checkedAt = Date.parse(String(state.updateCheck?.checkedAt ?? ""));
    return Number.isFinite(checkedAt) && Date.now() - checkedAt < within;
  } catch {
    return false;
  }
};

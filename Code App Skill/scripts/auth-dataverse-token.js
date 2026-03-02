#!/usr/bin/env node
// Agent CLI: acquire Dataverse delegated token using @microsoft/power-apps-cli MSAL auth.
// Uses NodeMsalAuthenticationProvider for interactive browser login with persistent token caching.
// Token cache is shared with `npx power-apps init/run/push` at ~/.powerapps-cli/cache/auth/

import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
// IMPORTANT: Use createRequire to load the CJS build. The ESM build has two
// incompatibilities with Node 24+:
//   1. The package "exports" map for "./lib/*" appends ".js" automatically —
//      importing with ".js" already in the path causes "ERR_MODULE_NOT_FOUND"
//      due to double ".js.js" resolution.
//   2. Internal imports inside the ESM build use bare directory imports
//      (e.g. "./Constants") which throw "ERR_UNSUPPORTED_DIR_IMPORT" in
//      strict ESM mode on Node 22+.
// Using createRequire + the lib-cjs path avoids both issues.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { NodeMsalAuthenticationProvider } = require("@microsoft/power-apps-cli/lib-cjs/Authentication/NodeMsalAuthenticationProvider");

/**
 * Allowed Dataverse host suffixes. Token will only be sent to these domains.
 */
const ALLOWED_HOST_SUFFIXES = [
  ".dynamics.com",
  ".dynamics.cn",           // China (Mooncake)
  ".dynamics.eaglex.ic.gov", // US Gov (GCC High)
  ".dynamics365.us"          // US Gov (DoD)
];

// Singleton auth provider instance — reused across calls within one process
let _authProvider = null;

function normalizeOrgUrl(orgUrl) {
  return String(orgUrl || "").replace(/\/$/, "");
}

/**
 * Validate that a DATAVERSE_URL is a well-formed HTTPS URL pointing to a known Dynamics domain.
 * Prevents token exfiltration to attacker-controlled servers.
 */
function validateOrgUrl(orgUrl) {
  let parsed;
  try {
    parsed = new URL(orgUrl);
  } catch {
    throw new Error(`DATAVERSE_URL is not a valid URL: "${orgUrl}"`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`DATAVERSE_URL must use HTTPS. Got: "${parsed.protocol}"`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  if (!isAllowed) {
    throw new Error(
      `DATAVERSE_URL hostname "${hostname}" is not a recognized Dynamics 365 domain. ` +
      `Expected a host ending with one of: ${ALLOWED_HOST_SUFFIXES.join(", ")}`
    );
  }
}

function getEnvConfig() {
  let rawUrl;

  // Always read from config file
  try {
    const configPath = path.join(process.cwd(), ".dataverse-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      rawUrl = config.DATAVERSE_URL;
    }
  } catch (e) {
    throw new Error(`Failed to read .dataverse-config.json: ${e.message}`);
  }

  const orgUrl = normalizeOrgUrl(rawUrl);

  if (!orgUrl) {
    throw new Error("DATAVERSE_URL is required via .dataverse-config.json");
  }

  validateOrgUrl(orgUrl);

  return { orgUrl };
}

/**
 * Get or initialize the singleton NodeMsalAuthenticationProvider.
 * This provider uses interactive browser login with persistent token caching.
 * If the user already authenticated via `npx power-apps init`, the cached
 * token is reused automatically (no login prompt).
 */
async function getAuthProvider() {
  if (!_authProvider) {
    _authProvider = new NodeMsalAuthenticationProvider();
    await _authProvider.initAsync("prod");
  }
  return _authProvider;
}

/**
 * Acquire a Dataverse access token. Uses MSAL interactive browser auth with
 * persistent token cache at ~/.powerapps-cli/cache/auth/msal_cache.json.
 *
 * On first call: opens browser for interactive login.
 * On subsequent calls (same or different process): silently refreshes from cache.
 *
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh=false] — Force a new interactive auth
 * @returns {Promise<{accessToken: string, expiresOn: Date}>}
 */
async function ensureAccessToken(options = {}) {
  const { forceRefresh = false } = options;

  if (forceRefresh) {
    // Reset provider to force re-init and re-auth
    _authProvider = null;
  }

  const { orgUrl } = getEnvConfig();
  const authProvider = await getAuthProvider();
  const accessToken = await authProvider.getAccessTokenForResource(orgUrl);

  return {
    accessToken,
    // MSAL handles expiry internally; we set a nominal 1h expiry for callers
    expiresOn: new Date(Date.now() + 3600 * 1000)
  };
}

/**
 * No-op for backward compatibility.
 * MSAL manages its own persistent cache — no in-memory cleanup needed.
 */
function clearInMemoryToken() {
  // No-op: MSAL persistent cache handles token lifecycle
}

function isTokenValid(token, expiresAtUnix) {
  if (!token || !Number.isFinite(expiresAtUnix)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return expiresAtUnix - now > 120;
}

function readInMemoryToken() {
  return null; // MSAL manages cache persistently
}


async function main() {
  try {
    const token = await ensureAccessToken();
    const expiresAt = Math.floor(token.expiresOn.getTime() / 1000);
    console.log("✅ Dataverse token ready.");
    console.log(`ExpiresAtUnix: ${expiresAt}`);
  } catch (error) {
    console.error("❌ Failed to authenticate Dataverse token.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}

export {
  ensureAccessToken,
  clearInMemoryToken,
  getEnvConfig,
  normalizeOrgUrl,
  isTokenValid,
  readInMemoryToken
};

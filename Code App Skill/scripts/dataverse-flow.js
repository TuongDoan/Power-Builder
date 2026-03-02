#!/usr/bin/env node
// Agent CLI: unified orchestration — create tables (Phase 4a) then relationships/lookups (Phase 4b).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureAccessToken, clearInMemoryToken, getEnvConfig } from "./auth-dataverse-token.js";
import { createTable, assertCreateSuccess, buildEntityDefinitionFromPlan, buildQuickPlan } from "./create-dataverse-table.js";
import { buildRelationshipPayload, createRelationship, assertRelationshipSuccess } from "./create-dataverse-relationship.js";
import { toPascalCase, parseArgs, toLogicalName, parseCliJson } from "./utils.js";


// ---------------------------------------------------------------------------
// Plan parsing helpers
// ---------------------------------------------------------------------------

function readPlanFromFlowArgs(args) {
  if (args["schema-file"]) {
    const filePath = path.resolve(process.cwd(), String(args["schema-file"]));
    const raw = fs.readFileSync(filePath, "utf8");
    return parseCliJson(raw, "--schema-file contents");
  }

  if (args["schema-json"]) {
    return parseCliJson(args["schema-json"], "--schema-json");
  }

  const prefix = args.prefix || args.positional[0] || "crbc";
  const tableName = args.name || args.positional[1] || "External Table";
  return buildQuickPlan(prefix, tableName);
}

/**
 * Parse --plans-file into { tables, relationships }.
 * Reads the schema plan JSON from a file path.
 * Accepts:
 *   - Array of table plans            → { tables: [...], relationships: [] }
 *   - Object with tables/relationships → { tables: [...], relationships: [...] }
 */
function parsePlans(args) {
  if (!args["plans-file"]) {
    return null;
  }

  const filePath = path.resolve(process.cwd(), String(args["plans-file"]));
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseCliJson(raw, "--plans-file contents");

  let tables;
  let relationships = [];

  if (Array.isArray(parsed)) {
    tables = parsed;
  } else if (parsed && typeof parsed === "object") {
    tables = Array.isArray(parsed.tables) ? parsed.tables : null;
    relationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];
  }

  if (!tables || tables.length === 0) {
    throw new Error("--plans-file must contain a non-empty array or object with a non-empty tables array.");
  }

  return { tables, relationships };
}

function getPlanSchema(plan) {
  if (plan && typeof plan === "object" && plan.schema && typeof plan.schema === "object") {
    return plan.schema;
  }
  if (plan && typeof plan === "object" && plan.SchemaName) {
    return plan;
  }
  throw new Error("Each plan must include either `schema` object or top-level SchemaName payload.");
}

function buildTableConfigFromPlan(schemaPlan, args = {}, overrides = {}) {
  const entityDefinition = buildEntityDefinitionFromPlan(schemaPlan);
  const schemaName = entityDefinition.SchemaName;

  const primaryAttr = Array.isArray(entityDefinition.Attributes)
    ? entityDefinition.Attributes.find((item) => item && item.IsPrimaryName === true)
    : null;

  if (!schemaName || !primaryAttr || !primaryAttr.SchemaName) {
    throw new Error("Planned schema must include SchemaName and one primary attribute with SchemaName.");
  }

  const tableLogicalName =
    overrides.tableLogicalName ||
    overrides["table-logical-name"] ||
    args["table-logical-name"] ||
    schemaPlan.LogicalName ||
    schemaPlan.EntitySetName ||
    `${String(schemaName).toLowerCase()}s`;

  const primaryColumn =
    overrides.primaryColumn ||
    overrides["primary-column"] ||
    args["primary-column"] ||
    primaryAttr.LogicalName ||
    (schemaPlan.PrimaryName && schemaPlan.PrimaryName.LogicalName) ||
    toLogicalName(primaryAttr.SchemaName);

  return {
    schemaName,
    entityDefinition,
    tableLogicalName,
    primaryColumn,
    skipCreate: Boolean(overrides.skipCreate || overrides["skip-create"] || args["skip-create"])
  };
}

function getConfig() {
  const args = parseArgs(process.argv.slice(2));
  const plans = parsePlans(args);

  if (plans) {
    return {
      tables: plans.tables.map((plan, index) => {
        const schemaPlan = getPlanSchema(plan);
        try {
          return buildTableConfigFromPlan(schemaPlan, args, plan);
        } catch (error) {
          throw new Error(`Plan #${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
      relationships: plans.relationships
    };
  }

  const plan = readPlanFromFlowArgs(args);

  // Single plan may carry a relationships array at the top level
  const relationships = Array.isArray(plan.relationships) ? plan.relationships : [];

  return {
    tables: [buildTableConfigFromPlan(plan, args, {})],
    relationships
  };
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

async function getFlowToken(forceRefresh = false) {
  const token = await ensureAccessToken({ forceRefresh });
  return token.accessToken;
}

function createFlowTokenManager(initialAccessToken) {
  let currentToken = initialAccessToken;
  let refreshPromise = null;

  return {
    getToken() {
      return currentToken;
    },
    async refresh(staleToken) {
      if (currentToken && staleToken && currentToken !== staleToken) {
        return currentToken;
      }
      if (refreshPromise) {
        return refreshPromise;
      }
      refreshPromise = (async () => {
        const refreshed = await getFlowToken(true);
        currentToken = refreshed;
        return refreshed;
      })();
      try {
        return await refreshPromise;
      } finally {
        refreshPromise = null;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Phase 4a — Create tables
// ---------------------------------------------------------------------------

async function createTableStep(tokenManager, orgUrl, tableConfig) {
  let tokenInUse = tokenManager.getToken();
  const response = await createTable(tokenInUse, orgUrl, tableConfig.entityDefinition);

  if (response.status === 401) {
    const refreshedToken = await tokenManager.refresh(tokenInUse);
    tokenInUse = refreshedToken;
    const retry = await createTable(refreshedToken, orgUrl, tableConfig.entityDefinition);
    await assertCreateSuccess(retry, orgUrl, tableConfig.schemaName);
    return refreshedToken;
  }

  await assertCreateSuccess(response, orgUrl, tableConfig.schemaName);
  return tokenInUse;
}

// ---------------------------------------------------------------------------
// Phase 4b — Create relationships (lookup columns)
// ---------------------------------------------------------------------------

async function createRelationshipStep(tokenManager, orgUrl, relPlan) {
  const payload = buildRelationshipPayload(relPlan);
  let tokenInUse = tokenManager.getToken();

  let response = await createRelationship(tokenInUse, orgUrl, payload);

  if (response.status === 401) {
    tokenInUse = await tokenManager.refresh(tokenInUse);
    response = await createRelationship(tokenInUse, orgUrl, payload);
  }

  await assertRelationshipSuccess(response, relPlan.schemaName);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const results = {
    tables: { succeeded: [], failed: [] },
    relationships: { succeeded: [], failed: [] }
  };

  try {
    const { orgUrl } = getEnvConfig();
    const config = getConfig();
    const hasRelationships = config.relationships && config.relationships.length > 0;

    const accessToken = await getFlowToken(false);
    const tokenManager = createFlowTokenManager(accessToken);

    // ── Phase 4a: Create tables ──────────────────────────────────────────────
    console.log(`\n⚙️  Authenticated successfully.`);
    console.log(`\n--- Phase 4a: Create ${config.tables.length} table(s) ---`);

    for (const [index, tableConfig] of config.tables.entries()) {
      console.log(`\n🚀 [${index + 1}/${config.tables.length}] Creating ${tableConfig.schemaName} (${tableConfig.tableLogicalName})`);
      try {
        if (!tableConfig.skipCreate) {
          await createTableStep(tokenManager, orgUrl, tableConfig);
        } else {
          console.log(`ℹ️  Skipped create for ${tableConfig.schemaName}`);
        }
        console.log(`✅ [${index + 1}/${config.tables.length}] Done: ${tableConfig.schemaName}`);
        results.tables.succeeded.push(tableConfig.schemaName);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [${index + 1}/${config.tables.length}] Failed: ${tableConfig.schemaName}: ${msg}`);
        results.tables.failed.push({ name: tableConfig.schemaName, error: msg });
        continue;
      }
    }

    // ── Phase 4b: Create relationships ───────────────────────────────────────
    if (hasRelationships) {
      if (results.tables.failed.length > 0) {
        console.warn(`\n⚠️  ${results.tables.failed.length} table(s) failed — skipping relationship creation to avoid partial state.`);
        console.warn(`   Fix the failed tables, then re-run with --skip-create to skip existing tables.`);
        process.exitCode = 1;
      } else {
        console.log(`\n--- Phase 4b: Create ${config.relationships.length} relationship(s) ---`);

        for (const [index, relPlan] of config.relationships.entries()) {
          const label = relPlan.schemaName || `relationship #${index + 1}`;
          console.log(`\n🔗 [${index + 1}/${config.relationships.length}] ${label}`);
          console.log(`   ${relPlan.referencedEntity} (one) → ${relPlan.referencingEntity} (many)`);
          console.log(`   Lookup column: ${relPlan.lookupSchemaName}`);
          try {
            await createRelationshipStep(tokenManager, orgUrl, relPlan);
            results.relationships.succeeded.push(label);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed: ${msg}`);
            results.relationships.failed.push({ name: label, error: msg });
          }
        }
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log(`\n📊 Flow summary:`);
    console.log(`   Tables      — ✅ ${results.tables.succeeded.length} succeeded, ❌ ${results.tables.failed.length} failed`);
    if (hasRelationships) {
      console.log(`   Relationships — ✅ ${results.relationships.succeeded.length} succeeded, ❌ ${results.relationships.failed.length} failed`);
    }

    const anyFailed = results.tables.failed.length > 0 || results.relationships.failed.length > 0;
    if (anyFailed) {
      for (const f of [...results.tables.failed, ...results.relationships.failed]) {
        console.log(`   ❌ ${f.name}: ${f.error}`);
      }
      console.log(`\n💡 Re-run failed tables with --skip-create to skip already-created tables.`);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ Dataverse flow completed successfully.`);
    }

  } catch (error) {
    console.error("❌ Dataverse flow failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    clearInMemoryToken();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}

export {
  main
};

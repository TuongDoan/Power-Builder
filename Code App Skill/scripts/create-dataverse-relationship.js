#!/usr/bin/env node
// Agent CLI: create a Dataverse 1:N relationship (lookup column) between two existing tables.
// Uses RelationshipDefinitions Web API endpoint.
// Auth is handled by MSAL browser login (shared cache with npx power-apps).

import { pathToFileURL } from "node:url";
import { ensureAccessToken, getEnvConfig, normalizeOrgUrl } from "./auth-dataverse-token.js";
import { parseArgs, parseCliJson } from "./utils.js";

// ---------------------------------------------------------------------------
// Build relationship payload
// ---------------------------------------------------------------------------

/**
 * Build the RelationshipDefinitions POST payload.
 *
 * @param {object} plan
 * @param {string} plan.referencingEntity  - Logical name of the child/many-side table (lookup will appear here)
 * @param {string} plan.referencedEntity   - Logical name of the parent/one-side table
 * @param {string} plan.schemaName         - Unique name for the relationship (e.g. tuongd_Contact_Account)
 * @param {string} plan.lookupSchemaName   - Schema name of the new lookup column (e.g. tuongd_AccountId)
 * @param {string} plan.lookupDisplayName  - Human-readable label for the lookup column
 * @param {number} [plan.languageCode]     - Default 1033 (English)
 */
function buildRelationshipPayload(plan) {
    const {
        referencingEntity,
        referencedEntity,
        schemaName,
        lookupSchemaName,
        lookupDisplayName,
        languageCode = 1033,
    } = plan;

    if (!referencingEntity) throw new Error("Missing required field: referencingEntity");
    if (!referencedEntity) throw new Error("Missing required field: referencedEntity");
    if (!schemaName) throw new Error("Missing required field: schemaName");
    if (!lookupSchemaName) throw new Error("Missing required field: lookupSchemaName");
    if (!lookupDisplayName) throw new Error("Missing required field: lookupDisplayName");

    return {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        ReferencingEntity: referencingEntity,
        ReferencedEntity: referencedEntity,
        SchemaName: schemaName,
        Lookup: {
            AttributeType: "Lookup",
            // NOTE: Do NOT include "AttributeUsage" here. Dataverse rejects it
            // with 400: "The property 'AttributeUsage' does not exist on type
            // 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'."
            SchemaName: lookupSchemaName,
            DisplayName: {
                LocalizedLabels: [
                    { Label: lookupDisplayName, LanguageCode: languageCode }
                ]
            },
            RequiredLevel: {
                Value: "None",
                CanBeChanged: true
            }
        },
        CascadeConfiguration: {
            Assign: "NoCascade",
            Delete: "RemoveLink",   // Unlink child if parent deleted — safe default
            Merge: "NoCascade",
            Reparent: "NoCascade",
            Share: "NoCascade",
            Unshare: "NoCascade"
        }
    };
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function createRelationship(accessToken, orgUrl, payload) {
    const url = `${normalizeOrgUrl(orgUrl)}/api/data/v9.2/RelationshipDefinitions`;

    return fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
        },
        body: JSON.stringify(payload)
    });
}

async function createRelationshipWithAutoAuth(orgUrl, payload) {
    let tokenResult = await ensureAccessToken();
    let response = await createRelationship(tokenResult.accessToken, orgUrl, payload);

    if (response.status === 401) {
        tokenResult = await ensureAccessToken({ forceRefresh: true });
        response = await createRelationship(tokenResult.accessToken, orgUrl, payload);
    }

    return response;
}

async function assertRelationshipSuccess(response, schemaName) {
    if (response.ok) {
        const entityId = response.headers.get("OData-EntityId") || response.headers.get("odata-entityid");
        console.log(`✅ Success! Created relationship: ${schemaName}`);
        console.log("Metadata ID:", entityId || "(header not returned)");
        return;
    }

    let errorBody = "";
    try {
        errorBody = await response.text();
    } catch {
        errorBody = "Unable to read error response body.";
    }

    throw new Error(`Failed to create relationship. HTTP ${response.status} ${response.statusText}\n${errorBody}`);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Read relationship plan from CLI args.
 *
 * Option A — inline JSON:
 *   --relationship-json '{ "referencingEntity": "...", ... }'
 *
 * Option B — individual flags:
 *   --referencing-entity <logicalName>
 *   --referenced-entity  <logicalName>
 *   --schema-name        <RelationshipSchemaName>
 *   --lookup-schema-name <LookupColumnSchemaName>
 *   --lookup-display-name <"Display Label">
 */
function readPlanFromArgs(args) {
    if (args["relationship-json"]) {
        return parseCliJson(args["relationship-json"], "--relationship-json");
    }

    return {
        referencingEntity: args["referencing-entity"] || "",
        referencedEntity: args["referenced-entity"] || "",
        schemaName: args["schema-name"] || "",
        lookupSchemaName: args["lookup-schema-name"] || "",
        lookupDisplayName: args["lookup-display-name"] || "",
    };
}

// ---------------------------------------------------------------------------
// Multi-relationship flow  (--relationships-json '[{...}, {...}]')
// ---------------------------------------------------------------------------

async function runRelationshipsFlow(orgUrl, plans) {
    const results = { succeeded: [], failed: [] };

    const tokenResult = await ensureAccessToken();
    let currentToken = tokenResult.accessToken;

    console.log(`\n⚙️  Authenticated. Creating ${plans.length} relationship(s) sequentially.`);

    for (const [index, rawPlan] of plans.entries()) {
        const label = rawPlan.schemaName || `relationship #${index + 1}`;
        console.log(`\n🔗 [${index + 1}/${plans.length}] ${label}`);
        console.log(`   ${rawPlan.referencedEntity} (one) → ${rawPlan.referencingEntity} (many)`);

        try {
            const payload = buildRelationshipPayload(rawPlan);
            let response = await createRelationship(currentToken, orgUrl, payload);

            if (response.status === 401) {
                const refreshed = await ensureAccessToken({ forceRefresh: true });
                currentToken = refreshed.accessToken;
                response = await createRelationship(currentToken, orgUrl, payload);
            }

            await assertRelationshipSuccess(response, label);
            results.succeeded.push(label);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed: ${msg}`);
            results.failed.push({ relationship: label, error: msg });
        }
    }

    console.log(`\n📊 Relationship flow summary:`);
    console.log(`   ✅ Succeeded: ${results.succeeded.length}`);
    if (results.failed.length > 0) {
        console.log(`   ❌ Failed:    ${results.failed.length}`);
        for (const f of results.failed) {
            console.log(`      - ${f.relationship}: ${f.error}`);
        }
        process.exitCode = 1;
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const { orgUrl } = getEnvConfig();
    const args = parseArgs(process.argv.slice(2));

    try {
        // Multi-relationship mode
        if (args["relationships-json"]) {
            const plans = parseCliJson(args["relationships-json"], "--relationships-json");
            if (!Array.isArray(plans) || plans.length === 0) {
                throw new Error("--relationships-json must be a non-empty array of relationship plan objects.");
            }
            await runRelationshipsFlow(orgUrl, plans);
            return;
        }

        // Single relationship mode
        const plan = readPlanFromArgs(args);
        const payload = buildRelationshipPayload(plan);

        console.log(`\n🔗 Creating relationship: ${plan.schemaName}`);
        console.log(`   ${plan.referencedEntity} (one) → ${plan.referencingEntity} (many)`);
        console.log(`   Lookup column: ${plan.lookupSchemaName} ("${plan.lookupDisplayName}")`);

        const response = await createRelationshipWithAutoAuth(orgUrl, payload);
        await assertRelationshipSuccess(response, plan.schemaName);
    } catch (error) {
        console.error("❌ Failed to create Dataverse relationship.");
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    main();
}

export {
    buildRelationshipPayload,
    createRelationship,
    createRelationshipWithAutoAuth,
    assertRelationshipSuccess,
};

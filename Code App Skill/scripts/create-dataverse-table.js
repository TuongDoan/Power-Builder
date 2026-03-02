#!/usr/bin/env node
// Agent CLI: create Dataverse table with auto token refresh via MSAL browser auth.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureAccessToken, getEnvConfig, normalizeOrgUrl } from "./auth-dataverse-token.js";
import { toPascalCase, parseArgs, parseCliJson } from "./utils.js";


function toLabel(value, languageCode = 1033) {
  if (value && typeof value === "object" && Array.isArray(value.LocalizedLabels)) {
    return value;
  }

  return {
    LocalizedLabels: [{ Label: String(value), LanguageCode: languageCode }]
  };
}

function buildPrimaryNameAttribute(schemaName, displayName, description, languageCode = 1033, maxLength = 100) {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    SchemaName: schemaName,
    IsPrimaryName: true,
    RequiredLevel: {
      Value: "ApplicationRequired",
      CanBeChanged: true,
      ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings"
    },
    MaxLength: maxLength,
    FormatName: {
      Value: "Text"
    },
    DisplayName: toLabel(displayName, languageCode),
    Description: toLabel(description, languageCode)
  };
}

function hasPrimaryNameAttribute(attributes) {
  return Array.isArray(attributes) && attributes.some((item) => item && item.IsPrimaryName === true);
}

function normalizePrimaryNameAttribute(attribute, languageCode = 1033) {
  const next = { ...attribute };
  if (!next["@odata.type"]) {
    next["@odata.type"] = "Microsoft.Dynamics.CRM.StringAttributeMetadata";
  }

  if (!next.FormatName) {
    next.FormatName = { Value: "Text" };
  }

  if (!next.DisplayName) {
    next.DisplayName = toLabel("Name", languageCode);
  }

  if (!next.Description) {
    next.Description = toLabel("Primary name for the row", languageCode);
  }

  if (!next.RequiredLevel) {
    next.RequiredLevel = {
      Value: "ApplicationRequired",
      CanBeChanged: true,
      ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings"
    };
  }

  if (!next.MaxLength) {
    next.MaxLength = 100;
  }

  next.IsPrimaryName = true;
  return next;
}


/**
 * Build a quick schema plan from prefix + table name.
 * @param {string} prefix - Publisher prefix (e.g., "crbc")
 * @param {string} tableName - Human-readable table name
 * @param {number} [languageCode=1033]
 * @param {string} [dateOverride] - Optional YYYYMMDD override for testability
 */
function buildQuickPlan(prefix, tableName, languageCode = 1033, dateOverride) {
  const normalizedPrefix = String(prefix).trim();
  const normalizedName = toPascalCase(tableName);
  const dateSuffix = dateOverride || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const schemaName = `${normalizedPrefix}_${normalizedName}${dateSuffix}`;
  const displayName = String(tableName).trim();

  return {
    SchemaName: schemaName,
    DisplayName: displayName,
    DisplayCollectionName: `${displayName}s`,
    Description: `Created by script: ${schemaName}`,
    OwnershipType: "UserOwned",
    IsActivity: false,
    HasActivities: false,
    HasNotes: true,
    LanguageCode: languageCode,
    PrimaryName: {
      SchemaName: `${schemaName}Name`,
      DisplayName: "Name",
      Description: "Primary name for the row",
      MaxLength: 100
    },
    Attributes: []
  };
}

function readPlanFromArgs(args) {
  if (args["schema-file"]) {
    const filePath = path.resolve(process.cwd(), String(args["schema-file"]));
    const raw = fs.readFileSync(filePath, "utf8");
    return parseCliJson(raw, "--schema-file contents");
  }

  if (args["schema-json"]) {
    return parseCliJson(args["schema-json"], "--schema-json");
  }

  const [prefix, tableName] = args.positional;
  if (!prefix || !tableName) {
    throw new Error(
      "Usage: node scripts/create-dataverse-table.js --schema-file <path> | --schema-json '<json>' | <Prefix> \"<TableName>\""
    );
  }

  return buildQuickPlan(prefix, tableName);
}

function buildAttributeFromPlan(plan, languageCode = 1033) {
  const base = {
    SchemaName: plan.SchemaName,
    DisplayName: toLabel(plan.DisplayName || plan.SchemaName, languageCode),
    Description: toLabel(plan.Description || "", languageCode),
    RequiredLevel: {
      Value: plan.RequiredLevel || "None",
      CanBeChanged: true,
      ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings"
    }
  };

  switch (plan.Type) {
    case "String":
    case "Text":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        MaxLength: Number(plan.MaxLength || 100),
        FormatName: { Value: "Text" }
      };
    case "Memo":
    case "Multiline":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        MaxLength: Number(plan.MaxLength || 2000),
        FormatName: { Value: "TextArea" },
        ImeMode: "Auto"
      };
    case "Integer":
    case "WholeNumber":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        MinValue: plan.MinValue || -2147483648,
        MaxValue: plan.MaxValue || 2147483647,
        Format: "None"
      };
    case "Boolean":
    case "YesNo":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        OptionSet: {
          TrueOption: { Value: 1, Label: toLabel("Yes", languageCode) },
          FalseOption: { Value: 0, Label: toLabel("No", languageCode) }
        },
        DefaultValue: false
      };
    case "DateTime":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        Format: "DateAndTime",
        ImeMode: "Auto"
      };
    case "DateOnly":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        Format: "DateOnly",
        ImeMode: "Auto"
      };
    case "Money":
    case "Currency":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        Precision: 2,
        PrecisionSource: 1, // PrecisionSource.Currency
        ImeMode: "Auto"
      };
    case "Decimal":
    case "Double":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.DoubleAttributeMetadata",
        Precision: Number(plan.Precision || 2),
        MinValue: -100000000000,
        MaxValue: 100000000000,
        ImeMode: "Auto"
      };
    case "Choice":
    case "Picklist":
    case "OptionSet":
      if (!Array.isArray(plan.Options)) {
        throw new Error(`Attribute ${plan.SchemaName} of Type 'Choice' must have an 'Options' array.`);
      }
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        OptionSet: {
          IsGlobal: false,
          OptionSetType: "Picklist",
          Options: plan.Options.map((opt, i) => ({
            Value: opt.Value || (100000000 + i),
            Label: toLabel(opt.Label, languageCode)
          })),
          DisplayName: toLabel((plan.DisplayName || plan.SchemaName) + " Options", languageCode),
          Name: plan.SchemaName + "_optionset"
        }
      };
    default:
      // If no Type is specified or unknown, assume the user passed a full raw metadata object
      if (plan["@odata.type"]) return plan; // Pass through raw metadata
      if (!plan.Type) return plan; // Fallback for raw objects without Type

      throw new Error(`Unsupported Attribute Type: ${plan.Type} for ${plan.SchemaName}`);
  }
}

function buildEntityDefinitionFromPlan(plan) {
  const languageCode = Number(plan.LanguageCode || 1033);
  const schemaName = plan.SchemaName;
  if (!schemaName) {
    throw new Error("Schema plan must include SchemaName.");
  }

  // Enforce YYYYMMDD in SchemaName
  const dateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (!schemaName.match(/\d{8}$/)) {
    throw new Error(`SchemaName '${schemaName}' violation: MUST end with short date suffix (e.g. ${dateSuffix}) to prevent conflicts.`);
  }

  const displayName = plan.DisplayName || schemaName;
  const displayCollectionName = plan.DisplayCollectionName || `${displayName}s`;
  const description = plan.Description || `Created by script: ${schemaName}`;
  const ownershipType = plan.OwnershipType || "UserOwned";
  const isActivity = Boolean(plan.IsActivity);
  const hasActivities = Boolean(plan.HasActivities);
  const hasNotes = typeof plan.HasNotes === "boolean" ? plan.HasNotes : true;

  const existingAttributes = Array.isArray(plan.Attributes) ? [...plan.Attributes] : [];

  if (!hasPrimaryNameAttribute(existingAttributes)) {
    const primary = plan.PrimaryName || {
      SchemaName: `${schemaName}Name`,
      DisplayName: "Name",
      Description: "Primary name for the row",
      MaxLength: 100
    };

    if (!primary.SchemaName) {
      throw new Error("Schema plan PrimaryName must include SchemaName.");
    }

    existingAttributes.unshift(
      buildPrimaryNameAttribute(
        primary.SchemaName,
        primary.DisplayName || "Name",
        primary.Description || "Primary name for the row",
        languageCode,
        Number(primary.MaxLength || 100)
      )
    );
  }


  const attributes = existingAttributes.map((attribute) => {
    if (attribute && attribute.IsPrimaryName) {
      return normalizePrimaryNameAttribute(attribute, languageCode);
    }

    // Transform simplified plan to full metadata
    if (attribute && attribute.Type) {
      return buildAttributeFromPlan(attribute, languageCode);
    }

    return attribute;
  });

  if (!hasPrimaryNameAttribute(attributes)) {
    throw new Error("Schema plan must produce one primary name attribute (IsPrimaryName=true). ");
  }

  // Reject native relationship metadata — use String GUID reference columns instead.
  if (Array.isArray(plan.ManyToOneRelationships) && plan.ManyToOneRelationships.length > 0) {
    throw new Error("ManyToOneRelationships is not supported. Use String GUID reference columns instead.");
  }
  if (Array.isArray(plan.ManyToManyRelationships) && plan.ManyToManyRelationships.length > 0) {
    throw new Error("ManyToManyRelationships is not supported. Use String GUID reference columns instead.");
  }
  if (Array.isArray(plan.OneToManyRelationships) && plan.OneToManyRelationships.length > 0) {
    throw new Error("OneToManyRelationships is not supported. Use String GUID reference columns instead.");
  }
  if (Array.isArray(plan.LookupColumns) && plan.LookupColumns.length > 0) {
    throw new Error("LookupColumns is not supported. Use String(36) reference columns in Attributes instead.");
  }

  const entityDefinition = {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: schemaName,
    DisplayName: toLabel(displayName, languageCode),
    DisplayCollectionName: toLabel(displayCollectionName, languageCode),
    Description: toLabel(description, languageCode),
    OwnershipType: ownershipType,
    IsActivity: isActivity,
    HasActivities: hasActivities,
    HasNotes: hasNotes,
    Attributes: attributes
  };

  const passthroughFields = ["EntitySetName", "CollectionSchemaName", "PrimaryIdAttribute"];
  for (const fieldName of passthroughFields) {
    if (typeof plan[fieldName] !== "undefined") {
      entityDefinition[fieldName] = plan[fieldName];
    }
  }

  return entityDefinition;
}

async function createTable(accessToken, orgUrl, entityDefinition) {
  const url = `${normalizeOrgUrl(orgUrl)}/api/data/v9.2/EntityDefinitions`;

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    body: JSON.stringify(entityDefinition)
  });
}

async function createTableWithAutoAuth(orgUrl, entityDefinition) {
  let tokenResult = await ensureAccessToken();
  let response = await createTable(tokenResult.accessToken, orgUrl, entityDefinition);

  if (response.status !== 401) {
    return response;
  }

  tokenResult = await ensureAccessToken({ forceRefresh: true });
  response = await createTable(tokenResult.accessToken, orgUrl, entityDefinition);
  return response;
}

async function assertCreateSuccess(response, orgUrl, schemaName) {
  if (response.ok) {
    const entityId = response.headers.get("OData-EntityId") || response.headers.get("odata-entityid");
    console.log(`✅ Success! Created table: ${schemaName} at ${normalizeOrgUrl(orgUrl)}`);
    console.log("Metadata ID:", entityId || "(header not returned)");
    return;
  }

  let errorBody = "";
  try {
    errorBody = await response.text();
  } catch {
    errorBody = "Unable to read error response body.";
  }

  throw new Error(`Failed to create table. HTTP ${response.status} ${response.statusText}\n${errorBody}`);
}

async function main() {
  const { orgUrl } = getEnvConfig();
  const args = parseArgs(process.argv.slice(2));

  try {
    const plan = readPlanFromArgs(args);
    const entityDefinition = buildEntityDefinitionFromPlan(plan);

    const response = await createTableWithAutoAuth(orgUrl, entityDefinition);

    await assertCreateSuccess(response, orgUrl, entityDefinition.SchemaName);
  } catch (error) {
    console.error("❌ Failed to create Dataverse table.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}

export {
  createTable,
  createTableWithAutoAuth,
  assertCreateSuccess,
  buildEntityDefinitionFromPlan,
  buildQuickPlan,
  readPlanFromArgs
};

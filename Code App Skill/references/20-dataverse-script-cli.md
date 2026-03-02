# Reference 20: Dataverse Schema and Data via Script CLI

Use local JavaScript scripts to authenticate and create table metadata.

> [!NOTE]
> Scripts validate that `DATAVERSE_URL` is HTTPS and points to a recognized Dynamics 365 domain before sending any tokens. Authentication uses `NodeMsalAuthenticationProvider` from `@microsoft/power-apps-cli` with interactive browser login and persistent token caching at `~/.powerapps-cli/cache/auth/`. Token cache is shared with `npx power-apps init/run/push`.

## Agent execution goal
- Run `dataverse-flow.js` as the single entry point for all provisioning — it handles both phases:
  - **Phase 4a**: creates all tables sequentially.
  - **Phase 4b**: creates all relationships (lookup columns) from the `relationships` array, but only if all tables succeeded.
- Pass the full schema plan (tables + relationships) via `--plans-file` (preferred for multi-table) or `--schema-file` (single table).
- `create-dataverse-relationship.js` is used internally by the flow script. Only run it directly for debugging a specific relationship.
- Minimize retries and ambiguity by using `dataverse-flow.js` as the single command.
- Never use Playwright to get access token for dataverse provisioning.

## Planning handoff requirement (mandatory)
- Complete `references/15-database-planning.md` first.
- Run table provisioning only after app scaffold is complete.
- Copy the skill script set into the app project folder before executing provisioning commands.
- Do not read script internals unless execution errors require debugging.
- Default to single-table provisioning for simplicity.
- Use multi-table provisioning when planning shows clear need.
- Use planning output saved to `./dataverse/planning-payload.json` with `--plans-file` when multi-table is needed.
- Persist schema plan JSON inside the app project folder; never create it in the skill folder.
- Example path: `./dataverse/planning-payload.json` (relative to project root).
- Read `./scripts/schema-plan.example.json` in the project folder and use it as the template to build the schema plan JSON.
- Multi-table plans can include unlinked tables (for example master data tables).
- For cross-table 1:N relationships, use **native Dataverse lookup columns**. See `references/16-lookup-patterns.md` for the write/read pattern.


## Script set
- `scripts/auth-dataverse-token.js`: MSAL browser authentication (shared cache with `npx power-apps` CLI).
- `scripts/create-dataverse-table.js`: create table metadata from planned schema.
- `scripts/create-dataverse-relationship.js`: create 1:N relationships (lookup columns) between existing tables. (Used internally by `dataverse-flow.js`; run directly only for debugging.)
- `scripts/dataverse-flow.js`: **primary entry point** — orchestrates Phase 4a (tables) and Phase 4b (relationships) in one run.



## Fast preflight (run before create)
1. Confirm current directory is repo root containing `scripts/`.
2. Confirm `DATAVERSE_URL` is present and points to the target org.
3. Use a unique schema name per run — the `YYYYMMDD` short date suffix at the **end** of `SchemaName` is mandatory to prevent conflicts (e.g., `tuongd_NoteApp20260219` where `20260219` is the suffix).

## Recommended flow (mandatory)
1. Read `./scripts/schema-plan.example.json`, then plan schema and create schema plan JSON inside the app project folder (for example `./dataverse/planning-payload.json`).
2. For default simple runs, use a single `--schema-json` plan.
3. If multi-table is needed, save the plan to `./dataverse/planning-payload.json` from planning phase.
4. Create table(s) from planned payload.

### Canonical command (preferred)
Use this as the default path for agent execution:
```bash
node scripts/dataverse-flow.js --schema-json '{
   "SchemaName":"tuongd_NoteAppTest20260219",
   "DisplayName":"Note App Test",
   "DisplayCollectionName":"Note App Tests",
   "Description":"Test table for Note app",
   "OwnershipType":"UserOwned",
   "IsActivity":false,
   "HasActivities":false,
   "HasNotes":true,
   "PrimaryName":{
      "SchemaName":"tuongd_NoteAppTest20260219Name",
      "DisplayName":"Name",
      "Description":"Primary name",
      "MaxLength":100
   },
   "Attributes":[]
} --table-logical-name tuongd_noteapptest20260219s
```

Expected success signals:
- `✅ Success! Created table:`

## One-shot CLI patterns (no file required)

### Multi-table / Relationship flow (`--plans-file`)

When creating multiple tables or tables with relationships, save the schema plan JSON to a file (e.g. `./dataverse/planning-payload.json`) and use the `--plans-file` argument. The file accepts two JSON formats:

**Format A (Tables + Relationships):**
An object containing a `tables` array and a `relationships` array. This is the required format when your schema includes native Dataverse lookup columns.

```json
{
  "tables": [
    {
      "schema": { /* Table 1 schema */ },
      "tableLogicalName": "tuongd_notecategory20260218s"
    },
    {
      "schema": { /* Table 2 schema */ },
      "tableLogicalName": "tuongd_note20260218s"
    }
  ],
  "relationships": [
    {
      "referencingEntity":  "tuongd_note20260218s",
      "referencedEntity":   "tuongd_notecategory20260218s",
      "schemaName":         "tuongd_NoteCategory_Note20260218",
      "lookupSchemaName":   "tuongd_CategoryId",
      "lookupDisplayName":  "Category"
    }
  ]
}
```

**Format B (Tables Only):**
A flat array of table plans. Use this when creating multiple tables that don't have relationships.

```json
[
   {
      "schema": { /* Table 1 schema */ },
      "tableLogicalName": "tuongd_noteappcategory20260218s"
   },
   {
      "schema": { /* Table 2 schema */ },
      "tableLogicalName": "tuongd_noteapptag20260218s"
   }
]
```

**Command:**
```bash
node scripts/dataverse-flow.js --plans-file ./dataverse/planning-payload.json
```

Notes:
- Auth is acquired once at flow start and reused in memory for all table operations.
- On `401`, the script refreshes token once and retries the failed step.
- Per-table overrides supported: `skipCreate`.
- **Sequential Create**: Table creation runs sequentially to prevent Dataverse 429 throttling.
- The script uses an internal worker count and does not expose parallel/concurrency flags.

### Create table with inline planned schema
```bash
node scripts/create-dataverse-table.js --schema-json '{
   "SchemaName":"tuongd_ExternalTable",
   "DisplayName":"External Table",
   "DisplayCollectionName":"External Tables",
   "Description":"Created from planned schema",
   "OwnershipType":"UserOwned",
   "IsActivity":false,
   "HasActivities":false,
   "HasNotes":true,
   "PrimaryName":{
      "SchemaName":"tuongd_ExternalTableName",
      "DisplayName":"Name",
      "Description":"Primary name",
      "MaxLength":100
   },
   "Attributes":[]
}'
```

### Full one-shot flow with inline schema
```bash
node scripts/dataverse-flow.js --schema-json '{
   "SchemaName":"tuongd_ExternalTable",
   "DisplayName":"External Table",
   "DisplayCollectionName":"External Tables",
   "Description":"Flow create",
   "OwnershipType":"UserOwned",
   "IsActivity":false,
   "HasActivities":false,
   "HasNotes":true,
   "PrimaryName":{
      "SchemaName":"tuongd_ExternalTableName",
      "DisplayName":"Name",
      "Description":"Primary name",
      "MaxLength":100
   },
   "Attributes":[]
}' --table-logical-name tuongd_externaltables
```

## Schema plan rules (Web API aligned)
- Use `POST /api/data/v9.2/EntityDefinitions` payload shape.
- Must include table metadata:
   - `SchemaName`
   - `DisplayName`
   - `DisplayCollectionName`
   - `OwnershipType`
   - `IsActivity`
   - `HasActivities`
   - `HasNotes`
- Must include one primary name string attribute (`IsPrimaryName: true`) with text format.
- Labels should use `LocalizedLabels` with `LanguageCode` (default `1033`).
- **Supported Attribute Types**:
  - `String` / `Text` (Single line text)
  - `Memo` / `Multiline` (Multiline text)
  - `Integer` / `WholeNumber`
  - `Decimal` / `Double`
  - `Boolean` / `YesNo`
  - `DateTime` / `DateOnly`
  - `Money` / `Currency`
  - `Choice` / `OptionSet` (MUST include `Options` array with Label/Value pairs)

## Lookup Columns (1:N relationships)

Relationships between tables are handled using **native Dataverse lookup columns**. Do NOT use plain String(36) columns to store GUIDs — that pattern is deprecated.

> See `references/16-lookup-patterns.md` for the full app-side pattern including:
> - `@odata.bind` syntax for writing lookups
> - `_<field>_value` GUID reading convention
> - `useLookupResolver` hook for display name resolution
> - Dropdown patterns for editable lookup fields

### App-side usage summary

- **Create with a lookup** (`@odata.bind`)
```typescript
const payload = {
  tuongd_note20260219name: "Sample Note",
  'tuongd_CategoryId@odata.bind': `/tuongd_categories(${categoryId})`
};
await NotesService.create(payload);
```

- **Clear a lookup** (set bind key to null)
```typescript
const updates = {
  'tuongd_CategoryId@odata.bind': null
};
await NotesService.update(id, updates);
```

- **Read the lookup GUID** (included in `_<field>_value` from `select`)
```typescript
const result = await NotesService.getAll({
  select: ['tuongd_note20260219id', '_tuongd_categoryid_value']
});
const categoryGuid = result.value[0]._tuongd_categoryid_value;
```

## Creating 1:N Relationships (Lookup Columns) — Two-Phase Provisioning

Dataverse lookup columns on a table are **created via a relationship definition**, not as a regular attribute in the table payload. This means the provisioning flow for multi-table schemas is:

**Phase 1 — Create all tables** (without lookup columns):
**Phase 2 — Link tables** (creates the lookup column automatically):

> [!NOTE]
> **Both of these phases are heavily orchestrated and fully handled by `dataverse-flow.js` automatically.** You do NOT need to run them separately under normal circumstances. Only run `create-dataverse-relationship.js` directly if an error happens and you need to debug or retry a specific relationship.

When you POST a relationship to `RelationshipDefinitions`, Dataverse automatically creates the lookup column on the referencing (child) table. You do NOT need to add the lookup column to the table schema plan.

### Single relationship

```bash
node scripts/create-dataverse-relationship.js \
  --referencing-entity "tuongd_note20260219" \
  --referenced-entity  "tuongd_category20260219" \
  --schema-name        "tuongd_Category_Note20260219" \
  --lookup-schema-name "tuongd_CategoryId" \
  --lookup-display-name "Category"
```

### Batch relationships (recommended for multi-table plans)

Pass a JSON array with `--relationships-json`:

```bash
node scripts/create-dataverse-relationship.js \
  --relationships-json '[
    {
      "referencingEntity":  "tuongd_note20260219",
      "referencedEntity":   "tuongd_category20260219",
      "schemaName":         "tuongd_Category_Note20260219",
      "lookupSchemaName":   "tuongd_CategoryId",
      "lookupDisplayName":  "Category"
    }
  ]'
```

### Relationship field naming conventions

| Field | Convention | Example |
|-------|-----------|---------|
| `schemaName` (relationship) | `<prefix>_<ReferencedPascal>_<ReferencingPascal>` | `tuongd_Category_Note20260219` |
| `lookupSchemaName` (column on child) | `<prefix>_<ReferencedEntityPascal>Id` | `tuongd_CategoryId` |
| `lookupDisplayName` | Human-readable label | `"Category"` |
| `referencingEntity` | Logical singular name of child table | `tuongd_note20260219` |
| `referencedEntity` | Logical singular name of parent table | `tuongd_category20260219` |

### What the API creates automatically
- A lookup column named `<lookupSchemaName>` on the referencing (child) table
- A `_<lookuplogicalname>_value` read field accessible via `getAll` `select`
- The navigation property for `@odata.bind` writes

### How to reference the lookup in the schema plan

In the database planning JSON (`15-database-planning.md`), list the relationships separately under a `relationships` key. Do NOT add lookup columns to the `Attributes` array in the table plan — they are created by the relationship script:

```json
{
  "tables": [ ... ],
  "relationships": [
    {
      "referencingEntity":  "tuongd_note20260219",
      "referencedEntity":   "tuongd_category20260219",
      "schemaName":         "tuongd_Category_Note20260219",
      "lookupSchemaName":   "tuongd_CategoryId",
      "lookupDisplayName":  "Category"
    }
  ]
}
```

## Naming conventions for reliable runs
- `SchemaName`: PascalCase with publisher prefix, ending with short date `YYYYMMDD` (example: `tuongd_NoteAppTest20260219`). Human-readable display names are allowed and encouraged.
- Primary name schema: `<SchemaName>Name`.
- `tableLogicalName` (Plural): Lowercase plural form (`entitySetName`) strictly expected by these Dataverse creation scripts (example: `tuongd_noteapptest20260218s`).
- `logicalSingularName` (Singular): The singular logical name, typically used later during `pac code add-data-source` in Phase 6.
- Avoid reusing the same schema name across runs unless intentionally targeting an existing table.

## Reliability and retry behavior
- Scripts retry once on `401` by refreshing auth.
- `dataverse-flow.js` keeps token in memory during the run and clears memory cache on exit.
- In multi-table mode (`--plans-file`), all tables are processed in one Node process with one token session.
- If the process exits with code `130`, it was interrupted (for example Ctrl+C during browser auth).

## Failure triage (quick)
- `401 Unauthorized`: rerun; scripts auto-retry once via MSAL token refresh.
- `Table already exists`: change `SchemaName` and `tableLogicalName` to a new unique value.
- `400` metadata error: validate required schema fields and primary name settings.
- `400 AttributeUsage` error on relationship creation: The `LookupAttributeMetadata` type does NOT accept an `AttributeUsage` property. This was fixed in the script — ensure your local copy uses the latest `create-dataverse-relationship.js`.
- `ERR_MODULE_NOT_FOUND` with double `.js.js` or `ERR_UNSUPPORTED_DIR_IMPORT`: Node 24+ ESM compatibility issue. The `auth-dataverse-token.js` script uses `createRequire` to load the CJS build — ensure your local copy uses the latest version.
- `130` exit: restart command and finish interactive auth without interruption.

## Handoff to next reference
Pass resulting `tableLogicalName` and primary name column schema name to `30-connect-dataverse-pac.md`.

Include this exact handoff tuple after each successful run:
- `tableLogicalName` (Plural, used for script identification)
- `logicalSingularName` (Singular, used for `pac code add-data-source`)
- `primaryNameSchemaName`
- `primaryNameLogicalName`


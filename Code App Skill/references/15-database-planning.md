# Reference 15: Database Planning (Single Table First)

Use this reference after app scaffolding and before Dataverse provisioning whenever business data spans more than one entity.

## Purpose
Create a database plan after scaffolding, then provision Dataverse tables from that plan. Default to a single-table plan for simplicity, and expand to multi-table only when there is clear value.


## Relationship strategy (1:N with Native Lookups)
- Use **native Dataverse lookup columns** for relationships between tables.
- Only 1-to-Many (1:N) relationships are supported at the Code App schema level.
- The "one" side table is the dimension; the "many" side table is the fact table with the lookup column pointing to it.
- Do NOT use plain String(36) columns to store GUIDs manually.
- For the full write/read pattern with native lookup columns, see `references/16-lookup-patterns.md`.

## Planning policy (mandatory)
1. Start with business domains and entities, not columns.
2. Start with one focused table whenever possible.
3. Expand to multi-table when needed for clarity, reuse, governance, or scale.
4. Keep each table focused on one business concept.
5. Add lookup columns only when a cross-table relationship is required.
6. Multi-table plans may include independent tables (for example master data) without links.
7. Use "tuongd" as prefix.
8. Try to use 2 tables approach.

## When to choose single table vs multi-table
- Single table is the default when:
  - The app centers on one core entity.
  - The initial scope is MVP/simple workflow.
- Multi-table is required when any of the following exists:
  - Reusable categories/tags/statuses
  - Parent-child or one-to-many business behavior
  - Reporting dimensions shared across records
  - Clear separation between master data and transactions
  - Independent master data tables are needed even if no links are required initially

## Recommended logical design pattern
For each intended relationship `Fact -> Dimension` (only when needed):
- In the fact table, add a **Lookup column** pointing to the dimension table's primary key.
- In the dimension table, maintain stable key fields where needed:
  - business key (for example `tuongd_DimensionCode`)
  - optional external ID (`tuongd_DimensionExternalId`)

## Naming conventions
- **SchemaName (tables)**: `<prefix>_<PascalEntityName><YYYYMMDD>` — the `YYYYMMDD` date suffix goes at the **end** and is mandatory to avoid conflicts (e.g., `tuongd_NoteApp20260219`).
- **SchemaName (Choice columns)**: Must be **unique across the entire Dataverse environment**. Include both the **table context** and the **date suffix** to guarantee uniqueness: `<prefix>_<TableContext><ColumnConcept><YYYYMMDD>` (e.g., `tuongd_FooStatus20260302`, `tuongd_BarStatus20260302`). See the ⚠️ warning under Column Type Rules below.
- **tableLogicalName (Plural)**: The lowercase, pluralized form, used specifically by the Dataverse creation scripts (e.g., `tuongd_noteapp20260219s`).
- **logicalSingularName (Singular)**: The lowercase, singular form, used specifically by the PAC CLI `add-data-source` command in later phases (e.g., `tuongd_noteapp20260219`).
- **Lookup columns**: Named using the related entity name (e.g., `tuongd_CategoryId` pointing to `tuongd_category20260219`).
- Business key columns: `<prefix>_<EntityName>Code`.
- **Restricted Names**: Avoid general names like `status`, `owner`, `statecode`, `statuscode` as they are system reserved columns in Dataverse. Use specific names (e.g., `task_status`, `project_owner`).

## Column Type Rules
- **Choice (OptionSet)**: 

  > ⚠️ **CRITICAL — Choice column SchemaName must be globally unique**:
  > **Rule:** always include table context + date suffix in every Choice column `SchemaName`:
  > ```json
  > { "SchemaName": "tuongd_FooStatus20260302", "Type": "Choice" }  // ✅ unique
  > { "SchemaName": "tuongd_BarStatus20260302", "Type": "Choice" }  // ✅ unique
  > { "SchemaName": "tuongd_Status",            "Type": "Choice" }  // ❌ will conflict
  > ```
- **Currency**: Use `Money` type.
- **Date/Time**: Use `DateTime` type.
- **Yes/No**: Use `Boolean` type. (CRITICAL: When sending payloads to Dataverse Web API, this strictly requires actual `true`/`false` values. Do NOT pass `0` or `1` numeric representations, even if the generated TypeScript enum models suggest `{ 0: 'No', 1: 'Yes' }`. Sending integers causes: `"Cannot convert the literal '0' to the expected type 'Edm.Boolean'"`. Always use `isPinned: true` not `isPinned: 1`).
- **Numbers**: Use `Integer` or `Decimal` (Double) type.
- **Text**: Use `String` or `Memo` (Multiline) type.
- **Relationship (1:N)**: Use native **Lookup** column pointing to the related table. (This lookup column will be automatically created when the scripts provision the relationship). Do NOT use a String(36) column to store GUIDs manually.

## Output contract (planning phase) — the "schema plan"
Produce a schema plan JSON file after app scaffolding and before running provisioning scripts.

Storage rule:
- Create the schema plan JSON file inside the app project folder.
- Do not create schema plan JSON files in the skill folder.
- Example path: `./dataverse/planning-payload.json` (relative to project root).
- Source template rule: read `./scripts/schema-plan.example.json` and adapt it to produce the schema plan JSON.

Required sections:
1. `domains`: high-level business areas.
2. `tables`: array of table plans.
3. `relationships`: logical relationships with lookup column mapping.
4. `provisioningPlansJson`: executable payload for `dataverse-flow.js --plans-file`.

If no relationships are required, keep `relationships` empty and still provide valid table plans.

Each table plan must include:
- `SchemaName`
- `DisplayName`
- `DisplayCollectionName`
- `Description`
- `OwnershipType`
- `IsActivity`
- `HasActivities`
- `HasNotes`
- `PrimaryName`
- `Attributes`
- `tableLogicalName`
- `logicalSingularName`

## Handoff to app + provisioning
1. Apply the approved plan to the scaffolded app so UI/data flows are designed against the target schema.
2. Pass `provisioningPlansJson` to `20-dataverse-script-cli.md` and execute:
   - `node scripts/dataverse-flow.js --plans-file ./dataverse/planning-payload.json`

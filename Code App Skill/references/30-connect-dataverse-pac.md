# Reference 30: Connect Code App to Dataverse via PAC CLI

Use this reference after Dataverse table is ready.

## Prerequisites
- PAC CLI authenticated and correct environment selected
- App already initialized (`npx power-apps init` done)
- Table logical name available

## Table name rule for PAC
- Use the logical singular table name for `pac code add-data-source -t <tableLogicalName>`.
- Do not switch to plural collection names unless tooling explicitly requires it.
- If unsure, resolve the logical name from Dataverse metadata and reuse it unchanged.

## Command
```bash
pac code add-data-source -a dataverse -t <tableLogicalName>
```

## Expected artifacts
- Generated models and services under `/generated/` and related generated folders.
- The `/generated/` will be created in the `scr` folder.
- Service file like `<Entity>Service.ts`
- Model file like `<Entity>Model.ts`

## Usage pattern in app code
```ts
import { AccountsService } from './generated/services/AccountsService';
import type { Accounts } from './generated/models/AccountsModel';
```

## CRUD guidance
- Create: omit system-managed/read-only fields.
- Read single: use primary key.
- Read many: use selective `select` fields + filters.
- Update: send only changed properties.
- Delete: by primary key only when explicitly intended.

> [!CRITICAL]
> ## Dataverse API Error Handling, Boolean Types, and IOperationResult Shape
> 1. **Dataverse API Silent Errors:** The generated `Service.create()` (or update) methods **DO NOT throw exceptions** when Dataverse rejects a payload (e.g., 400 Bad Request). Instead, they return an `IOperationResult<T>` containing an `.error` property.
>    - **DO NOT** blindly wrap the call in a `try/catch` block and use `as never` or ignore the response. This causes a silent failure where the UI proceeds but Dataverse didn't save the data.
>    - **ALWAYS** check for `result.error` explicitly:
>      ```ts
>      const result = await AccountsService.create(payload);
>      if (result.error) {
>        console.error('Dataverse Error:', result.error);
>        showToast('Failed to save: ' + (result.error.message || 'Unknown error'), 'error');
>        return;
>      }
>      ```
>
> 2. **`IOperationResult<T>` shape — use `.data`, NOT `.value`:**
>    The result object shape is:
>    ```ts
>    interface IOperationResult<TResponse> {
>      success: boolean;
>      data: TResponse;       // ← use this to read records
>      error?: Error;
>      skipToken?: string;
>      count?: number;
>    }
>    ```
>    - Use `result.data` to access the returned records/entity.
>    - For `getAll()`, the records array is `result.data` (type `T[]`), NOT `result.value`.
>    - **NEVER** reference `result.value` — that property does not exist on `IOperationResult`.
>
> 3. **`delete()` returns `void`:** The generated `Service.delete()` method returns `Promise<void>`, NOT `IOperationResult`. There is no `.error` property to check. Wrap in try/catch if you need error handling.
>    ```ts
>    // ✅ Correct — delete returns void
>    await RecordsService.delete(id);
>    
>    // ❌ WRONG — delete has no result object
>    const result = await RecordsService.delete(id);
>    if (result.error) { /* This will crash — result is undefined */ }
>    ```
>
> 4. **Boolean / "Two Options" Columns (CRITICAL):** The Dataverse OData Web API strictly requires actual `true`/`false` boolean primitives for Yes/No columns.
>    - **DO NOT** pass `0` or `1` even if the generated TypeScript enum models suggest `{ 0: 'No', 1: 'Yes' }`.
>    - Passing numbers to boolean columns will cause Dataverse to reject with:
>      ```
>      "Cannot convert the literal '0' to the expected type 'Edm.Boolean'.
>       Cannot convert a value of type 'Edm.Int32' to the expected target type 'Edm.Boolean'."
>      ```
>    - **ALWAYS** pass `true` / `false` in the payload for Yes/No fields.
>    - When **reading**, the generated enum type uses `0 | 1` keys — use truthy coercion (`!!value`) to convert to boolean for display logic.
>
> 5. **`create()` requires `Omit<Base, 'id'>`, not `Partial`:** The generated `create()` method signature is `create(record: Omit<EntityBase, 'entityid'>)` which requires all non-optional fields including `ownerid`. Since `ownerid` is system-managed, use `as unknown as Omit<...>` type assertion for create payloads:
>    ```ts
>    const payload = {
>      entity_name: "My Record",
>      entity_description: "Details",
>      entity_ispinned: true,  // boolean, NOT 0/1
>    } as unknown as Omit<EntityBase, 'entityid'>;
>    const result = await EntityService.create(payload);
>    ```

## Metadata usage
Use `<Entity>Service.getMetadata(options)` to:
- Get user-localized labels
- Identify required fields
- Map attribute types for validation

## Validation checklist
- Generated files present.
- TypeScript compile succeeds.
- One successful `getAll` or `get` call in runtime.

## Lookup column support
Native Dataverse lookup columns are fully supported. When `pac code add-data-source` generates services for tables with lookup columns, the generated model includes `_<field>_value` read properties. Use `@odata.bind` for writes.

> [!WARNING]
> **Virtual lookup name fields:** The generated model also includes `<lookupname>name` fields (e.g. `tuongd_categoryidname`). These are **OData annotations**, NOT real columns. Dataverse returns them **automatically** when you select the `_<field>_value` GUID. **Do NOT include them in the `select` array** — doing so causes a 400 error. See `references/16-lookup-patterns.md` for details.

See `references/16-lookup-patterns.md` for the full write/read pattern and the `useLookupResolver` hook.

# Reference 35: Context + Dataverse Metadata Patterns

Use this reference when app logic depends on runtime context or dynamic schema behavior.


## Retrieve app/user/session context
```ts
import { getContext } from '@microsoft/power-apps/app';

const ctx = await getContext();
const appId = ctx.app.appId;
const environmentId = ctx.app.environmentId;
const queryParams = ctx.app.queryParams;
const fullName = ctx.user.fullName;
const objectId = ctx.user.objectId;
const tenantId = ctx.user.tenantId;
const userPrincipalName = ctx.user.userPrincipalName;
const sessionId = ctx.host.sessionId;
```

## Context usage patterns
- Telemetry correlation: include `sessionId`, `appId`, `environmentId` in logs.
- Personalization: show user-specific views from `userPrincipalName`/`objectId`.
- Feature flags: branch behavior using `queryParams`.
- **UI Display**: Never show infrastructure details (`environmentId`, `appId`, Dataverse URL, etc.) to the end user. Only show information that is useful to them.

## Local state storage rule
- Use Dataverse for persistent business data.
- `sessionStorage` is allowed only for temporary client state, such as:
  - current filters/sort
  - unsaved form draft state for current session
  - short-lived UI cache
- Do not store authoritative business records in `sessionStorage`.

## Get Dataverse table metadata
Use the `getMetadata` function to retrieve table and column configurations dynamically. This ensures the app adapts to Dataverse schema changes without code modifications.

Signature pattern:
```ts
AccountsService.getMetadata(options?: GetEntityMetadataOptions<Account>): Promise<IOperationResult<Partial<EntityMetadata>>>
```

Options pattern:
```ts
interface GetEntityMetadataOptions {
  metadata?: Array<string>; // e.g., ["Privileges", "DisplayName", "IsCustomizable"]
  schema?: {
    columns?: 'all' | Array<string>; // e.g., "all" or ["name", "telephone1"]
    oneToMany?: boolean;
    manyToOne?: boolean;
    manyToMany?: boolean;
  };
}
```

**Note:** You can't specify properties that aren't included in AttributeMetadata. Properties defined by derived types (like choice/picklist options) are not available.

## Metadata Extraction Patterns
Here are explicit, real-world patterns for processing the returned metadata. Always utilize these snippet structures exactly so the agent properly unrolls nested references.

### 1. Extract Localized Column Labels
Retrieve display names in the user's language for form labels, table headers, and accessibility text.
```ts
// Request all column metadata
const { data } = await AccountsService.getMetadata({ schema: { columns: 'all' } });
const columnDisplayNames: Record<string, string> = {};

if (data.Attributes) {
  for (const attr of data.Attributes) {
    const label = attr.DisplayName?.UserLocalizedLabel?.Label;
    if (label) {
      columnDisplayNames[attr.LogicalName] = label;
    }
  }
}
```

### 2. Identify Required Form Fields
Identify which attributes are mandatory to build client-side form validation blocks.
```ts
const { data } = await AccountsService.getMetadata({ schema: { columns: 'all' } });

// Filter attributes required for forms
const requiredColumns = (data.Attributes || [])
  .filter(attr => attr.IsRequiredForForm)
  .map(attr => ({
    logicalName: attr.LogicalName,
    displayName: attr.DisplayName?.UserLocalizedLabel?.Label,
    attributeType: attr.AttributeTypeName?.Value
  }));
```

### 3. Map Column Types for Validation & UI Selection
Get attribute types to choose appropriate UI controls (e.g. `DateTimeType`, `MoneyType`, `StringType`).
```ts
const { data } = await AccountsService.getMetadata({ schema: { columns: 'all' } });

const columnTypes = (data.Attributes || []).map(attr => ({
  logicalName: attr.LogicalName,
  attributeType: attr.AttributeTypeName?.Value
}));
```



## Lookup column handling in app runtime

Native Dataverse lookup columns are fully supported. Use `@odata.bind` syntax for writing and `_<field>_value` GUIDs for reading.

See `references/16-lookup-patterns.md` for the full pattern including:
- Write syntax (`@odata.bind`)
- Reading lookup GUIDs from `_<field>_value` fields
- The `useLookupResolver` hook for on-demand display name resolution
- Dropdown patterns for editable lookup fields

```ts
// Write a lookup on create/update
payload['parentcustomerid_account@odata.bind'] = `/accounts(${accountId})`;

// Clear a lookup
updates['parentcustomerid_account@odata.bind'] = null;

// Read a lookup GUID (returned in getAll select)
const guid = record._msa_managingpartnerid_value;
```

## Performance and safety
- Request only what you need: Prefer specific arrays of properties over `"all"` for performance optimization.
- Cache metadata calls: Metadata calls are heavy. Cache them at app start or per session using React state or Context.
- Defensive optional chaining: Always use `?.` on nested properties like `DisplayName?.UserLocalizedLabel?.Label`.
- Use TypeScript types: Rely on generated types from the Dataverse Web API for safer code.

## Layout integrity

> [!NOTE]
> Detailed layout rules (Full Width & Multi-Column Layout, desktop-first breakpoints, and layout integrity checklist) are consolidated in **`references/17-code-architecture.md`**. Always ensure UI meets those requirements.

## App Version Display (Mandatory)
Standardize the Code App Version Display so users know which build version they are using:
Update the main React component (e.g., `App.tsx`, `Layout.tsx`, or similar main UI shell) to pull the app version dynamically from `package.json`. The app version MUST be visible on the top of the app UI.

> [!IMPORTANT]
> To avoid TypeScript compilation errors when importing `package.json`, you must first ensure `"resolveJsonModule": true` is set in the `compilerOptions` of `tsconfig.app.json`.

```typescript
// Adjust relative path depending on your component's depth (e.g. from src/components/Header.tsx)
import packageJson from '../../package.json';

// In your render return, typically near the header or navigation:
<div>App Version v{packageJson.version}</div>
```

## Exit criteria
- Context read works in runtime.
- Metadata call returns expected shape.
- UI adapts to labels/requirements/relationships without hard-coded schema assumptions.
- Layout renders correctly at desktop resolution with no spacing, alignment, or overflow issues.

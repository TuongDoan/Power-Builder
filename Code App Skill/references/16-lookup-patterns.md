# Reference 16: Native Lookup Column Patterns

Use this reference when working with Dataverse lookup relationships in Code Apps. Native Dataverse lookup columns are **fully supported** and the preferred approach.

---

## Overview

Dataverse lookup fields store a reference (GUID) to a record in another table. This document explains:
- Naming conventions for reading vs. writing lookups
- Writing a lookup relationship (`@odata.bind`)
- Reading and resolving lookup display names efficiently (`useLookupResolver`)

---

## Naming Conventions

Dataverse uses **different field name formats** depending on whether you are reading or writing.

### Reading (GET responses)

Lookup values are returned as `_<schemaname>_value` containing the related record's GUID:

```
_createdby_value               → GUID of the SystemUser who created the record
_transactioncurrencyid_value   → GUID of the TransactionCurrency
_msa_managingpartnerid_value   → GUID of the managing Account
_parentcontactid_value         → GUID of the parent Contact
_owningteam_value              → GUID of the owning Team
```

Include these `_<field>_value` names in your `select` list when fetching records to use them for display resolution later.

### Writing (POST / PATCH requests)

Use **OData bind syntax** to set or update a lookup relationship:

```typescript
// Format: "<SchemaName>@odata.bind": "/<entitysetname>(<guid>)"

// Set a lookup
payload['parentcustomerid_account@odata.bind'] = `/accounts(${accountId})`;
payload['TransactionCurrencyId@odata.bind'] = `/transactioncurrencies(${currencyId})`;

// Clear a lookup
updates['parentcustomerid_account@odata.bind'] = null;
```

> **Important**: The key format uses `@odata.bind` and the entity set name (plural). Never use the `_<field>_value` read-format as the key when writing.

---

## Star Schema Constraint (1-Level Only)

Native lookup columns fully support Dataverse relationship metadata. However, for Code Apps, strictly enforce:
- **1-Level Depth Star Schema Only**: 1 Fact Table → N Dimension Tables. No deep hierarchies (e.g., no School → Classroom → Student).
- All lookup references point directly from the fact table to dimension tables.

---

## Writing Lookups: CRUD Examples

### Create with a lookup

```typescript
// useRecords.ts
const payload: Partial<Contacts> = {
  firstname: data.firstname,
  lastname: data.lastname,
};

if (data.managingPartnerId) {
  payload['parentcustomerid_account@odata.bind'] = `/accounts(${data.managingPartnerId})`;
}

const result = await ContactsService.create(payload);
if (result.error) {
  setError(`Failed to create: ${result.error.message}`);
  return;
}
```

### Update a lookup (changed fields only)

```typescript
const updates: Partial<Contacts> = {};

if (data.jobtitle !== selected.jobtitle) {
  updates.jobtitle = data.jobtitle;
}

if (data.managingPartnerId !== selected._msa_managingpartnerid_value) {
  updates['parentcustomerid_account@odata.bind'] =
    data.managingPartnerId ? `/accounts(${data.managingPartnerId})` : null;
}

const result = await ContactsService.update(contactId, updates);
if (result.error) {
  setError(`Failed to update: ${result.error.message}`);
  return;
}
```

### Delete and clear selection

```typescript
if (!window.confirm('Delete this record?')) return;
await RecordsService.delete(id);
```

---

## Reading Lookups: Efficient On-Demand Resolution

When displaying records, you need to show human-readable names for each lookup GUID. The rule is:

### ❌ Inefficient: load entire tables upfront

```typescript
// Bad — fetches all records you don't need
const allUsers = await SystemusersService.getAll();
const user = allUsers.find(u => u.systemuserid === contact._createdby_value);
```

**Problems:** Loads entire tables into memory, slow initial load, breaks with large datasets.

### ✅ Efficient: fetch the specific record on-demand

```typescript
// Good — fetch only the one record you need
if (contact._createdby_value) {
  const result = await SystemusersService.get(
    contact._createdby_value,
    { select: ['systemuserid', 'fullname'] }
  );
  const createdByName = result.value?.fullname;
}
```

**Benefits:** Minimal network payload, scales to any dataset size, only resolves what's visible.

---

## `useLookupResolver` Hook Pattern

Create this hook in `src/hooks/useLookupResolver.ts`. It resolves all lookup GUIDs for one record in parallel using individual `Service.get()` calls.

```typescript
// src/hooks/useLookupResolver.ts
import { useState, useEffect } from 'react';
import type { Contacts } from '../generated/models/ContactsModel';
import { SystemusersService } from '../generated/services/SystemusersService';
import { AccountsService } from '../generated/services/AccountsService';
import { TransactioncurrenciesService } from '../generated/services/TransactioncurrenciesService';
import { TeamsService } from '../generated/services/TeamsService';

export interface ResolvedLookups {
  createdBy: string;
  currency: string;
  parentContact: string;
  managingPartner: string;
  owningTeam: string;
}

export function useLookupResolver(contact: Contacts | null) {
  const [resolvedLookups, setResolvedLookups] = useState<ResolvedLookups>({
    createdBy: '',
    currency: '',
    parentContact: '',
    managingPartner: '',
    owningTeam: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contact) return;

    async function resolveLookups() {
      setLoading(true);
      const resolved: ResolvedLookups = {
        createdBy: '', currency: '', parentContact: '', managingPartner: '', owningTeam: '',
      };

      // Run all lookups in parallel for performance
      await Promise.all([
        contact._createdby_value &&
          SystemusersService.get(contact._createdby_value, { select: ['fullname'] })
            .then(r => { resolved.createdBy = r.value?.fullname ?? ''; }),

        contact._transactioncurrencyid_value &&
          TransactioncurrenciesService.get(contact._transactioncurrencyid_value, { select: ['currencyname'] })
            .then(r => { resolved.currency = r.value?.currencyname ?? ''; }),

        contact._msa_managingpartnerid_value &&
          AccountsService.get(contact._msa_managingpartnerid_value, { select: ['name'] })
            .then(r => { resolved.managingPartner = r.value?.name ?? ''; }),

        contact._owningteam_value &&
          TeamsService.get(contact._owningteam_value, { select: ['name'] })
            .then(r => { resolved.owningTeam = r.value?.name ?? ''; }),
      ]);

      setResolvedLookups(resolved);
      setLoading(false);
    }

    resolveLookups();
  }, [contact]);

  return { resolvedLookups, loading };
}
```

---

## Displaying Lookup Names in a Component

```typescript
// src/components/ContactCard.tsx
export function ContactCard({ contact, onEdit, onDelete }: ContactCardProps) {
  const { resolvedLookups, loading } = useLookupResolver(contact);

  return (
    <div className="contact-card">
      <h3>{contact.firstname} {contact.lastname}</h3>

      {resolvedLookups.createdBy && (
        <p className="lookup-field">
          <span className="lookup-label">Created By:</span>{' '}
          {loading ? 'Loading...' : resolvedLookups.createdBy}
        </p>
      )}

      {resolvedLookups.managingPartner && (
        <p className="lookup-field">
          <span className="lookup-label">Managing Partner:</span>{' '}
          {resolvedLookups.managingPartner}
        </p>
      )}
    </div>
  );
}
```

---

## Data Flow Diagram

```
RecordsService.getAll()
  Returns records with GUID values:
    _createdby_value: "abc-123"
    _msa_managingpartnerid_value: "def-456"
    ...
         │
         ▼
RecordCard receives record with GUIDs
         │
         ▼
useLookupResolver(contact) runs in useEffect
         │
         ├──► SystemusersService.get("abc-123")     → { fullname: "Jane Doe" }
         ├──► TransactioncurrenciesService.get(...)  → { currencyname: "USD" }
         ├──► ContactsService.get(...)               → { fullname: "Bob Smith" }
         ├──► AccountsService.get("def-456")         → { name: "Contoso" }
         └──► TeamsService.get(...)                  → { name: "Sales Team" }
         │
         ▼
resolvedLookups state updates
         │
         ▼
RecordCard re-renders with display names
```

---

## Adding a New Lookup Field

### 1. Add the data source (if not yet added)

```bash
pac code add-data-source -a dataverse -t <table-logical-name>
```

### 2. Add the GUID to the `select` list in your hook

```typescript
select: [
  ...existingFields,
  '_newlookupfield_value',  // Add this
]
```

### 3. Extend the `ResolvedLookups` interface

```typescript
export interface ResolvedLookups {
  // ... existing fields
  newField: string;  // Add this
}
```

### 4. Add the fetch logic in `useLookupResolver`

```typescript
contact._newlookupfield_value &&
  NewTableService.get(contact._newlookupfield_value, { select: ['id', 'name'] })
    .then(r => { resolved.newField = r.value?.name ?? ''; }),
```

### 5. Display in the card component

```typescript
{resolvedLookups.newField && (
  <p className="lookup-field">
    <span className="lookup-label">New Field:</span>{' '}
    {resolvedLookups.newField}
  </p>
)}
```

---

## Lookup Dropdown for Create/Edit Forms

When users need to **set** a lookup field (e.g., assign a Managing Partner), load the related table's records into a dropdown:

```typescript
// src/hooks/useAccounts.ts
export function useAccounts() {
  const [accounts, setAccounts] = useState<Accounts[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadAccounts() {
      setLoading(true);
      const result = await AccountsService.getAll({
        select: ['accountid', 'name'],
        orderBy: ['name asc'],
        top: 200,
      });
      setAccounts(result.value ?? []);
      setLoading(false);
    }
    loadAccounts();
  }, []);

  return { accounts, loading };
}
```

```typescript
// src/components/ContactForm.tsx
const { accounts } = useAccounts();

<select
  value={formData.managingPartnerId ?? ''}
  onChange={e => setFormData(prev => ({ ...prev, managingPartnerId: e.target.value }))}
>
  <option value="">-- None --</option>
  {accounts.map(a => (
    <option key={a.accountid} value={a.accountid}>{a.name}</option>
  ))}
</select>
```

---

## Common Pitfalls

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Load all records from a related table to find one name | Use `Service.get(guid, { select: ['name'] })` for the specific record |
| Use `$expand` to eagerly load lookups | Select the `_field_value` GUID and resolve on-demand |
| Use `_field_value` format as a write key | Use `<SchemaName>@odata.bind` format for all writes |
| Write a string GUID directly to a lookup column | Use OData bind: `entity['field@odata.bind'] = '/accounts(guid)'` |
| Ignore `result.error` after create/update | Always check `if (result.error)` and surface the message |
| Request all fields from a service | Use `select` to get only the display field you need |
| Include `<lookupname>name` virtual fields in the `select` array (e.g. `tuongd_categoryidname`) | Only select `_<lookupname>_value`; the `*name` annotation is returned **automatically** by Dataverse |

---

## ⚠️ Lookup Virtual Name Fields (Critical — Do NOT Select)

When a lookup column exists (e.g., `tuongd_CategoryId`), the generated TypeScript model includes both:
- `_tuongd_categoryid_value` — the GUID (selectable ✅)
- `tuongd_categoryidname` — the display name (virtual, **NOT** selectable ❌)

The `*name` field is an **OData annotation** that Dataverse returns automatically alongside the `_*_value` GUID. You **must NOT** include it in the `select` array or Dataverse will reject the request with:

```
Error: "Could not find a property named 'tuongd_categoryidname'
on type 'Microsoft.Dynamics.CRM.tuongd_note20260228'."
```

### Correct pattern

```typescript
// ✅ Do this — only select the _value GUID, Dataverse returns the *name automatically
const result = await NotesService.getAll({
  select: ['tuongd_note20260228id', '_tuongd_categoryid_value', 'modifiedon'],
});

// The returned record will still have tuongd_categoryidname populated:
const categoryName = result.data[0].tuongd_categoryidname; // ✅ works
```

```typescript
// ❌ NEVER do this — causes HTTP 400
const result = await NotesService.getAll({
  select: ['tuongd_note20260228id', '_tuongd_categoryid_value', 'tuongd_categoryidname'],
  //                                                              ^^^^^^^^^^^^^^^^^^^^^^^^ ERROR
});
```

### How to identify virtual name fields
- Pattern: if a field ends in `name` and sits alongside a `_*_value` field, it's a virtual annotation.
- The generated TypeScript model includes them as optional properties, but they are **not real columns**.
- Examples: `tuongd_categoryidname`, `createdbyname`, `owneridname`, `modifiedbyname`.

---

## Summary

- Lookup fields return a GUID via `_<schemaname>_value` when reading
- Virtual `*name` annotation fields are returned automatically — **never** include them in `select`
- Use `@odata.bind` syntax to write or update a lookup relationship (`/entitysetname(guid)` or `null` to clear)
- Resolve GUIDs to display names on-demand using individual `Service.get()` calls inside `useLookupResolver`
- Load dropdown options for writable lookups using a dedicated `useRelatedTable` hook
- Always `select` only the fields you need to minimize payload size
- Always check `result.error` after `create()` and `update()` calls


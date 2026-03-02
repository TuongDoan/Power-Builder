# Reference 40: Production Testing (Using playwright-cli)

Use this reference to execute end-to-end testing for the Code App using `playwright-cli`. The AI agent tests interactively — taking snapshots, reading element refs, and issuing individual commands one at a time. There is no shell script and no `run-code` block.

> [!CRITICAL]
> ## 🚫 NEVER TEST ON LOCALHOST 🚫
> **Testing on `http://localhost:*` (e.g., `localhost:5173`) is STRICTLY FORBIDDEN.**
> The app REQUIRES the Dataverse host context provided by Power Apps. Localhost does not have this context. 
> **You MUST always test using the `apps.powerapps.com` URL.**

---

## The E2E Testing Workflow

### Step 1: Start the Dev Server & Get the Local Play URL
1. Run `npm run dev` in the terminal to start the local Vite server.
2. Parse the terminal output and look for the line starting with `➜  Local Play:`.
3. Copy the **entire** URL (`https://apps.powerapps.com/play/e/...`). This is the `LOCAL_PLAY_URL`.

### Step 2: Open the App (Headed + Persistent)

```bash
playwright-cli open "<LOCAL_PLAY_URL>" --headed --persistent
```

- `--persistent` saves the browser profile across sessions (no repeated logins).
- `--headed` shows the browser window.

### Step 3: Handle Authentication (If Needed)

If the browser lands on `login.microsoftonline.com`, **DO NOT automate the login**. MFA and conditional access policies will block you.

Tell the user: *"I have opened a browser window. Please log in to your Microsoft account. Once the Code App fully loads, let me know and I will resume testing."*

Wait for the user to confirm before continuing.

### Step 4: Explore & Test Interactively

Once the app is loaded, test the full flow using individual `playwright-cli` commands — **one command at a time**:

1. **Take a snapshot** to read the current DOM:
   ```bash
   playwright-cli snapshot
   ```
   Read the `.yml` snapshot file to find element ref IDs (`e1`, `e5`, etc.) and understand the structure.
   > **Important**: The app lives inside an iframe. Look for the `iframe[name="fullscreen-app-host"]` frame in the snapshot. All interactive elements will be inside it.

2. **Interact with elements** using the ref IDs from the snapshot:
   ```bash
   playwright-cli click e12
   playwright-cli fill e7 "My Test Value"
   playwright-cli select e9 "option-value"
   playwright-cli press Enter
   ```
   > **Ref IDs are safe to use** — they only go stale when the DOM updates *between* a snapshot and the next command. Since you always snapshot immediately before acting, the refs are always current.

3. **Re-snapshot after each meaningful interaction** to verify the UI updated correctly and to get fresh ref IDs for the next step:
   ```bash
   playwright-cli snapshot
   ```

4. **Repeat** — snapshot → interact → snapshot — walking through the full user journey.

### Step 5: Test Coverage

Walk through the **full CRUD cycle** for the app's primary entities:
- **Create**: Fill in a form and submit. Verify the new record appears in the list.
- **Read**: Navigate to the record detail view and verify all fields.
- **Update**: Edit a field and save. Verify the change persists.
- **Delete**: Delete a record. Verify it disappears from the list.

Also test navigation, filters, status changes, and any other core flows specific to this app.

### Step 6: Report Results

After all steps:
- Summarise what was tested and whether each step passed or failed.
- If a step failed, note what was expected vs. what the snapshot showed.
- Close the browser:
  ```bash
  playwright-cli close
  ```

---

## Key Rules for Interactive Testing

- **Never use `run-code` or shell scripts** for the test steps — issue individual commands only.
- **Always re-snapshot** after interactions — ref IDs change after DOM updates.
- **Always access elements through the iframe** — refs inside the Power Apps iframe are separate from the page-level refs.
- **Wait between interactions** — Power Apps/React UI needs time to hydrate. If a click doesn't seem to work, try `playwright-cli snapshot` first and re-read the current state before retrying.
- **Use `playwright-cli console`** to check for JS errors if behaviour is unexpected.

---

## Troubleshooting Data Visibility Bugs
If tests fail to find data that was allegedly saved to Dataverse:
1. **Silent Save Failures (CRITICAL)**: `create` and `update` methods **do not throw exceptions when they fail**. They return an object with an `.error` property. Always verify `result.error` and explicitly fail if it exists.
2. **Boolean / "Two Options" Rejection**: Passing `0` or `1` into a Boolean Dataverse field causes a silent `400 Bad Request`. Always send primitive `true` / `false`.
3. **Unmapped Choice Fields**: Choice fields might be `null`. Use null-safe wrappers (e.g., mapping `null` to a default choice like "To Do").
4. **Type Mismatches**: Ensure queries don't pass strings where arrays are expected (e.g., `orderBy: ['createdon desc']`).
5. **Explicit Columns**: Dataverse Web API might not return all columns by default. Request columns explicitly via `select`.

## Troubleshooting Browser Launch Failures
- **"Opening in existing browser session" error**: Chrome is already running with the same `--user-data-dir`. Run `playwright-cli kill-all` (and optionally `pkill -f 'ms-playwright/daemon'`) before retrying.

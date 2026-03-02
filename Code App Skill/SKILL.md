---
name: powerapps-codeapp
description: End-to-end Power Apps Code App delivery skill — scaffold app, create Dataverse tables via script CLI, connect data via PAC CLI, implement three-layer architecture with native lookup support, validate with playwright-cli, and deploy with npx power-apps push.
---

# Power Apps Code Apps End-to-End Skill

## End-to-end execution mandate (strict)
- Start every engagement with intake + routing using the requirements in this document.
- The agent must follow the strict phase sequence exactly as defined below and must not skip, reorder, or parallelize phases unless the user explicitly requests a deviation.
- Never chain commands of any kind. Execute each command independently to ensure precise debugging and error tracking.
- Testing is a hard gate: deployment is blocked until tests are executed and passing evidence is recorded.
- Talk out loud and respond to the user about what you are doing. Do not keep your thinking private. Respond to the user with beautifully formatted responses.
- Prefer additive schema changes; avoid destructive updates unless requested.
- Follow intake/routing constraints above for data architecture, scaffolding-first flow, and command execution style.

### Non-negotiable Intake Constraints (Enforce these before starting)
- **1-Level Depth Star Schema Only**: The database must follow a star schema (1 Fact Table, N Dimension Tables). Do not plan deep hierarchies (e.g., School -> Classroom -> Student). All lookup references must point directly from a fact table to a dimension table.
- **Native Lookups Supported**: Use native Dataverse lookup columns for relationships. Use `@odata.bind` syntax for writing lookups and `_<field>_value` GUIDs for reading. See `references/16-lookup-patterns.md` for the full pattern. Do NOT use plain String(36) columns to store GUIDs manually
- **Desktop-first Only**: Do not plan responsive/mobile layouts unless explicitly requested by the user.
- **Empty Directory Scaffolding Rule**: If you inspect the current directory and find it empty (ignoring OS-specific hidden files like `.DS_Store`), you are authorized to proceed with scaffolding the new app directly in that folder.

### Required phase sequence
1. Discovery - Collect or infer all of the following:
   - `appDisplayName` (primary naming input from user; ask "What should this app be called?" and include suggested names)
   - `environmentId` and `DATAVERSE_URL` — **auto-discovered by the scaffold script** via `pac env list` (picks the line marked `*`). No manual lookup needed. If PAC CLI is not authenticated, run `pac auth create` first.
2. App scaffolding (`references/10-scaffolding-app.md`)
3. Database planning and schema plan JSON creation in the project folder (`references/15-database-planning.md`)
	- The schema plan JSON must be created inside the app project folder, never in the skill folder.
	- Example path: `./dataverse/planning-payload.json` (relative to project root).
	- Read `./scripts/schema-plan.example.json` (copied into the project) as the template before creating the schema plan JSON.
	- For multi-table plans with relationships, review `references/16-lookup-patterns.md` for lookup column guidance.
	- **Column naming Rule**: Avoid general column names like "status", "owner", "statecode", "statuscode" because they are system reserved columns in Dataverse. Use specific names (e.g., `task_status`, `project_owner`) instead.
	- **Pluralization Rule**: Clearly separate naming structures during planning: establish `entitySetName` for plural usages (required by Dataverse scripts) and `logicalSingularName` (required by `pac code add-data-source`).
4. Dataverse schema provisioning (`references/20-dataverse-script-cli.md`)
	- Run `dataverse-flow.js` as the single command — it automatically creates all tables (Phase 4a), then all relationships/lookup columns (Phase 4b) from the `relationships` array in the plan.
	- Do not read script internals unless execution returns an error and debugging is required.
5. Dataverse connection (`references/30-connect-dataverse-pac.md`)
6. Build three-layer architecture and modern/beautiful UI (`references/17-code-architecture.md` + `references/35-context-and-metadata.md`)
	- **Architecture rule (mandatory)**: Always follow the three-layer architecture (Components → Hooks → Generated Services). Load `references/17-code-architecture.md` for full details.
	- **Lookup patterns (mandatory when relationships exist)**: Read `references/16-lookup-patterns.md` for `@odata.bind` write syntax and `useLookupResolver` hook pattern.
	- **UI/UX default creation rule (recommended — user may override):**
		- Use TailwindCSS for styling to prioritize simplicity and speed of development.
		- All UI elements should feature smooth, modern animation for transitions and feedback.
		- By default, go with glassmorphism design, dark theme, and a modern color palette.
		- Implement toast/notification component for user feedback.
		- Just show information that is useful to the user. Do not show information like Environment ID, env URL, or any information about infrastructure in the UI.
		- If the user specifies a different design system or style, follow their preference instead.
	- **Layout integrity rule (mandatory):**
		- **Desktop-only by default.** All layouts must target desktop viewports (≥ 1024 px wide). Do not add responsive/mobile breakpoints unless the user explicitly requests mobile support.
		- **Always verify layout integrity** after creating or modifying UI components. Check for:
		  - Consistent spacing (margins, padding, gaps) across all sections.
		  - Proper alignment of elements (no unexpected shifts or overlaps).
		  - Correct container sizing (no overflow, no unnecessary scrollbars).
		  - Visual hierarchy and typography consistency (font sizes, weights, line heights).
		  - Interactive element sizing (buttons, inputs, dropdowns must be comfortably clickable).
		- **Verification method**: After UI changes, use Playwright to visually confirm layout renders correctly at desktop resolution (1440×900 recommended). Flag any layout issues before proceeding.
		- If the user explicitly requests mobile/responsive layout, implement it as an additional step — never remove desktop layout to add mobile.
7. (Optional) Copilot Studio Agent integration (`references/60-connect-copilot-studio.md`)
   - Only execute this phase when the user explicitly requests AI/chatbot capabilities via a Copilot Studio agent.
   - **Start with the Discovery Step**: run `bash scripts/discover-copilot-connection.sh` to resolve the `connectionId` before making any code changes. Read the last stdout line for `COPILOT_CONNECTION_ID=<value>`.
   - Steps: discovery script → `pac code add-data-source -a "shared_microsoftcopilotstudio" -c <connectionId>` → import `CopilotStudioService` → invoke `ExecuteCopilotAsyncV2`.
   - Always use `ExecuteCopilotAsyncV2`; never use `ExecuteCopilot` or `ExecuteCopilotAsync` (see reference for details).

8. Production testing gate before deploy (`references/40-testing.md`)
   - **🚫 NEVER test on localhost** (`http://localhost:*`). Always use the `apps.powerapps.com` "Local Play" URL from the `npm run dev` output. See the references for step-by-step instructions.
   - **Tool Selection Rule**: Strictly use `playwright-cli` (maintained by Microsoft, not the traditional Playwright). Always use the `--headed` and `--persistent` flags with `playwright-cli` to ensure the user doesn't have to log in again between sessions. Run `playwright-cli --help` to discover available commands.

9. Deployment (`references/50-deploy-pac.md`)



## Routing logic
- The Code App development process requires executing the full lifecycle sequentially. All phases and their references are mandatory, EXCEPT the Copilot Studio guide, which is optional.
- Load the corresponding references sequentially as you progress through each phase:
  - Phase 2 (Scaffold): load `references/10-scaffolding-app.md`
  - Phase 3 (Database plan): load `references/15-database-planning.md` (and `references/16-lookup-patterns.md` for relationships)
  - Phase 4 (Execute scripts): load `references/20-dataverse-script-cli.md`
  - Phase 5 (Connect Dataverse): load `references/30-connect-dataverse-pac.md`
  - Phase 6 (Architecture & UI): load `references/17-code-architecture.md` and `references/35-context-and-metadata.md`
  - Phase 7 (Copilot Studio - **OPTIONAL**): load `references/60-connect-copilot-studio.md` ONLY if AI agent requested, or user asking anything about "Copilot Studio", "AI agent", "chatbot", or "connect to agent".
  - Phase 8 (Testing): load `references/40-testing.md`
  - Phase 9 (Deploy): load `references/50-deploy-pac.md`
- Full lifecycle execution in order: `10 (scaffold) -> 15 (schema plan JSON) -> 16 (lookups) -> 20 (execute scripts) -> 30 (connect) -> 17 & 35 (architecture) -> [60 if AI agent requested] -> 40 (testing) -> 50 (deploy)`.

### Non-negotiable Execution Constraints
- Use Dataverse as the primary data store for business data.
- Use session storage only for temporary local/session state (filters, draft UI state, transient cache), not persistent records.
- **No `.env` file**: `.env` files are prohibited for the app project. Code Apps rely on `pac auth` for authentication and the Power Apps host context for the Dataverse connection. You ARE authorized to create a temporary `.dataverse-config.json` file in the project directory scoped specifically to the internal Dataverse scripts to persist `DATAVERSE_URL` across tool calls.

### Autonomous execution style
- Always follow the canonical phase sequence above.
- Run commands in smallest verifiable batches.
- Validate after each phase before continuing. Don't do anything in parallel.
- Try to set all input/intake parameters by yourself and decide the best decision on your own unless the user explicitly says otherwise.

### Output contract per phase
Each phase must return:
- Actions performed.
- Command/tool output summary.
- Artifacts created/updated.
- Validation result.
- Next phase recommendation.


## Bug Fix Workflow (Strict)
- **Protocol**: When a bug is reported or found:
  1. **Fix**: Implement the code correction.
  2. **Test**: MUST execute testing to verify the fix via `references/40-testing.md` (playwright-cli).
  3. **Deploy**: Only deploy AFTER the test passes.
- **Retest Rule**: Never deploy a fix without re-running the test gate first.


## Success criteria
- App scaffolded and runs locally via `npm run dev`.
- Dataverse schema exists and aligns with app use case.
- Dataverse data source added via PAC and generated services compile.
- Three-layer architecture implemented (Components → Hooks → Generated Services).
- Lookup fields implemented with `@odata.bind` for writes and `useLookupResolver` for reads (when relationships exist).
- (If AI agent requested) Copilot Studio connector added, integrated, and agent returns valid responses during testing.
- Build + push completed successfully.
- Final handoff includes environment, app URL (with hideNavBar property), schema summary, test results, and follow-up actions.

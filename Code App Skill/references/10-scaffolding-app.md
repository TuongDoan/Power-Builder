# 10 - Scaffolding App

This reference describes the sequence for scaffolding a new Power Apps Code App using the npm-based CLI (SDK v1.0.4+), securely and directly into the designated project directory.

## Prerequisites
- Collect the `appDisplayName`.

## Tooling: npm CLI vs PAC CLI

> [!IMPORTANT]
> As of Power Apps SDK v1.0.4, the preferred CLI is the **npm-based CLI** (`npx power-apps`). This replaces the old `pac code` commands. Always use:
> - `npx power-apps init` instead of `pac code init`
> - `npm run dev` to run the local dev server
>
> `pac code add-data-source` is **still** used for generating TypeScript services and models from Dataverse tables.

## Sequence

1. **Scaffolding Script:**
   Get the skill folder's path to run the below command. **Don't create any new folder to scaffold — run this inside the target directory.**

   ```bash
   <skill-scripts-dir>/scripts/scaffold-codeapp.sh --app-name "<appDisplayName>"
   ```
   *The script runs `pac env list`, finds the active environment (marked `*`), extracts the Environment ID and Environment URL automatically, then proceeds with template download, dependency install, and `npx power-apps init`. It also writes `.dataverse-config.json` with the Dataverse URL for provisioning scripts.*

2. **Verify:**
   The script sequentially performs the template download, dependency installation, and `npx power-apps init`. Ensure it successfully ends with the local dev server URL printed.

3. **Proceed to Next Steps:**
   After successful scaffolding, proceed to Phase 3 of the `SKILL.md` execution flow (Database planning). Note that the scaffold script has already copied the necessary Dataverse CLI scripts into the `./scripts/` directory for you.

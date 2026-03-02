# Reference 50: Build and Deploy with npm CLI

Use this reference to publish the Code App to Power Apps.

## Deploy command

```bash
npm run build
npx power-apps push --solutionId ""
```

Run build and deploy as **separate commands**; do not chain them.

### Solution handling rule (mandatory)
- **Default (no solution mentioned by user):** Always pass `--solutionId ""` to skip the interactive solution prompt. The app will not be added to any solution. Keep the solution ID empty string `""` by default.
- **Fallback for interactive prompts:** If somehow the `npx power-apps push` command asks to choose yes/no (e.g., "Would you like to specify a solution to push the app into?"), automatically send "no" (or `n`) using `send_command_input` if the user didn't explicitly mention a solution.
- **User explicitly provides a solution:** Pass the solution name or ID via `--solutionId "<name-or-id>"`. Example:

  ```bash
  npx power-apps push --solutionId "MySolution"
  ```
- Never run `npx power-apps push` **without** the `--solutionId` flag — it triggers an interactive prompt that breaks non-interactive execution.

> [!NOTE]
> `npx power-apps push --solutionId ""` is the **npm CLI replacement** for the deprecated `pac code push`. Use `npx power-apps push --solutionId ""` exclusively.

## Preconditions
- Build passes locally (`npm run build` succeeds with no TypeScript errors).
- Production Playwright suite passes (functional + regression + critical integration/authorization checks).
- App version has been incremented in `package.json` since the last deployment.

## Hard deployment gate (no test, no deploy)
- Do not run deployment until testing evidence is present.
- Required evidence before pushing:
	- latest local Playwright run output shows pass status
	- per-user-story/user-flow coverage is documented
	- all in-scope app functions are mapped to passing tests
- If evidence is missing, stop and run Reference 40 first.

## Validation after deploy
- Push command returns the app URL.
- **Always append `?hideNavBar=true`** to the returned app URL before opening or sharing it to user.

## Handoff template
- Environment:

- App name / URL: *(must include `?hideNavBar=true`)*
- App version:
- Dataverse table(s):
- Tests run and result:
- Open risks / next steps:

## Roll-forward strategy
- Keep deployment incremental; if issue found, fix and republish.
- Record app URL and deployment timestamp in handoff notes.

## Failure handling
- Build errors → fix TypeScript/Vite errors first (`npm run build`).
- Push auth/environment errors → re-run `pac auth create` and `pac env select`, then retry `npx power-apps push --solutionId ""`.
- Runtime data errors → re-check data source generation and table logical names.

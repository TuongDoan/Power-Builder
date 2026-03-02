
**PowerBuilder** — a toolkit for the Microsoft Power Platform.

---

## Quick Start

```bash
# Install the Power Apps Code App skill
npx @powerbuilder/skill codeapp
```

The wizard will:
1. Auto-detect `.cursor`, `.claude`, and `.gemini` folders in your project
2. Ask for your Dataverse publisher prefix (`tuongd` by default if left blank) and continue installation
3. Install `@playwright/cli` globally for automated testing
4. Open `make.powerapps.com` in a persistent browser session for first-time login

---

## Available Skills

| Command | Skill | Description |
|---------|-------|-------------|
| `npx @powerbuilder/skill codeapp` | Power Apps Code App | End-to-end Code App delivery — scaffold, Dataverse, 3-layer architecture, test, deploy |
| `npx @powerbuilder/skill powerautomate` | Power Automate *(coming soon)* | — |
| `npx @powerbuilder/skill powerbi` | Power BI *(coming soon)* | — |

---

## Supported Agent Platforms

| Folder | Skill destination |
|--------|-------------------|
| `.cursor` | `.cursor/rules/skills/powerapps-codeapp/` |
| `.claude` | `.claude/skills/powerapps-codeapp/` |
| `.gemini` | `.gemini/antigravity/skills/powerapps-codeapp/` |

The installer searches upward from your current directory to your home folder and installs into every platform it finds.

---

## Requirements

- Node.js ≥ 18
- [Power Platform CLI (PAC)](https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction) — authenticated via `pac auth create`

---

## About PowerBuilder

**PowerBuilder** is a toolkit by [TuongDoan](https://github.com/tuongdoan) — a growing collection of AI agent skills, scripts, and utilities for the Microsoft Power Platform.

© 2026 TuongDoan

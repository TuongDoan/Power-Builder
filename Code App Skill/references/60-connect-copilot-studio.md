# 60 — Connect to a Copilot Studio Agent

> **Reference**: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-copilot-studio

Microsoft Copilot Studio agents bring AI-powered capabilities to code apps. This reference shows how to add the Microsoft Copilot Studio connector and invoke agents to process user input and return intelligent responses.

---

## ⚠️ Human Intervention Protocol (Mandatory)

Certain steps in this phase **cannot be automated** — they require direct action or a decision by the user. Whenever the agent reaches one of these steps, it **must stop and clearly prompt the user** with:
- What action the user needs to take.
- Where to do it (exact UI location or command).
- What value(s) to copy and provide back to the agent.

**Do NOT proceed past a human-intervention step without receiving the required input from the user.** Do not guess, assume, or skip.

Human-intervention steps in this phase are marked with 🙋 **ACTION REQUIRED**.

---

## Prerequisites
- An initialized code app project (Phase 2 — scaffolding complete).
- A **published** Microsoft Copilot Studio agent in your environment.
- Active PAC auth profile (run `pac auth list` to verify).

---

## Discovery Step — Collect Required Information Before Starting

> **Purpose**: Gather **all** required inputs (`connectionId` + `agentName`) **before** making any code changes.

The discovery runs in two clearly separated sub-steps:

---

### Discovery Part 1 — Resolve the Copilot Studio connection (automated via script)

Run the discovery script copied into the project's `scripts/` folder:

```bash
bash scripts/discover-copilot-connection.sh
```

| Situation | Script behaviour |
|-----------|-----------------|
| **0 connections** | Prints portal instructions, waits for user to press Enter, retries automatically (up to 5×) |
| **1 connection** | Selects it automatically — no user input needed |
| **2+ connections** | Prints a numbered list, prompts the user to pick one by number or paste the Id |

**How to read the output:**
All human-facing messages go to **stderr**. The machine-readable result is the **last line on stdout**:

```
COPILOT_CONNECTION_ID=<connectionId>
```

Example:
```
COPILOT_CONNECTION_ID=shared-microsoftcopi-89108d68-c30e-4d0f-b80c-e2227d245344
```

> ⚠️ If the script exits with a non-zero code, stop and surface the error to the user before continuing.

---

### Discovery Part 2 — Collect the agent name (Agent prompts user in chat)

**Do not use a script for this.** After Part 1 completes, the Agent must send the following message directly to the user in the conversation:

---
> 🙋 **ACTION REQUIRED — I need your Copilot Studio agent name.**
>
> Please follow these steps to find it:
>
> 1. Open [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com)
> 2. Open your agent → click **Publish** (if not already published)
> 3. Go to **Channels → Web app**
> 4. Look at the connection string URL — it has this format:
>    ```
>    https://{id}.environment.api.powerplatform.com/copilotstudio/dataverse-backed/
>           authenticated/bots/{AGENT_NAME}/conversations?api-version=2022-03-01-preview
>    ```
> 5. Copy the `{AGENT_NAME}` part exactly as it appears in the URL
>
> ⚠️ Agent names are **case-sensitive** and typically include a publisher prefix (e.g. `cr3e1_customerSupportAgent`).
>
> **Please paste your agent name here and I will continue.**
---

Wait for the user's reply. Store the value as `<agentName>`.

---

### Agent instructions — after both parts complete
1. Extract `COPILOT_CONNECTION_ID=<value>` from script stdout → store as `<connectionId>`.
2. Store the user's chat reply → `<agentName>`.
3. Confirm both values back to the user in a summary, then proceed to Step 1.



---

## Step 1 — Add the Microsoft Copilot Studio Connector

Using the `<connectionId>` collected in the Discovery Step, run:

```bash
pac code add-data-source -a "shared_microsoftcopilotstudio" -c <connectionId>
```

This command automatically:
- Updates `power.config.json` with the Copilot Studio data source entry.
- Generates TypeScript model and service files inside `src/generated/`.

> **Never chain this command** with others — execute it alone and verify the generated files before proceeding.

---

## Step 2 — Invoke the Agent in Code

### Import the generated service
```typescript
import { CopilotStudioService } from './generated/services/CopilotStudioService';
```

### Always use `ExecuteCopilotAsyncV2`
Use the `ExecuteCopilotAsyncV2` action — it is the only action that returns the full agent response synchronously.

| Action | Endpoint | Behaviour |
|--------|----------|-----------|
| `ExecuteCopilotAsyncV2` ✅ | `/proactivecopilot/executeAsyncV2` | Returns full response synchronously — **use this** |
| `ExecuteCopilot` ❌ | `/execute` | Fire-and-forget; only returns `ConversationId` |
| `ExecuteCopilotAsync` ❌ | `/executeAsync` | May return 502 "Cannot read server response" errors |

### Send a message to the agent
```typescript
const response = await CopilotStudioService.ExecuteCopilotAsyncV2({
  message: "What is the status of my order?",
  notificationUrl: "https://notificationurlplaceholder",
  agentName: "cr3e1_customerSupportAgent"
});
```

**Request parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `string` | The user's message or prompt to send to the agent |
| `notificationUrl` | `string` | Use the placeholder `"https://notificationurlplaceholder"` for synchronous calls |
| `agentName` | `string` | The agent name from the Discovery Step (case-sensitive, e.g. `cr3e1_customerSupportAgent`) |

### Response structure
| Property | Type | Description |
|----------|------|-------------|
| `responses` | `string[]` | Array of all response messages from the agent |
| `conversationId` | `string` | ID for continuing a multi-turn conversation |
| `lastResponse` | `string` | The most recent response text from the agent |
| `completed` | `boolean` | Whether the agent finished processing |

---

## Code Examples

### Example 1 — Get agent response
```typescript
const response = await CopilotStudioService.ExecuteCopilotAsyncV2({
  message: "Summarize the latest product trends",
  notificationUrl: "https://notificationurlplaceholder",
  agentName: "cr3e1_trendAnalyzer"
});

// response is IOperationResult — always use .data
if (response.data.completed) {
  const agentResponse = response.data.lastResponse;
  console.log("Agent response:", agentResponse);
}
```

### Example 2 — Parse JSON responses
Agents often return structured data as JSON strings inside `responses[]`:
```typescript
const response = await CopilotStudioService.ExecuteCopilotAsyncV2({
  message: JSON.stringify({ query: "monthly sales" }),
  notificationUrl: "https://notificationurlplaceholder",
  agentName: "cr3e1_dataAnalyzer"
});

if (response.data.responses && response.data.responses.length > 0) {
  const parsedData = JSON.parse(response.data.responses[0]);
  const summary = parsedData.summary;
  const metrics = parsedData.metrics;
  console.log("Summary:", summary);
  console.log("Metrics:", metrics);
}
```

### Example 3 — Defensive property casing
Response property casing can vary between implementations. Use optional chaining:
```typescript
const convId =
  response.data.conversationId ??
  response.data.ConversationId ??
  response.data.conversationID;
```

---

## Troubleshooting

| Symptom | Solution |
|---------|----------|
| Agent doesn't return a response | Ensure you use `ExecuteCopilotAsyncV2` (not `ExecuteCopilot` or `ExecuteCopilotAsync`) |
| Property casing errors | Use optional chaining to handle `conversationId` / `ConversationId` / `conversationID` variations |
| Empty or unexpected responses | (1) Verify the agent is **published**. (2) Confirm the agent name matches exactly. (3) Ensure the message format matches what the agent expects. (4) Check that the agent has topics configured to handle the input. |
| `pac code add-data-source` fails | Re-run `pac auth list` to confirm an active session, then retry the command alone |

---

## Phase Output Contract
Return these after completing this phase:
- **Actions**: Connection ID retrieved, `pac code add-data-source` executed, generated service file path confirmed.
- **Artifacts**: `power.config.json` (updated), `src/generated/services/CopilotStudioService.ts` (generated), agent invocation code added to app.
- **Validation**: `npm run build` passes with no TypeScript errors after adding the import and invocation code.
- **Next phase**: Proceed to `40-testing.md` to validate agent responses via Playwright before deploying.

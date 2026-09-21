# Jev AI MCP Server

Use [Jev AI](https://jev-ai.pro/) from Claude Code, Cursor and other MCP clients. Classify requests, score content, check conditions, assess proposed actions, answer multiple typed questions, or reuse a saved judge through the [Jev AI API](https://jev-ai.pro/jev-api).

This is an independent integration for **jev-ai.pro**, not the official TypeSafe AI MCP server. A TypeSafe API key will not work here.

## Quick start

Requires **Node.js 20+** and a **Jev AI API key**. Sign in at [jev-ai.pro/jev-api](https://jev-ai.pro/jev-api) and create a key. Account credits are required for evaluation.

Run directly from GitHub; no build step or npm publication is required:

```sh
npx -y github:weidacn/jev-ai-mcp#v1.0.0
```

Supply the key through your MCP client's environment configuration. Never commit a real key to source control.

### Claude Code

```sh
claude mcp add jev-ai -e JEV_AI_API_KEY=YOUR_JEV_AI_KEY -- npx -y github:weidacn/jev-ai-mcp#v1.0.0
```

### Cursor / Claude Desktop / generic MCP configuration

```json
{
  "mcpServers": {
    "jev-ai": {
      "command": "npx",
      "args": ["-y", "github:weidacn/jev-ai-mcp#v1.0.0"],
      "env": { "JEV_AI_API_KEY": "YOUR_JEV_AI_KEY" }
    }
  }
}
```

Use your client's secret storage where available. The server uses **stdio**. It does not listen on a network port. It can start and list tools without a key; calling tools requires one.

## Tools

| Tool | Purpose |
| --- | --- |
| `jev_classify` | Select one of 2–400 labelled options; return confidence and probabilities. |
| `jev_score` | Rate input on 2–20 ordered levels; return a fractional zero-based score. |
| `jev_check` | Evaluate a yes/no question; return a probability from 0 to 1. |
| `jev_gate` | Assess a proposed action; return an advisory recommendation and risk score. |
| `jev_decide` | Ask 1–64 typed questions about the same input in one API call. |
| `jev_saved_judge` | Run a judge saved in your account; optionally pin its revision. |

Every successful tool returns the API response: `model`, `answers`, and `usage`. Single-question tools use `answers.result`. `jev_gate` uses `answers.recommendation` and `answers.risk`. `jev_decide` preserves your question names.

### Route a support request

Call `jev_classify` with:

```json
{
  "state": "My payment failed. Can you help?",
  "instructions": "Which team should handle this request?",
  "options": {
    "billing": "Payments, invoices and refunds",
    "technical": "Bugs and outages",
    "sales": "Product and pricing questions"
  }
}
```

### Evaluate several questions together

Call `jev_decide` with:

```json
{
  "state": "I was charged twice and need this resolved today.",
  "questions": {
    "urgent": { "type": "noul", "instructions": "Does this need urgent support?" },
    "priority": {
      "type": "score",
      "instructions": "How urgent is this request?",
      "criteria": ["Routine", "Today", "Immediate"]
    }
  }
}
```

### Reuse a saved judge

Create a judge on [Jev AI](https://jev-ai.pro/), then call `jev_saved_judge` with its ID and new input:

```json
{ "judgeId": "YOUR_JUDGE_ID", "state": "New text to evaluate", "revision": 1 }
```

An outdated revision produces a conflict rather than silently using changed rules.

## Configuration

| Environment variable | Required | Default |
| --- | --- | --- |
| `JEV_AI_API_KEY` | For tool calls | Your key from jev-ai.pro |
| `JEV_AI_MODEL` | No | `jev-latest` |

Requests go to `https://jev-ai.pro/api/v1/systemone` using Bearer authentication. There is no configurable alternate host, so a client cannot redirect your key to a different provider. HTTP redirects are rejected.

## Usage, privacy and limits

- Tool calls transmit the supplied input and instructions to Jev AI and its model providers. Send only data you are authorized to process; consult the site's current [privacy policy](https://jev-ai.pro/privacy) and [API documentation](https://jev-ai.pro/jev-api).
- Calls consume credits. Purchased usage is metered by input tokens; promotional credits are spent per request. See current [pricing](https://jev-ai.pro/pricing) and account usage for billing details.
- The API request body must fit within 256,000 UTF-8 bytes. Model context limits still apply. Account and service capacity limits can return HTTP 429.
- A failed request returns an MCP tool error. HTTP 401 indicates a key problem; 402 indicates insufficient credits or a billing hold; 422 indicates invalid input; 429 indicates rate/capacity limits.
- Requests time out after 75 seconds and are **never automatically retried**. A network failure can occur after the service has processed a request; check your account usage before retrying.
- Decisions are probabilistic. `jev_gate` provides advice only, never runs a command, and must not replace your application's authorization rules.
- The MCP process does not write inputs or keys to disk or log API response bodies. Jev AI applies its own service-side data policies.

## Develop and test

```sh
npm ci
npm test
npm start
```

Tests exercise the MCP protocol with the official SDK and a mocked HTTP boundary; no paid model calls are required.

MIT licensed. Website: [Jev AI](https://jev-ai.pro/) · API: [Jev AI API](https://jev-ai.pro/jev-api)

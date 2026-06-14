import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const AGENT_IDS = ["architecture", "schema", "readme", "prompt"] as const;
type AgentId = (typeof AGENT_IDS)[number];

const TRUTH_RULES = `
ACCURACY RULES (must follow):
- Do not invent libraries, APIs, versions, or services. Use only widely-known, stable conventions.
- If a detail is not given, state your assumption explicitly at the top.
- Prefer plain, conventional patterns over clever or obscure ones.
- Do not mention which AI model or provider produced this output.
- No filler, no apologies, no meta commentary.
`.trim();

const DEEP_BRIEF = `
REFERENCE PRINCIPLES (apply silently when in deep mode):
- Classify scale tier first: T1 0-1K / T2 1K-100K / T3 100K-1M / T4 1M+.
- Security: TLS, JWT (RS256), bcrypt cost>=12, RBAC + RLS, input validation, rate limits, secrets vault, audit logs.
- Data: relational by default; index FKs; read replicas at T3; Redis for hot reads; queues for heavy writes.
- Reliability: idempotent writes, retries + backoff + DLQ, health checks, graceful shutdown, circuit breakers.
- Observability: structured logs + traces (OTel) + metrics (RED/USE) + alerts on SLOs.
- Cost: managed services first; serverless for spiky load; autoscale on real signals.
`.trim();

const AGENTS: Record<
  AgentId,
  { system: (deep: boolean) => string; user: (c: string, s: string) => string }
> = {
  architecture: {
    system: (deep) =>
      `You are a senior systems architect. Produce a clear ASCII system architecture diagram (boxes + arrows) showing client, API, services, data layer, auth, cache, queues, and storage as appropriate. Output ONLY the diagram inside a single fenced code block, no prose.\n\n${TRUTH_RULES}${
        deep ? `\n\n${DEEP_BRIEF}` : ""
      }`,
    user: (concept, stack) =>
      `Concept:\n${concept}\n\nTarget stack: ${stack}\n\nDraw the production architecture.`,
  },
  schema: {
    system: (deep) =>
      `You are a senior database engineer. Produce a normalized PostgreSQL schema (CREATE TABLE with PKs, FKs, indexes, sensible types, and RLS hints as SQL comments). Output ONLY SQL in a single fenced code block, no prose.\n\n${TRUTH_RULES}${
        deep ? `\n\n${DEEP_BRIEF}` : ""
      }`,
    user: (concept, stack) =>
      `Concept:\n${concept}\n\nTarget stack: ${stack}\n\nDesign the schema.`,
  },
  readme: {
    system: (deep) =>
      `You are writing a README.md for a beginner ("vibe coder") who has never studied system design. Use plain English, short sentences, friendly tone, analogies. Explain WHY each piece exists. Define jargon inline. Sections: What this app does, How it works, The pieces, Getting started (copy-paste commands), Where things live, Common questions. Output ONLY the README markdown.\n\n${TRUTH_RULES}${
        deep
          ? `\n\nAdd a short "Going to production" section (backups, monitoring, secrets, rate limits).`
          : ""
      }`,
    user: (concept, stack) =>
      `Concept:\n${concept}\n\nTarget stack: ${stack}\n\nWrite a beginner-friendly README.md.`,
  },
  prompt: {
    system: (deep) =>
      `You are a prompt engineer. Produce one comprehensive master prompt another LLM could use to build the described system end-to-end. Sections: Assumptions, Logic Workflow, Data Handling Structure, Application Screen Map, API Contract, Implementation Order. Output ONLY the prompt as plain markdown.\n\n${TRUTH_RULES}${
        deep ? `\n\n${DEEP_BRIEF}` : ""
      }`,
    user: (concept, stack) =>
      `Concept:\n${concept}\n\nTarget stack: ${stack}\n\nWrite the master build prompt.`,
  },
};

async function callAzureFoundry(
  system: string,
  user: string,
  deep: boolean,
): Promise<string> {
  const endpoint = process.env["AZURE_FOUNDRY_ENDPOINT"];
  const apiKey = process.env["AZURE_FOUNDRY_API_KEY"];
  const deployment = process.env["AZURE_FOUNDRY_DEPLOYMENT"];
  const apiVersion =
    process.env["AZURE_FOUNDRY_API_VERSION"] ?? "2025-01-01-preview";

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Azure AI Foundry is not configured. Set AZURE_FOUNDRY_ENDPOINT, AZURE_FOUNDRY_API_KEY, and AZURE_FOUNDRY_DEPLOYMENT in your environment.",
    );
  }

  const base = endpoint.replace(/\/+$/, "");

  // Three endpoint flavours:
  // 1. Azure OpenAI (.openai.azure.com) — uses /openai/deployments/{model}/chat/completions + api-key
  // 2. Azure AI Foundry project (.services.ai.azure.com/api/projects/...) — uses /chat/completions?api-version + api-key
  // 3. Serverless inference (everything else, e.g. *.models.ai.azure.com) — uses /chat/completions, no api-version, Bearer auth
  const isOpenAI = base.includes(".openai.azure.com");
  const isFoundryProject = base.includes(".services.ai.azure.com");

  let url: string;
  if (isOpenAI) {
    url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  } else if (isFoundryProject) {
    url = `${base}/chat/completions?api-version=${apiVersion}`;
  } else {
    url = `${base}/chat/completions`;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isOpenAI || isFoundryProject) {
    headers["api-key"] = apiKey!;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: deep ? 0.3 : 0.6,
      max_tokens: deep ? 3000 : 1500,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Azure AI Foundry ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

router.post("/run-agent", async (req, res): Promise<void> => {
  const { agentId, concept, stack, deepThink = false } = req.body ?? {};

  if (
    !AGENT_IDS.includes(agentId) ||
    typeof concept !== "string" ||
    concept.length < 3 ||
    typeof stack !== "string" ||
    !stack
  ) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const def = AGENTS[agentId as AgentId];

  try {
    const text = await callAzureFoundry(
      def.system(Boolean(deepThink)),
      def.user(concept, stack),
      Boolean(deepThink),
    );
    res.json({
      agentId,
      text: text || "> ⚠️ Empty response from the AI service.",
      error: !text,
    });
  } catch (err) {
    logger.error({ err, agentId }, "Agent call failed");
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      agentId,
      text: `> ⚠️ This section could not be generated.\n>\n> ${msg}`,
      error: true,
    });
  }
});

export default router;

MS Arch
An AI-powered system architecture generator — describe your app idea in plain English and get production-grade architecture diagrams, database schemas, READMEs, and master AI prompts.

Run & Operate
pnpm --filter @workspace/ms-arch run dev — run the frontend (port 21230)
pnpm --filter @workspace/api-server run dev — run the API server (port 8080)
pnpm run typecheck — full typecheck across all packages
pnpm run build — typecheck + build all packages
Stack
pnpm workspaces, Node.js 24, TypeScript 5.9
Frontend: React + Vite + Tailwind CSS (ms-arch artifact)
API: Express 5 (api-server artifact) + Vercel serverless function (api/run-agent.ts)
AI: Azure AI Foundry (Azure OpenAI)
Build: esbuild (CJS bundle for API), Vite (frontend)
Where things live
artifacts/ms-arch/ — React frontend (workspace, history, theme toggle)
artifacts/api-server/src/routes/agent.ts — Express route for local dev
api/run-agent.ts — Vercel serverless function (used in production on Vercel)
vercel.json — Vercel deployment config (builds ms-arch, routes /api/* to serverless)
Architecture decisions
Dual API setup: api/run-agent.ts for Vercel production, artifacts/api-server for local dev
Azure AI Foundry: auto-detects .openai.azure.com vs serverless Foundry endpoints
API version defaults to 2025-01-01-preview (overridable via AZURE_FOUNDRY_API_VERSION env var)
Frontend calls /api/run-agent — matched to Vercel function in prod, Express in dev
Product
Workspace page: describe an app concept, pick a tech stack, run 4 AI agents in parallel
Outputs: ASCII architecture diagram, PostgreSQL schema, beginner README, master AI prompt
History page: browser-local history of past generations (localStorage, max 50)
Dark/light mode toggle with localStorage persistence
Vercel Deployment
Required environment variables in Vercel:

AZURE_FOUNDRY_ENDPOINT — your Azure endpoint URL
AZURE_FOUNDRY_API_KEY — your Azure API key
AZURE_FOUNDRY_DEPLOYMENT — your model deployment name
AZURE_FOUNDRY_API_VERSION — (optional) defaults to 2025-01-01-preview
Gotchas
The API version 2024-05-01-preview was retired by Azure — the fix uses 2025-01-01-preview
For .openai.azure.com endpoints: URL includes api-version query param and uses api-key header
For Azure AI Foundry serverless endpoints (non-OpenAI): URL has no api-version, uses Authorization: Bearer header
Always check your Azure portal for the exact supported API versions for your deployment
User preferences
Populate as you build — explicit user instructions worth remembering across sessions.

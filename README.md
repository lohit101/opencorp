# OpenCorp

**An open-source, local-first multi-agent AI company simulator and agent harness.**

Create AI companies with multiple AI employees. Give them roles, skills, tools, and memory. Watch them collaborate to accomplish objectives — all running on your own machine.

> "The Sims / The Office for AI agents"

---

## Concept

OpenCorp lets you create a virtual company staffed by AI agents. Each agent has:

- A **role** (CEO, Engineer, Researcher, etc.)
- A **system prompt** defining their personality and behavior
- A selected **LLM** (via OpenRouter, OpenAI, Anthropic, etc.)
- **Skills** (reusable instruction packages)
- **Tools** (terminal, filesystem, messaging, etc.)
- **Memory** (persistent knowledge)
- **Tasks** (units of work)
- **Permissions** (what they're allowed to do)

You give the company a high-level objective. The agents break it down, assign work, communicate, use tools, and eventually deliver results — all visible in real time.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/opencorp/opencorp.git
cd opencorp

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# Set up the database
npx prisma generate
npx prisma db push

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Docker** (for agent workspace sandbox)
- An **OpenRouter API key** (or another supported LLM provider)

---

## Architecture

OpenCorp uses a monorepo structure with clear separation of concerns:

```
opencorp/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # API server (future)
├── packages/
│   ├── shared/       # Shared types and utilities
│   ├── llm/          # LLM provider abstraction
│   ├── tools/        # Agent tool implementations
│   ├── memory/       # Memory store abstraction
│   ├── agent-runtime/# Core agent execution loop
│   └── orchestrator/ # Company/orchestration layer
├── skills/           # Reusable skill packages
├── prisma/           # Database schema
├── docker/           # Docker sandbox configuration
└── docs/             # Documentation
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

---

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | _(required)_ |
| `OPENROUTER_DEFAULT_MODEL` | Default LLM model | `openai/gpt-4o-mini` |
| `DATABASE_URL` | SQLite database path | `file:./opencorp.db` |
| `LOG_LEVEL` | Logging verbosity | `info` |

---

## Project Status

OpenCorp is in **early development**. The initial foundation is being established.

### Current Phase: MVP Runtime

**Phase 0 — Foundation** ✅
- [x] Project structure and monorepo setup
- [x] TypeScript configuration
- [x] Shared domain types
- [x] LLM provider abstraction (OpenRouter)
- [x] Tool system interface
- [x] Memory store interface
- [x] Agent runtime (core loop)
- [x] Orchestrator layer
- [x] Prisma schema (SQLite)
- [x] Docker sandbox configuration
- [x] Next.js web application
- [x] Skill directory structure

**Phase 1 — Working MVP** ✅
- [x] Agent runtime implementation
- [x] OpenRouter integration (real LLM calls)
- [x] Docker sandbox execution
- [x] Prisma-based memory + event stores
- [x] API routes (companies, agents, tasks, events, objective)
- [x] Company/agent creation UI
- [x] Objective input + task board + live activity feed
- [x] End-to-end verified (CEO builds a landing page)

See [ROADMAP.md](ROADMAP.md) for the full development roadmap.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Node.js, TypeScript |
| Database | SQLite (MVP), PostgreSQL (future) |
| ORM | Prisma |
| AI | OpenRouter (initial), provider-agnostic |
| Container | Docker |
| Orchestration | Custom TypeScript (no heavy frameworks) |

---

## Philosophy

OpenCorp is **not**:

- Another chatbot
- Another generic RAG application
- Another LangChain clone
- Another LLM wrapper
- A hosted SaaS (initially)
- Tied to any single AI provider

OpenCorp **is**:

- An open-source agent harness and orchestration layer
- Local-first and privacy-respecting
- Provider-agnostic (bring your own API key)
- Modular and extensible
- Built with simple, understandable TypeScript

---

## License

MIT

---

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting pull requests.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run typecheck` and `npm run lint`
5. Submit a pull request
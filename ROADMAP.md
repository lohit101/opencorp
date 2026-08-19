# OpenCorp Development Roadmap

## Phase 0: Foundation ✅ (Current)

**Goal**: Establish the project structure, architecture, and development tooling.

- [x] Monorepo structure with npm workspaces
- [x] TypeScript configuration (base + per-package)
- [x] Shared domain types (`@opencorp/shared`)
- [x] LLM provider abstraction (`@opencorp/llm`)
- [x] OpenRouter provider implementation
- [x] Tool system interface (`@opencorp/tools`)
- [x] Filesystem tools (read, write, list)
- [x] Terminal tool (placeholder)
- [x] Messaging tool
- [x] Memory store interface (`@opencorp/memory`)
- [x] In-memory memory store implementation
- [x] Agent runtime (`@opencorp/agent-runtime`)
- [x] Orchestrator layer (`@opencorp/orchestrator`)
- [x] Prisma schema (SQLite)
- [x] Docker sandbox configuration
- [x] Next.js web application
- [x] Skill directory structure
- [x] Documentation (README, ARCHITECTURE, ROADMAP)
- [x] Environment variable configuration

---

## Phase 1: MVP Agent Runtime ✅ (Complete)

**Goal**: Get a working agent loop that can execute tasks with real LLM calls.

- [x] Implement Docker sandbox execution for terminal tool
- [x] Implement Prisma-based memory store
- [x] Implement Prisma-based event store
- [x] Wire up OpenRouter provider with real API calls
- [x] Create API routes for company management
- [x] Create API routes for task execution
- [x] Create API routes for event streaming
- [x] Build company creation UI
- [x] Build agent configuration UI
- [x] Build objective input UI
- [x] Build task board UI
- [x] Build activity feed UI
- [x] Build agent status indicators
- [x] End-to-end test: CEO + Engineer complete a simple objective
- [x] Error handling for LLM failures, tool failures, timeouts
- [x] TypeScript type checking passes
- [x] Production build succeeds

**Success Criteria** (verified):
```
User: "Build me a landing page for an AI email automation product."
→ CEO receives objective
→ CEO uses tools to build index.html (hero, features, contact form, Tailwind CDN)
→ CEO reports completion with a detailed summary
→ User sees everything in the UI (task board + live activity feed)
```

### Notes / Improvements for next phase
- The MVP runs the CEO as the sole executor (it uses tools directly). True
  multi-agent delegation is Phase 2 work.
- The `CreateTaskTool` exists but CEO delegation to other agents should be
  wired up so the CEO plans and the Engineer executes.

---

## Phase 2: Multi-Agent Orchestration ✅ (Complete)

**Goal**: Support multiple agents working together on complex objectives.

- [x] Wire up CEO → Engineer delegation via `create_task`
- [x] Execute delegated tasks after the CEO's planning loop
- [x] Researcher agent with research skills
- [x] Designer agent with design skills
- [x] QA agent with testing skills
- [x] Agent-to-agent communication (send_message persisted)
- [x] Git integration tool (sandboxed)
- [x] Skill loading from `skills/` directory (`@opencorp/skills`)
- [x] Task cancellation from UI (Stop Run button + cancel API)
- [x] `list_agents` tool so the CEO can discover the team

**Success Criteria** (verified):
```
User: "Build me a landing page for an AI email automation product."
→ CEO receives objective
→ CEO uses list_agents to discover the team
→ CEO uses create_task to delegate to Engineer (Sam)
→ Engineer builds index.html in the workspace (uses git tool)
→ CEO delegates QA verification to QA agent (Tina)
→ QA verifies and reports
→ All tasks complete, all agents idle
→ User sees everything in the UI
```

### Notes / Improvements for next phase
- The CEO's planning loop can re-delegate duplicate tasks before delegated
  tasks execute (they run after the CEO loop). Consider ending the CEO loop
  after delegation, or running delegated tasks concurrently.
- The dashboard does not yet list existing companies on load (it only shows
  the company created in the current session).

---

## Phase 3: Rich User Experience 🚧 (Next)

**Goal**: Make the application feel alive and engaging.

- [ ] Visual virtual office layout
- [ ] Agent avatars and status animations
- [ ] Real-time agent activity visualization
- [ ] Live terminal output view
- [ ] Run history and replay
- [ ] Agent profiles and statistics
- [ ] Task timeline and Gantt chart
- [ ] Message history viewer
- [ ] Memory browser
- [ ] File explorer for workspace
- [ ] Log viewer with filtering
- [ ] Dark/light theme
- [ ] Responsive design

---

## Phase 4: Provider Expansion

**Goal**: Support multiple LLM providers with seamless switching.

- [ ] OpenAI direct provider
- [ ] Anthropic direct provider
- [ ] Google Gemini provider
- [ ] Ollama/local model provider
- [ ] Custom OpenAI-compatible endpoint provider
- [ ] Provider configuration UI
- [ ] Per-agent provider selection
- [ ] Model fallback configuration
- [ ] Cost tracking per provider
- [ ] Token usage analytics

---

## Phase 5: Advanced Features

**Goal**: Production-ready features for serious use.

- [ ] Custom agent creation UI
- [ ] Custom skill creation and editing
- [ ] Skill discovery and import
- [ ] Agent templates
- [ ] Company templates
- [ ] Project templates
- [ ] Export/import company configurations
- [ ] PostgreSQL support
- [ ] Docker Compose production deployment
- [ ] User authentication (optional)
- [ ] Team collaboration (optional)
- [ ] Advanced observability and monitoring
- [ ] Agent performance benchmarking
- [ ] Comprehensive test suite
- [ ] CI/CD pipeline
- [ ] Security audit

---

## Phase 6: Ecosystem

**Goal**: Build an open ecosystem around OpenCorp.

- [ ] Skill marketplace
- [ ] Tool marketplace
- [ ] Provider marketplace
- [ ] Community skill contributions
- [ ] Plugin system
- [ ] API for external integrations
- [ ] Documentation site
- [ ] Example companies and projects
- [ ] Video tutorials
- [ ] Community forums

---

## Guiding Principles

1. **Local-first**: Everything should work offline with SQLite.
2. **Provider-agnostic**: Never lock users into a single AI provider.
3. **Modular**: Clear boundaries between components.
4. **Observable**: Every important event is visible.
5. **Simple**: Prefer simple TypeScript over complex frameworks.
6. **Incremental**: Each phase builds on the previous one.
7. **Open source**: The codebase should be easy to understand and contribute to.

## Current Focus

**Phase 1** is the immediate next step. The agent runtime is architecturally defined but needs to be wired up to real LLM calls, Docker execution, and a working UI.
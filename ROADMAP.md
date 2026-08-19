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

## Phase 1: MVP Agent Runtime 🚧 (Next)

**Goal**: Get a working agent loop that can execute tasks with real LLM calls.

- [ ] Implement Docker sandbox execution for terminal tool
- [ ] Implement Prisma-based memory store
- [ ] Implement Prisma-based event store
- [ ] Wire up OpenRouter provider with real API calls
- [ ] Create API routes for company management
- [ ] Create API routes for task execution
- [ ] Create API routes for event streaming
- [ ] Build company creation UI
- [ ] Build agent configuration UI
- [ ] Build objective input UI
- [ ] Build task board UI
- [ ] Build activity feed UI
- [ ] Build agent status indicators
- [ ] End-to-end test: CEO + Engineer complete a simple objective
- [ ] Error handling for LLM failures, tool failures, timeouts
- [ ] TypeScript type checking passes
- [ ] Production build succeeds

**Success Criteria**:
```
User: "Create a simple React website."
→ CEO receives objective
→ CEO creates task for Engineer
→ Engineer implements the website
→ Engineer reports completion
→ User sees everything in the UI
```

---

## Phase 2: Multi-Agent Orchestration

**Goal**: Support multiple agents working together on complex objectives.

- [ ] Researcher agent with web research skills
- [ ] Designer agent with design skills
- [ ] QA agent with testing skills
- [ ] Task dependency system
- [ ] Parallel task execution
- [ ] Agent-to-agent communication in real time
- [ ] Better orchestration logic (CEO delegates to multiple agents)
- [ ] Git integration tool
- [ ] Browser automation tool
- [ ] Enhanced memory with relevance scoring
- [ ] Skill loading from database
- [ ] Reusable skill marketplace (local)
- [ ] WebSocket-based real-time UI updates
- [ ] Task cancellation from UI
- [ ] Agent state persistence across sessions

---

## Phase 3: Rich User Experience

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
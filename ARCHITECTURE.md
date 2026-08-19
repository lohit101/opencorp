# OpenCorp Architecture

## Overview

OpenCorp is a modular, local-first multi-agent AI company simulator. The architecture is designed around clear abstractions with minimal coupling between components.

```
┌─────────────────────────────────────────────────────────┐
│                     Web UI (Next.js)                      │
│  Company View │ Agent List │ Task Board │ Activity Feed  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                    Orchestrator                           │
│  Company Management │ Task Assignment │ Agent Coordination│
└──────┬──────────┬──────────┬──────────┬─────────────────┘
       │          │          │          │
┌──────▼──┐ ┌─────▼────┐ ┌──▼────┐ ┌──▼──────────────┐
│ Agent   │ │ Agent    │ │ Agent │ │ ...              │
│ Runtime │ │ Runtime  │ │Memory │ │                  │
└───┬─────┘ └───┬──────┘ └──┬────┘ └─────────────────┘
    │           │           │
    │      ┌────▼────┐      │
    │      │  LLM    │      │
    │      │Provider │      │
    │      └─────────┘      │
    │                       │
┌───▼───────────────────────▼──┐
│         Tools                 │
│  Terminal │ Filesystem │ Msg  │
└───┬──────────────────────────┘
    │
┌───▼──────────────────────────┐
│     Docker Sandbox            │
│     /workspace (isolated)     │
└──────────────────────────────┘
```

## Core Abstractions

### 1. Agent (`packages/agent-runtime/`)

An agent is an AI employee. It consists of:

- **Identity**: id, name, role, description
- **Model Configuration**: provider, model name, parameters
- **System Prompt**: Instructions defining behavior
- **Skills**: References to reusable skill packages
- **Tools**: References to executable tools
- **Permissions**: What the agent is allowed to do
- **State**: Current execution state (idle, running, thinking, etc.)

Agents are **not hardcoded**. They are configurable entities stored in the database.

### 2. Agent Runtime (`packages/agent-runtime/`)

The runtime is the core execution loop. It:

1. Receives a task
2. Loads agent configuration, skills, and memory
3. Builds context for the LLM
4. Sends requests to the LLM provider
5. Processes LLM responses (text + tool calls)
6. Executes tool calls and returns results to the LLM
7. Continues until the task is completed, fails, or is cancelled

The runtime is **observable** — every important event is emitted for the UI to consume.

### 3. LLM Provider (`packages/llm/`)

A clean interface for interacting with language models:

```typescript
interface LLMProvider {
  chat(messages, options): Promise<ChatResponse>
  healthCheck(): Promise<HealthCheckResult>
}
```

The initial implementation is `OpenRouterProvider`. Additional providers (OpenAI, Anthropic, Ollama) can be added by implementing the same interface.

### 4. Tool (`packages/tools/`)

Tools are executable functions exposed to agents:

```typescript
interface Tool {
  definition: ToolDefinition  // Name, description, parameter schema
  execute(call, context): Promise<ToolExecutionResult>
}
```

Initial tools:
- `terminal` — Execute shell commands (inside Docker sandbox)
- `read_file` — Read file contents
- `write_file` — Write/create files
- `list_files` — List directory contents
- `send_message` — Communicate with other agents
- `create_task` — Delegate work to another agent (used by the CEO)
- `list_agents` — Discover the team roster (used by the CEO)
- `git` — Run git commands inside the sandboxed workspace

### 5. Skill (`packages/skills/` + `skills/`)

Skills are Markdown-based instruction packages that teach agents how to perform specific work. They are:

- Human-readable
- Version-controlled
- Reusable across agents
- Easy to create and modify

The `@opencorp/skills` package provides a `SkillLoader` that reads `SKILL.md`
files from the `skills/` directory. The `AgentRuntime` accepts a `SkillProvider`
and injects each agent's referenced skills into its context before the LLM call.

Skills are **not tools**. Tools are executable; skills are instructional.

### 6. Memory (`packages/memory/`)

Memory provides persistent storage for agent knowledge:

```typescript
interface MemoryStore {
  store(entry): Promise<MemoryEntry>
  search(params): Promise<MemoryEntry[]>
  getById(id): Promise<MemoryEntry | null>
  update(id, updates): Promise<MemoryEntry>
  delete(id): Promise<void>
}
```

Memory types: `company`, `project`, `task`, `agent`, `decision`

### 7. Task

A unit of work assigned to an agent. Statuses: `pending`, `assigned`, `running`, `blocked`, `completed`, `failed`.

### 8. Message

Communication between agents. Contains sender, recipient, content, and optional task reference.

### 9. Workspace

An isolated filesystem environment (Docker container) where agents perform work.

### 10. Orchestrator (`packages/orchestrator/`)

The management layer that coordinates agents and tasks. It:

- Receives company objectives
- Creates and assigns tasks
- Manages agent runtimes
- Routes messages between agents
- Tracks overall progress
- Emits system events

### 11. Company

A collection of agents, tasks, memory, skills, workspaces, and configuration.

## Data Flow

### Task Execution Flow

```
User gives objective
       │
       ▼
Orchestrator receives objective
       │
       ▼
Orchestrator creates task for CEO agent
       │
       ▼
CEO Agent Runtime starts
       │
       ▼
CEO LLM receives: "Break this objective into tasks"
       │
       ▼
CEO uses create_task tool to create subtasks
       │
       ▼
CEO assigns tasks to Engineer agent
       │
       ▼
Engineer Agent Runtime starts
       │
       ▼
Engineer LLM receives task + context + tools
       │
       ▼
Engineer uses tools (terminal, filesystem, etc.)
       │
       ▼
Engineer completes task
       │
       ▼
CEO reviews and reports completion
```

### Event Flow

```
Agent Runtime ──emit──► SystemEvent ──store──► Database
                              │
                              ▼
                         Web UI (polling/WebSocket)
                              │
                              ▼
                         User sees live updates
```

## Database Layer (`packages/db/`)

The `@opencorp/db` package bridges the domain packages to SQLite/Prisma. It provides:

- **Repositories**: `CompanyRepository`, `AgentRepository`, `TaskRepository`, `MessageRepository` — focused persistence logic for each entity.
- **Stores**: `PrismaMemoryStore` (implements the `MemoryStore` interface from `@opencorp/memory`), `EventStore` (persists observable system events).
- **Prisma client singleton**: `client.ts` exports a shared `PrismaClient` that avoids exhausting connections during dev hot-reloads.

Domain packages (`llm`, `tools`, `agent-runtime`, `orchestrator`) depend on **interfaces** (e.g. `MemoryStore`, `Tool`, `LLMProvider`), while the web app + db package provide concrete implementations.

## Database Schema

The database uses SQLite (via Prisma) for local-first operation.

Key models:
- `Company` — Top-level organization
- `Agent` — AI employee configuration
- `Task` — Units of work
- `Message` — Agent-to-agent communication
- `Memory` — Persistent knowledge entries
- `SystemEvent` — Observable events for the UI
- `Workspace` — Isolated work environments

See `prisma/schema.prisma` for the full schema.

## Security Model

1. **API Keys**: Never stored in source code. Configured via environment variables.
2. **Workspace Isolation**: File operations are confined to a dedicated, per-company workspace directory (`.workspaces/{companyId}/`). The `terminal` tool executes commands inside a Docker container that mounts the same directory, so no arbitrary host commands are run.
3. **Path Validation**: File operations are validated to prevent directory traversal.
4. **Tool Permissions**: Agents can only use explicitly configured tools.
5. **No Host Access**: Agents cannot execute arbitrary commands on the host machine.

> **Note**: The Docker sandbox is a lightweight isolation layer, not a fully hardened sandbox. Treat agents as untrusted and review permissions carefully. See `docker/` and `packages/tools/src/sandbox.ts`.

## Provider Abstraction

The LLM provider interface allows any model provider to be used:

```
LLMProvider (interface)
    │
    ├── OpenRouterProvider
    ├── OpenAIProvider (future)
    ├── AnthropicProvider (future)
    ├── GoogleProvider (future)
    └── OllamaProvider (future)
```

The agent runtime depends only on the interface, never on a specific provider implementation.
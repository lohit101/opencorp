// =============================================================================
// Core Domain Types for OpenCorp
// =============================================================================
// These types define the fundamental domain entities used across all packages.
// They should remain stable and avoid unnecessary dependencies.
// =============================================================================

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export type AgentState = 'idle' | 'running' | 'thinking' | 'waiting' | 'blocked' | 'error';

export interface AgentConfig {
  id: string;
  companyId: string;
  name: string;
  role: string;
  department: string;
  description: string;
  modelConfig: ModelConfig;
  systemPrompt: string;
  skillIds: string[];
  toolNames: string[];
  permissions: AgentPermissions;
  memoryConfig: MemoryConfig;
  state: AgentState;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPermissions {
  allowedTools: string[];
  allowedWorkspaces: string[];
  maxConcurrentTasks: number;
  requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// LLM / Model
// ---------------------------------------------------------------------------

export type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';

export interface ModelConfig {
  provider: ProviderType;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  apiKey?: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
  name?: string;
}

export interface AgentMessage {
  id: string;
  companyId: string;
  senderAgentId: string;
  recipientAgentId: string | null;
  taskId: string | null;
  content: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'blocked' | 'completed' | 'failed';

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgentId: string | null;
  parentTaskId: string | null;
  priority: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export type MemoryType = 'company' | 'project' | 'task' | 'agent' | 'decision';

export interface MemoryEntry {
  id: string;
  companyId: string;
  type: MemoryType;
  key: string;
  content: string;
  tags: string[];
  sourceAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryConfig {
  enabled: boolean;
  maxEntries: number;
  types: MemoryType[];
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  instructions: string;
  version: string;
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export interface Company {
  id: string;
  name: string;
  description: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  companyId: string;
  name: string;
  path: string;
  containerId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventType =
  | 'agent.created'
  | 'agent.started'
  | 'agent.stopped'
  | 'agent.thinking'
  | 'agent.tool_called'
  | 'agent.tool_completed'
  | 'agent.message_sent'
  | 'agent.error'
  | 'agent.iteration_limit'
  | 'task.created'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'memory.created'
  | 'memory.updated'
  | 'workspace.changed'
  | 'company.objective_set'
  | 'company.started'
  | 'company.completed'
  | 'system.error'
  | 'system.info';

export interface SystemEvent {
  id: string;
  companyId: string;
  type: EventType;
  agentId?: string;
  taskId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export type OrchestratorState = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface OrchestratorStatus {
  state: OrchestratorState;
  companyId: string;
  currentObjective?: string;
  activeAgents: string[];
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  startedAt?: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AppConfig {
  llm: {
    provider: ProviderType;
    apiKey: string;
    defaultModel: string;
    baseUrl?: string;
  };
  database: {
    url: string;
  };
  docker: {
    image: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}
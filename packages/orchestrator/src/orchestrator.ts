import type {
  Company,
  AgentConfig,
  Task,
  SystemEvent,
  OrchestratorState,
  AgentMessage,
} from '@opencorp/shared';
import type { LLMProvider } from '@opencorp/llm';
import type { Tool } from '@opencorp/tools';
import type { MemoryStore } from '@opencorp/memory';
import { AgentRuntime } from '@opencorp/agent-runtime';

/**
 * Orchestrator manages the execution of company objectives.
 *
 * It coordinates agents, assigns tasks, and monitors progress.
 * For the MVP, it provides a simple sequential execution flow.
 */
export class Orchestrator {
  private readonly company: Company;
  private readonly agents: Map<string, AgentConfig>;
  private readonly runtimes: Map<string, AgentRuntime>;
  private readonly llmProvider: LLMProvider;
  private readonly tools: Tool[];
  private readonly memory: MemoryStore;
  private readonly eventHandler?: (event: SystemEvent) => Promise<void>;

  private state: OrchestratorState = 'idle';
  private tasks: Task[] = [];
  private messages: AgentMessage[] = [];

  constructor(params: {
    company: Company;
    agents: AgentConfig[];
    llmProvider: LLMProvider;
    tools: Tool[];
    memory: MemoryStore;
    eventHandler?: (event: SystemEvent) => Promise<void>;
  }) {
    this.company = params.company;
    this.agents = new Map(params.agents.map((a) => [a.id, a]));
    this.llmProvider = params.llmProvider;
    this.tools = params.tools;
    this.memory = params.memory;
    this.eventHandler = params.eventHandler;

    this.runtimes = new Map();
    for (const agent of params.agents) {
      const runtime = new AgentRuntime({
        agent,
        llmProvider: this.llmProvider,
        tools: this.tools,
        memory: this.memory,
        eventHandler: this.eventHandler,
      });
      this.runtimes.set(agent.id, runtime);
    }
  }

  get companyId(): string {
    return this.company.id;
  }

  get status(): {
    state: OrchestratorState;
    companyId: string;
    activeAgents: string[];
    pendingTasks: number;
    completedTasks: number;
    failedTasks: number;
  } {
    return {
      state: this.state,
      companyId: this.company.id,
      activeAgents: Array.from(this.agents.keys()),
      pendingTasks: this.tasks.filter((t) => t.status === 'pending').length,
      completedTasks: this.tasks.filter((t) => t.status === 'completed').length,
      failedTasks: this.tasks.filter((t) => t.status === 'failed').length,
    };
  }

  get allTasks(): Task[] {
    return [...this.tasks];
  }

  get allMessages(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Start executing a company objective.
   * For the MVP, this creates a single task for the CEO agent.
   */
  async startObjective(objective: string): Promise<void> {
    this.state = 'running';

    await this.emitEvent('company.objective_set', { objective });

    // Store the objective in memory
    await this.memory.store({
      companyId: this.company.id,
      type: 'company',
      key: 'current-objective',
      content: objective,
      tags: ['objective'],
    });

    // Find the CEO agent
    const ceoAgent = Array.from(this.agents.values()).find(
      (a) => a.role === 'CEO',
    );

    if (!ceoAgent) {
      throw new Error('No CEO agent found in company');
    }

    // Create the initial task for the CEO
    const task: Task = {
      id: crypto.randomUUID(),
      companyId: this.company.id,
      title: 'Execute company objective',
      description: objective,
      status: 'pending',
      assignedAgentId: ceoAgent.id,
      parentTaskId: null,
      dependsOnTaskIds: [],
      priority: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.push(task);
    await this.emitEvent('task.created', { taskId: task.id, title: task.title });

    // Execute the task
    const runtime = this.runtimes.get(ceoAgent.id);
    if (!runtime) {
      throw new Error(`Runtime not found for agent: ${ceoAgent.id}`);
    }

    const result = await runtime.executeTask(task);

    // Update task in our list
    const index = this.tasks.findIndex((t) => t.id === result.id);
    if (index !== -1) {
      this.tasks[index] = result;
    }

    this.state = result.status === 'completed' ? 'completed' : 'error';
    await this.emitEvent('company.completed', {
      objective,
      status: this.state,
    });
  }

  /**
   * Handle an incoming agent message.
   */
  async handleMessage(message: AgentMessage): Promise<void> {
    this.messages.push(message);
    await this.emitEvent('agent.message_sent', {
      from: message.senderAgentId,
      to: message.recipientAgentId,
      content: message.content,
    });
  }

  /**
   * Cancel all running agents.
   */
  cancel(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.cancel();
    }
    this.state = 'idle';
  }

  private async emitEvent(
    type: import('@opencorp/shared').EventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventHandler) return;

    await this.eventHandler({
      id: crypto.randomUUID(),
      companyId: this.company.id,
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
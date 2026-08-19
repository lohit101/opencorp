import type { AgentConfig, Task, SystemEvent, Skill } from '@opencorp/shared';
import type { LLMProvider } from '@opencorp/llm';
import type { Tool } from '@opencorp/tools';
import type { MemoryStore } from '@opencorp/memory';

/**
 * Provider that supplies skill instructions for an agent's role.
 * The runtime injects these into the agent's context before the LLM call.
 */
export interface SkillProvider {
  loadSkills(agent: AgentConfig): Promise<Skill[]>;
}

/**
 * AgentRuntime is the core execution loop for an AI agent.
 *
 * It manages the conversation with the LLM, executes tool calls,
 * and maintains agent state throughout task execution.
 */
export class AgentRuntime {
  private readonly agent: AgentConfig;
  private readonly llmProvider: LLMProvider;
  private readonly tools: Map<string, Tool>;
  private readonly memory: MemoryStore;
  private readonly skillProvider?: SkillProvider;
  private readonly eventHandler?: (event: SystemEvent) => Promise<void>;

  private currentTask: Task | null = null;
  private abortController: AbortController | null = null;

  constructor(params: {
    agent: AgentConfig;
    llmProvider: LLMProvider;
    tools: Tool[];
    memory: MemoryStore;
    skillProvider?: SkillProvider;
    eventHandler?: (event: SystemEvent) => Promise<void>;
  }) {
    this.agent = params.agent;
    this.llmProvider = params.llmProvider;
    this.tools = new Map(params.tools.map((t) => [t.definition.name, t]));
    this.memory = params.memory;
    this.skillProvider = params.skillProvider;
    this.eventHandler = params.eventHandler;
  }

  get agentId(): string {
    return this.agent.id;
  }

  get state() {
    return this.agent.state;
  }

  /**
   * Execute a task from start to finish.
   * This is the main agent loop.
   */
  async executeTask(task: Task): Promise<Task> {
    this.currentTask = task;
    this.abortController = new AbortController();

    await this.emitEvent('task.started', { taskId: task.id });

    try {
      // Load relevant memory for context
      const relevantMemory = await this.memory.search({
        companyId: this.agent.companyId,
        limit: 20,
      });

      // Build initial context
      const context = await this.buildContext(task, relevantMemory);

      // Main agent loop
      const result = await this.runLoop(context);

      const completedTask: Task = {
        ...task,
        status: 'completed',
        result: result,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      await this.emitEvent('task.completed', {
        taskId: task.id,
        result: result,
      });

      return completedTask;
    } catch (error) {
      const failedTask: Task = {
        ...task,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
      };

      await this.emitEvent('task.failed', {
        taskId: task.id,
        error: failedTask.error,
      });

      return failedTask;
    } finally {
      this.currentTask = null;
      this.abortController = null;
    }
  }

  /**
   * Cancel the currently executing task.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async runLoop(context: string): Promise<string> {
    const messages: import('@opencorp/llm').LLMMessage[] = [
      { role: 'user', content: context },
    ];

    const availableTools = this.getAvailableTools();

    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      iterations++;

      await this.emitEvent('agent.thinking', {
        agentId: this.agent.id,
        iteration: iterations,
      });

      // Call the LLM
      const response = await this.llmProvider.chat(messages, {
        model: this.agent.modelConfig.model,
        systemPrompt: this.agent.systemPrompt,
        tools: availableTools,
        signal: this.abortController?.signal,
      });

      // If the LLM produced text content, add it to the conversation
      if (response.content) {
        messages.push({ role: 'assistant', content: response.content });
      }

      // If the LLM wants to call tools
      if (response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          await this.emitEvent('agent.tool_called', {
            agentId: this.agent.id,
            toolName: toolCall.toolName,
            arguments: toolCall.arguments,
          });

          const tool = this.tools.get(toolCall.toolName);
          if (!tool) {
            messages.push({
              role: 'tool',
              content: `Error: Tool "${toolCall.toolName}" not found`,
              toolCallId: toolCall.id,
              toolName: toolCall.toolName,
            });
            continue;
          }

          // Execute the tool
          const result = await tool.execute(toolCall, {
            workspacePath: `/workspace/${this.agent.companyId}`,
            agentId: this.agent.id,
            companyId: this.agent.companyId,
            signal: this.abortController?.signal,
          });

          await this.emitEvent('agent.tool_completed', {
            agentId: this.agent.id,
            toolName: toolCall.toolName,
            success: result.success,
          });

          messages.push({
            role: 'tool',
            content: result.success
              ? JSON.stringify(result.data)
              : `Error: ${result.error}`,
            toolCallId: toolCall.id,
            toolName: toolCall.toolName,
          });
        }
      }

      // If the LLM finished without tool calls, we're done
      if (response.finishReason === 'stop' && response.toolCalls.length === 0) {
        return response.content;
      }

      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw new Error('Task execution was cancelled');
      }
    }

    throw new Error(`Task exceeded maximum iterations (${maxIterations})`);
  }

  private async buildContext(
    task: Task,
    memory: import('@opencorp/shared').MemoryEntry[],
  ): Promise<string> {
    let context = `You have been assigned the following task:\n\n`;
    context += `Title: ${task.title}\n`;
    context += `Description: ${task.description}\n\n`;

    if (memory.length > 0) {
      context += `Relevant memory:\n`;
      for (const entry of memory.slice(0, 10)) {
        context += `- [${entry.type}] ${entry.key}: ${entry.content}\n`;
      }
      context += '\n';
    }

    // Inject relevant skills into the context
    if (this.skillProvider) {
      const skills = await this.skillProvider.loadSkills(this.agent);
      if (skills.length > 0) {
        context += `## Your Skills\n`;
        for (const skill of skills) {
          context += `\n### Skill: ${skill.name} (${skill.id})\n`;
          context += `${skill.instructions}\n`;
        }
        context += '\n';
      }
    }

    context += `You have the following tools available:\n`;
    for (const [name, tool] of this.tools) {
      context += `- ${name}: ${tool.definition.description}\n`;
    }

    context += `\nWork in the workspace directory. Complete the task and report your results.`;

    return context;
  }

  private getAvailableTools(): import('@opencorp/shared').ToolDefinition[] {
    return this.agent.toolNames
      .map((name: string) => this.tools.get(name)?.definition)
      .filter((d): d is import('@opencorp/shared').ToolDefinition => d !== undefined);
  }

  private async emitEvent(
    type: import('@opencorp/shared').EventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventHandler) return;

    await this.eventHandler({
      id: crypto.randomUUID(),
      companyId: this.agent.companyId,
      type,
      agentId: this.agent.id,
      taskId: this.currentTask?.id,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
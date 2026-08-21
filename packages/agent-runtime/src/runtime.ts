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
  private readonly maxIterations: number;

  private currentTask: Task | null = null;
  private abortController: AbortController | null = null;
  /** Soft stop: finish current step then wrap up in a few iterations. */
  private stopRequested = false;
  /** Optional external signal (e.g. from an orchestrator) that aborts the task. */
  private readonly externalSignal?: AbortSignal;

  constructor(params: {
    agent: AgentConfig;
    llmProvider: LLMProvider;
    tools: Tool[];
    memory: MemoryStore;
    skillProvider?: SkillProvider;
    eventHandler?: (event: SystemEvent) => Promise<void>;
    /** Max LLM tool round-trips before the loop gives up. Default: 80 for workers. */
    maxIterations?: number;
    /** Optional external signal; when aborted, the running task is cancelled. */
    signal?: AbortSignal;
  }) {
    this.agent = params.agent;
    this.llmProvider = params.llmProvider;
    this.tools = new Map(params.tools.map((t) => [t.definition.name, t]));
    this.memory = params.memory;
    this.skillProvider = params.skillProvider;
    this.eventHandler = params.eventHandler;
    this.maxIterations = params.maxIterations ?? 80;
    this.externalSignal = params.signal;
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
    this.stopRequested = false;
    this.abortController = new AbortController();

    // If an external signal was provided, abort our internal controller whenever
    // the external one is aborted so a single cancel() aborts every runtime.
    const controller = this.abortController;
    if (this.externalSignal) {
      if (this.externalSignal.aborted) {
        this.stopRequested = true;
        controller.abort();
      } else {
        this.externalSignal.addEventListener(
          'abort',
          () => {
            this.stopRequested = true;
            controller.abort();
          },
          { once: true },
        );
      }
    }

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

      // Soft/hard stop: treat as cancelled even if we produced a wrap-up summary.
      if (this.stopRequested || this.abortController?.signal.aborted) {
        const cancelledTask: Task = {
          ...task,
          status: 'failed',
          result,
          error: 'Cancelled by user',
          updatedAt: new Date().toISOString(),
        };
        await this.emitEvent('task.failed', {
          taskId: task.id,
          error: 'Cancelled by user',
          result,
        });
        return cancelledTask;
      }

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

      // Agent learning: store a durable memory of what was accomplished so
      // future runs benefit from this agent's experience.
      await this.storeLearning(task, result);

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
      this.stopRequested = false;
    }
  }

  /**
   * Ask the agent to stop productive work and wrap up in a few steps.
   * Prefer this over hard cancel when the user hits Stop Run.
   */
  requestStop(): void {
    this.stopRequested = true;
    // Abort in-flight LLM/tool calls so we don't wait on long operations;
    // cancelWrapUp intentionally does not use the aborted signal.
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  /**
   * Cancel the currently executing task (hard stop + wrap-up path).
   */
  cancel(): void {
    this.requestStop();
  }

  private shouldStop(): boolean {
    return (
      this.stopRequested ||
      !!this.abortController?.signal.aborted ||
      !!this.externalSignal?.aborted
    );
  }

  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const name = 'name' in error ? String((error as { name: unknown }).name) : '';
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      name === 'AbortError' ||
      message.includes('aborted') ||
      message.includes('abort')
    );
  }

  /**
   * Store a durable "lesson learned" memory after a task completes, so the
   * agent (and its team) benefit from this experience on future runs.
   */
  private async storeLearning(task: Task, result: string): Promise<void> {
    try {
      const summary = result.slice(0, 2000);
      await this.memory.store({
        companyId: this.agent.companyId,
        type: 'task',
        key: `task:${task.id}:outcome`,
        content: `[${this.agent.name} (${this.agent.role})] Completed task "${task.title}". Outcome: ${summary}`,
        tags: ['learning', 'task-outcome', this.agent.role.toLowerCase()],
        sourceAgentId: this.agent.id,
      });
    } catch {
      // Learning is best-effort; never fail the task because memory failed.
    }
  }

  private async runLoop(context: string): Promise<string> {
    const messages: import('@opencorp/llm').LLMMessage[] = [
      { role: 'user', content: context },
    ];

    const availableTools = this.getAvailableTools();

    let iterations = 0;
    // Track recent tool calls (normalized) to detect if the agent is looping.
    const recentCalls: string[] = [];
    let workDone = false; // Did the agent actually perform any productive work?

    while (iterations < this.maxIterations) {
      iterations++;

      if (this.shouldStop()) {
        return this.cancelWrapUp(messages);
      }

      await this.emitEvent('agent.thinking', {
        agentId: this.agent.id,
        iteration: iterations,
      });

      // Call the LLM
      let response: import('@opencorp/llm').ChatResponse;
      try {
        response = await this.llmProvider.chat(messages, {
          model: this.agent.modelConfig.model,
          systemPrompt: this.agent.systemPrompt,
          tools: availableTools,
          signal: this.abortController?.signal,
        });
      } catch (error) {
        if (this.shouldStop() || this.isAbortError(error)) {
          this.stopRequested = true;
          return this.cancelWrapUp(messages);
        }
        throw error;
      }

      // If the LLM produced text content, add it to the conversation
      if (response.content) {
        messages.push({ role: 'assistant', content: response.content });
      }

      // If the LLM wants to call tools
      if (response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          if (this.shouldStop()) {
            break;
          }

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
          let result: import('@opencorp/tools').ToolExecutionResult;
          try {
            result = await tool.execute(toolCall, {
              workspacePath: `/workspace/${this.agent.companyId}`,
              agentId: this.agent.id,
              companyId: this.agent.companyId,
              signal: this.abortController?.signal,
            });
          } catch (error) {
            if (this.shouldStop() || this.isAbortError(error)) {
              this.stopRequested = true;
              messages.push({
                role: 'tool',
                content: 'Error: Cancelled by user',
                toolCallId: toolCall.id,
                toolName: toolCall.toolName,
              });
              break;
            }
            throw error;
          }

          // Track "productive" actions (file writes, terminal, git commits).
          const isWork = ['write_file', 'terminal', 'git'].includes(
            toolCall.toolName,
          );
          if (result.success && isWork) {
            workDone = true;
          }

          await this.emitEvent('agent.tool_completed', {
            agentId: this.agent.id,
            toolName: toolCall.toolName,
            success: result.success,
            summary:
              extractSummary(toolCall.toolName, toolCall.arguments, result),
          });

          messages.push({
            role: 'tool',
            content: result.success
              ? JSON.stringify(result.data)
              : `Error: ${result.error}`,
            toolCallId: toolCall.id,
            toolName: toolCall.toolName,
          });

          // Loop detection: log a normalized signature of this tool call.
          recentCalls.push(
            `${toolCall.toolName}:${JSON.stringify(toolCall.arguments ?? {})}`,
          );
        }

        if (this.shouldStop()) {
          return this.cancelWrapUp(messages);
        }

        // If the agent repeated the same exact tool call several times in a row,
        // it's likely stuck. Inject a redirect so it tries a different approach
        // rather than burning iterations on the same action.
        const last = recentCalls.slice(-4);
        if (
          last.length === 4 &&
          new Set(last).size === 1
        ) {
          await this.emitEvent('agent.loop_detected', {
            agentId: this.agent.id,
            toolName: last[0],
          });
          messages.push({
            role: 'user',
            content:
              `You appear to be repeating the same action (${last[0]}) without progress. ` +
              `STOP repeating it. Re-evaluate the situation and try a DIFFERENT approach, or ` +
              `if you are blocked and need input, use the "ask_user" tool. Do not call ` +
              `${last[0]} again with the same arguments.`,
          });
        }
      }

      // If the LLM finished without tool calls, we're done
      if (response.finishReason === 'stop' && response.toolCalls.length === 0) {
        // If the agent claims to be done but has done NO real work, nudge it to
        // actually do the task rather than just talking about it.
        if (!workDone && iterations < 3 && !this.shouldStop()) {
          messages.push({
            role: 'user',
            content:
              `You have not actually performed any work yet (no files written, no commands run). ` +
              `Do not report completion. Actually perform the task using your tools — write files, ` +
              `run commands, and produce a working result. Only report done after you have ` +
              `created/verified a deliverable. If you need input, use "ask_user".`,
          });
          continue;
        }
        return response.content;
      }

      if (this.shouldStop()) {
        return this.cancelWrapUp(messages);
      }
    }

    // We've hit the iteration cap. Instead of silently failing, gracefully
    // wrap up: ask the LLM one final time to summarize what it has completed
    // so far and report any remaining work, so the task is marked complete
    // with an honest status rather than pretending the job is done.
    return this.wrapUp(messages, availableTools);
  }

  /**
   * User hit Stop: one brief summary LLM call (no tools) so every agent —
   * including delegated workers — quits productive work quickly.
   */
  private async cancelWrapUp(
    messages: import('@opencorp/llm').LLMMessage[],
  ): Promise<string> {
    await this.emitEvent('agent.stopped', {
      agentId: this.agent.id,
      reason: 'cancelled_by_user',
    });

    messages.push({
      role: 'user',
      content:
        `The user cancelled this run. STOP all productive work immediately. ` +
        `Do NOT call tools. In 2–4 short sentences, summarize what you finished ` +
        `and what remains incomplete. Then stop.`,
    });

    try {
      // Intentionally omit the aborted signal so this final summary can complete.
      const response = await this.llmProvider.chat(messages, {
        model: this.agent.modelConfig.model,
        systemPrompt: this.agent.systemPrompt,
        tools: [],
      });
      return (
        response.content ??
        'Run cancelled by user. Work stopped; no further summary available.'
      );
    } catch {
      return 'Run cancelled by user. Work stopped.';
    }
  }

  /**
   * When the iteration cap is reached, do a "final push" to produce a minimum
   * working result instead of just stopping. The agent may still call tools
   * once more to create/verify the most critical deliverable, then it produces
   * an honest final summary. This keeps the task from being marked complete
   * without at least attempting a usable outcome.
   */
  private async wrapUp(
    messages: import('@opencorp/llm').LLMMessage[],
    availableTools: import('@opencorp/shared').ToolDefinition[],
  ): Promise<string> {
    await this.emitEvent('agent.iteration_limit', {
      agentId: this.agent.id,
      maxIterations: this.maxIterations,
    });

    const finalPushPrompt: import('@opencorp/llm').LLMMessage = {
      role: 'user',
      content:
        `You have reached the maximum number of tool iterations (${this.maxIterations}). ` +
        `You must now produce a MINIMUM WORKING RESULT. You may call tools ONE more time ` +
        `to create or verify the single most critical deliverable, but keep it minimal and focused. ` +
        `Then provide a final summary of:\n` +
        `1. The minimum working result you produced (be specific about files created/modified and work done).\n` +
        `2. What remains incomplete or outstanding.\n` +
        `3. Any next steps that would be needed to finish.\n\n` +
        `Prioritize producing something that works over perfection. Do not stop until you have ` +
        `created or verified at least a minimal deliverable.`,
    };
    messages.push(finalPushPrompt);

    const response = await this.llmProvider.chat(messages, {
      model: this.agent.modelConfig.model,
      systemPrompt: this.agent.systemPrompt,
      tools: availableTools,
      signal: this.abortController?.signal,
    });

    // If the LLM wants to call tools in this final push, execute them so it can
    // actually produce the minimal working result.
    if (response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
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
        const result = await tool.execute(toolCall, {
          workspacePath: `/workspace/${this.agent.companyId}`,
          agentId: this.agent.id,
          companyId: this.agent.companyId,
          signal: this.abortController?.signal,
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

      // Get the final summary after the final tool calls.
      const finalResponse = await this.llmProvider.chat(messages, {
        model: this.agent.modelConfig.model,
        systemPrompt: this.agent.systemPrompt,
        tools: availableTools,
        signal: this.abortController?.signal,
      });
      return (
        finalResponse.content ??
        `Reached iteration limit (${this.maxIterations}). No final summary was produced.`
      );
    }

    return (
      response.content ??
      `Reached iteration limit (${this.maxIterations}). No final summary was produced.`
    );
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

    context += `\nWork in the workspace directory. Complete the task and produce a WORKING result.\n\n`;
    context += `**VERIFY YOUR WORK**: Do not report the task as done until you have actually created `;
    context += `or modified files and (where possible) verified they work (e.g. run a build, serve, `;
    context += `or test command). If a build/test fails, fix it and re-run. Only report completion `;
    context += `once you have created a deliverable that works. If you are blocked and need input, `;
    context += `tell the user by calling the "ask_user" tool.`;

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

/**
 * Build a human-readable summary of what a tool did, for the activity log.
 * Extracts the most useful argument / result fields so the user can see what
 * the agent is actually doing (e.g. which file was written, which command ran).
 */
function extractSummary(
  toolName: string,
  args: Record<string, unknown>,
  result: {
    success: boolean;
    error?: string;
    data?: unknown;
  },
): string {
  if (!result.success && result.error) {
    return `❌ ${result.error.slice(0, 160)}`;
  }

  switch (toolName) {
    case 'write_file': {
      const p = typeof args.path === 'string' ? args.path : args.file;
      const len = typeof args.content === 'string' ? args.content.length : 0;
      return `wrote ${p ?? 'file'} (${len} chars)`;
    }
    case 'read_file': {
      const p = typeof args.path === 'string' ? args.path : args.file;
      return `read ${p ?? 'file'}`;
    }
    case 'list_files':
      return `listed ${typeof args.path === 'string' ? args.path : 'directory'}`;
    case 'terminal': {
      const cmd =
        typeof args.command === 'string'
          ? args.command
          : JSON.stringify(args);
      return `$ ${cmd.slice(0, 120)}`;
    }
    case 'git': {
      const action =
        typeof args.action === 'string'
          ? args.action
          : args.subcommand ?? 'git';
      return `git ${action}`;
    }
    case 'create_task': {
      const title = args.title;
      return `delegated "${title}" to ${args.assignedAgentId ?? 'agent'}`;
    }
    case 'send_message':
      return `messaged ${args.recipientAgentId ?? 'agent'}`;
    case 'ask_user':
      return `ask_user: ${String(args.question ?? '').slice(0, 100)}`;
    case 'remember':
      return `remembered "${args.key}"`;
    default:
      return `ok`;
  }
}
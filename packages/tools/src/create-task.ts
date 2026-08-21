import type { ToolDefinition, ToolCall } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

/** Soft cap on tasks a planner may create for one objective. */
export const MAX_DELEGATED_TASKS = 8;

export interface PendingTask {
  title: string;
  description: string;
  assignedAgentId: string;
  parentTaskId?: string;
  /** IDs of tasks that must finish before this one starts. */
  dependsOnTaskIds?: string[];
  priority?: number;
}

/**
 * Create Task tool - allows an agent (e.g. CEO) to create tasks and assign
 * them to other agents. Tasks created through this tool are collected by the
 * orchestrator and executed after the creating agent's loop completes.
 */
export class CreateTaskTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'create_task',
    description: `Create a coarse, high-level task and assign it to another agent. Prefer a SMALL number of tasks (typically 3–6, never more than ${MAX_DELEGATED_TASKS}). Do NOT micro-decompose (e.g. separate tasks for hero, features, footer). One Engineer task should cover the full implementation. Use dependsOnTaskIds so implementation waits on research/design. Returns the created task id.`,
    parameters: [
      {
        name: 'title',
        type: 'string',
        description: 'A short title for the task',
        required: true,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Detailed instructions for the assigned agent',
        required: true,
      },
      {
        name: 'assignedAgentId',
        type: 'string',
        description: 'The ID of the agent to assign this task to',
        required: true,
      },
      {
        name: 'dependsOnTaskIds',
        type: 'array',
        description:
          'Optional list of task IDs that must complete before this task starts (e.g. Engineer depends on Researcher + Designer task IDs)',
        required: false,
      },
      {
        name: 'parentTaskId',
        type: 'string',
        description: 'Optional ID of the parent task',
        required: false,
      },
      {
        name: 'priority',
        type: 'number',
        description: 'Task priority (1 = highest)',
        required: false,
      },
    ],
  };

  private taskHandler?: (task: PendingTask) => Promise<string>;
  private createdCount = 0;
  private readonly maxTasks: number;

  constructor(
    handler?: (task: PendingTask) => Promise<string>,
    options?: { maxTasks?: number },
  ) {
    this.taskHandler = handler;
    this.maxTasks = options?.maxTasks ?? MAX_DELEGATED_TASKS;
  }

  setTaskHandler(handler: (task: PendingTask) => Promise<string>): void {
    this.taskHandler = handler;
  }

  /** Reset the per-run creation counter (call at the start of each objective). */
  resetCount(): void {
    this.createdCount = 0;
  }

  async execute(
    call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const args = call.arguments as Record<string, unknown>;
    const title = typeof args.title === 'string' ? args.title : undefined;
    const assignedAgentId =
      typeof args.assignedAgentId === 'string' ? args.assignedAgentId : undefined;
    const description =
      typeof args.description === 'string' ? args.description : '';
    const parentTaskId =
      typeof args.parentTaskId === 'string' ? args.parentTaskId : undefined;
    const priority = typeof args.priority === 'number' ? args.priority : undefined;

    if (!title || !assignedAgentId) {
      return {
        success: false,
        error: 'title and assignedAgentId are required',
      };
    }

    if (this.createdCount >= this.maxTasks) {
      return {
        success: false,
        error: `Task limit reached (${this.maxTasks}). Do not create more tasks — consolidate remaining work into the tasks you already created, then report your plan.`,
      };
    }

    if (!this.taskHandler) {
      return {
        success: false,
        error: 'Task handler is not configured. No executor available.',
      };
    }

    let dependsOnTaskIds: string[] | undefined;
    const rawDepends = args.dependsOnTaskIds;
    if (Array.isArray(rawDepends)) {
      dependsOnTaskIds = rawDepends.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      );
    } else if (typeof rawDepends === 'string' && rawDepends.trim()) {
      try {
        const parsed = JSON.parse(rawDepends) as unknown;
        if (Array.isArray(parsed)) {
          dependsOnTaskIds = parsed.filter(
            (id): id is string => typeof id === 'string',
          );
        }
      } catch {
        dependsOnTaskIds = [rawDepends.trim()];
      }
    }

    try {
      const taskId = await this.taskHandler({
        title,
        description,
        assignedAgentId,
        parentTaskId,
        dependsOnTaskIds,
        priority,
      });
      this.createdCount += 1;
      const remaining = this.maxTasks - this.createdCount;
      return {
        success: true,
        data: {
          taskId,
          message: `Task created and assigned. You may create ${remaining} more task(s).`,
          tasksRemaining: remaining,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  }
}

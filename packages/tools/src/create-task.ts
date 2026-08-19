import type { ToolDefinition, ToolCall } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

export interface PendingTask {
  title: string;
  description: string;
  assignedAgentId: string;
  parentTaskId?: string;
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
    description: `Create a new task and assign it to another agent. Use this to delegate work to team members. Returns the created task id.`,
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

  constructor(handler?: (task: PendingTask) => Promise<string>) {
    this.taskHandler = handler;
  }

  setTaskHandler(handler: (task: PendingTask) => Promise<string>): void {
    this.taskHandler = handler;
  }

  async execute(
    call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const args = call.arguments as unknown as Partial<PendingTask>;

    if (!args.title || !args.assignedAgentId) {
      return {
        success: false,
        error: 'title and assignedAgentId are required',
      };
    }

    if (!this.taskHandler) {
      return {
        success: false,
        error: 'Task handler is not configured. No executor available.',
      };
    }

    try {
      const taskId = await this.taskHandler({
        title: args.title,
        description: args.description ?? '',
        assignedAgentId: args.assignedAgentId,
        parentTaskId: args.parentTaskId,
        priority: args.priority,
      });
      return {
        success: true,
        data: { taskId, message: `Task created and assigned.` },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  }
}
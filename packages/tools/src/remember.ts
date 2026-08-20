import type { ToolDefinition, ToolCall, MemoryType } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

/**
 * Remember tool - allows an agent to store a memory/learning that persists
 * across runs. This is how agents "learn" over time: they record key insights,
 * decisions, and lessons so future runs can benefit from them.
 */
export class RememberTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'remember',
    description: `Store a memory entry so you and other agents can learn from it in future runs. Use this to record key insights, decisions, lessons learned, project conventions, or important facts about the company, a project, a task, or an agent. These memories are loaded into context on future runs.`,
    parameters: [
      {
        name: 'key',
        type: 'string',
        description: 'A short, descriptive key for the memory (e.g. "design-system", "client-preference", "build-command")',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'The memory content. Be specific and durable — this will be reused in future runs.',
        required: true,
      },
      {
        name: 'type',
        type: 'string',
        description: 'The memory type: company, project, task, agent, or decision',
        required: false,
        enum: ['company', 'project', 'task', 'agent', 'decision'],
      },
      {
        name: 'tags',
        type: 'array',
        description: 'Optional tags to help retrieve this memory later',
        required: false,
      },
    ],
  };

  private memoryHandler?: (entry: {
    key: string;
    content: string;
    type: MemoryType;
    tags: string[];
  }) => Promise<void>;

  constructor(handler?: (entry: {
    key: string;
    content: string;
    type: MemoryType;
    tags: string[];
  }) => Promise<void>) {
    this.memoryHandler = handler;
  }

  setMemoryHandler(handler: (entry: {
    key: string;
    content: string;
    type: MemoryType;
    tags: string[];
  }) => Promise<void>): void {
    this.memoryHandler = handler;
  }

  async execute(
    call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const key = String(call.arguments.key ?? '');
    const content = String(call.arguments.content ?? '');
    const type = (call.arguments.type as MemoryType) ?? 'company';
    const tags = Array.isArray(call.arguments.tags)
      ? call.arguments.tags.map(String)
      : [];

    if (!key.trim() || !content.trim()) {
      return { success: false, error: 'key and content are required' };
    }

    if (!this.memoryHandler) {
      return { success: false, error: 'No memory handler configured' };
    }

    try {
      await this.memoryHandler({
        key: key.trim(),
        content: content.trim(),
        type,
        tags,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store memory',
      };
    }

    return {
      success: true,
      data: {
        stored: true,
        key: key.trim(),
        message: `Memory "${key}" stored. It will be available in future runs.`,
      },
    };
  }
}
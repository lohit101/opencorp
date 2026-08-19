import type { ToolDefinition } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';
import type { ToolCall } from '@opencorp/shared';
import type { DockerSandbox } from './sandbox.js';

/**
 * Filesystem tool group - allows agents to read, write, and list files in the
 * workspace. All operations go through the Docker sandbox so the host filesystem
 * is never exposed directly. Paths are validated to prevent escaping the workspace.
 */
export class ReadFileTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file, relative to workspace root',
        required: true,
      },
    ],
  };

  private readonly sandbox: DockerSandbox;

  constructor(sandbox: DockerSandbox) {
    this.sandbox = sandbox;
  }

  async execute(
    call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const filePath = String(call.arguments.path ?? '');

    try {
      const content = await this.sandbox.readFile(filePath);
      return { success: true, data: { content, path: filePath } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  }
}

/**
 * Write file tool.
 */
export class WriteFileTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'write_file',
    description: 'Write content to a file in the workspace. Creates parent directories if needed.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file, relative to workspace root',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'The content to write to the file',
        required: true,
      },
    ],
  };

  private readonly sandbox: DockerSandbox;

  constructor(sandbox: DockerSandbox) {
    this.sandbox = sandbox;
  }

  async execute(
    call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const filePath = String(call.arguments.path ?? '');
    const content = String(call.arguments.content ?? '');

    try {
      await this.sandbox.writeFile(filePath, content);
      return { success: true, data: { path: filePath, size: content.length } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file',
      };
    }
  }
}

/**
 * List files tool.
 */
export class ListFilesTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'list_files',
    description: 'List files and directories in the workspace.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to list, relative to workspace root (default: root)',
        required: false,
      },
    ],
  };

  private readonly sandbox: DockerSandbox;

  constructor(sandbox: DockerSandbox) {
    this.sandbox = sandbox;
  }

  async execute(
    call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const filePath = call.arguments.path ? String(call.arguments.path) : '';

    try {
      const files = await this.sandbox.listFiles(filePath);
      return { success: true, data: { files, path: filePath || '/' } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      };
    }
  }
}
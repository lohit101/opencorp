import type { ToolDefinition } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';
import type { ToolCall } from '@opencorp/shared';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Filesystem tool - allows agents to read, write, and list files in the workspace.
 * All paths are validated to prevent escaping the workspace directory.
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

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const filePath = String(call.arguments.path ?? '');
    const resolvedPath = this.resolvePath(filePath, context.workspacePath);

    if (!resolvedPath) {
      return { success: false, error: 'Invalid or forbidden path' };
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      return { success: true, data: { content, path: filePath } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  }

  private resolvePath(filePath: string, workspacePath: string): string | null {
    const resolved = path.resolve(workspacePath, filePath);
    // Prevent directory traversal outside workspace
    if (!resolved.startsWith(workspacePath)) {
      return null;
    }
    return resolved;
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

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const filePath = String(call.arguments.path ?? '');
    const content = String(call.arguments.content ?? '');
    const resolvedPath = this.resolvePath(filePath, context.workspacePath);

    if (!resolvedPath) {
      return { success: false, error: 'Invalid or forbidden path' };
    }

    try {
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, content, 'utf-8');
      return { success: true, data: { path: filePath, size: content.length } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file',
      };
    }
  }

  private resolvePath(filePath: string, workspacePath: string): string | null {
    const resolved = path.resolve(workspacePath, filePath);
    if (!resolved.startsWith(workspacePath)) {
      return null;
    }
    return resolved;
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

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const filePath = call.arguments.path ? String(call.arguments.path) : '';
    const resolvedPath = filePath
      ? this.resolvePath(filePath, context.workspacePath)
      : context.workspacePath;

    if (!resolvedPath) {
      return { success: false, error: 'Invalid or forbidden path' };
    }

    try {
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      const files = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: filePath ? `${filePath}/${entry.name}` : entry.name,
      }));
      return { success: true, data: { files, path: filePath || '/' } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      };
    }
  }

  private resolvePath(filePath: string, workspacePath: string): string | null {
    const resolved = path.resolve(workspacePath, filePath);
    if (!resolved.startsWith(workspacePath)) {
      return null;
    }
    return resolved;
  }
}
import type { ToolDefinition } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';
import type { ToolCall } from '@opencorp/shared';

/**
 * Terminal tool - allows agents to execute shell commands inside their workspace.
 * Commands run inside the Docker sandbox, not on the host.
 */
export class TerminalTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'terminal',
    description: 'Execute a shell command in the workspace. Use this to run build commands, install dependencies, run tests, etc.',
    parameters: [
      {
        name: 'command',
        type: 'string',
        description: 'The shell command to execute',
        required: true,
      },
      {
        name: 'workdir',
        type: 'string',
        description: 'Working directory relative to workspace root',
        required: false,
      },
    ],
  };

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const command = String(call.arguments.command ?? '');
    const workdir = call.arguments.workdir
      ? String(call.arguments.workdir)
      : undefined;

    if (!command.trim()) {
      return { success: false, error: 'Command is required' };
    }

    try {
      // TODO: Execute inside Docker sandbox
      // For MVP, execute directly (will be sandboxed later)
      const result = await this.runCommand(command, context.workspacePath, workdir);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
      };
    }
  }

  private async runCommand(
    _command: string,
    _workspacePath: string,
    _workdir?: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Placeholder: will be replaced with Docker execution
    // For now, return a message indicating Docker sandbox is needed
    return {
      stdout: '',
      stderr: 'Terminal execution requires Docker sandbox (not yet implemented)',
      exitCode: 1,
    };
  }
}
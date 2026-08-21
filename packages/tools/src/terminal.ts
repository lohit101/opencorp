import type { ToolDefinition } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';
import type { ToolCall } from '@opencorp/shared';
import { DockerSandbox } from './sandbox.js';

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

  private readonly sandbox: DockerSandbox;

  constructor(config: { image: string; workspaceRoot: string }) {
    this.sandbox = new DockerSandbox(config);
  }

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
      const result = await this.sandbox.exec(command, workdir, context.signal);
      return {
        success: result.exitCode === 0,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
      };
    }
  }
}
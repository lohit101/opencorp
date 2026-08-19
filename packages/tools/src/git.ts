import type { ToolDefinition, ToolCall } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { DockerSandbox } from './sandbox.js';

/**
 * Git tool - allows agents to use git inside the sandboxed workspace.
 * All git commands run inside the Docker container via the sandbox.
 * This keeps git state confined to the workspace and avoids touching the host repo.
 */
export class GitTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'git',
    description:
      'Run a git command inside the workspace (e.g. status, add, commit, log, diff). Use this to track changes and produce deliverables.',
    parameters: [
      {
        name: 'args',
        type: 'string',
        description:
          'The git subcommand and arguments, e.g. "status", "add .", "commit -m \\"message\\"", "log --oneline"',
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
    const args = String(call.arguments.args ?? '');
    if (!args.trim()) {
      return { success: false, error: 'Git args are required' };
    }

    // Block dangerous git subcommands that escape the workspace
    const blocked = ['clone', 'fetch', 'pull', 'remote', 'config'];
    const firstArg = args.trim().split(/\s+/)[0].toLowerCase();
    if (blocked.includes(firstArg)) {
      return {
        success: false,
        error: `git ${firstArg} is not allowed in the sandbox`,
      };
    }

    try {
      const result = await this.sandbox.exec(`git ${args}`);
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
        error: error instanceof Error ? error.message : 'Git command failed',
      };
    }
  }
}
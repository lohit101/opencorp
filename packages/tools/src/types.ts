import type { ToolDefinition, ToolCall } from '@opencorp/shared';

/**
 * Tool is the core abstraction for executable functionality exposed to agents.
 *
 * Each tool has:
 * - A name and description for the LLM to understand when to use it
 * - A parameter schema for the LLM to know what arguments to provide
 * - An execute() method that performs the actual work
 */
export interface Tool {
  /** The tool definition exposed to the LLM */
  readonly definition: ToolDefinition;

  /**
   * Execute the tool with the given arguments.
   *
   * @param call - The tool call containing arguments and metadata
   * @param context - Execution context (workspace, permissions, etc.)
   * @returns The result of execution
   */
  execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface ToolExecutionContext {
  workspacePath: string;
  agentId: string;
  companyId: string;
  signal?: AbortSignal;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
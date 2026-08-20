import type { ToolDefinition, ToolCall } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

export interface AgentRoster {
  agents: {
    id: string;
    name: string;
    role: string;
    department?: string;
    description: string;
    state: string;
  }[];
}

export interface RosterProvider {
  (): Promise<AgentRoster>;
}

/**
 * List Agents tool - lets an agent (typically the CEO) discover the other
 * agents in the company so it can delegate tasks to the right people.
 */
export class ListAgentsTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'list_agents',
    description: `List all agents in your company. Use this to discover team members and their roles so you can delegate tasks to the right people.`,
    parameters: [],
  };

  private rosterProvider?: RosterProvider;

  constructor(provider?: RosterProvider) {
    this.rosterProvider = provider;
  }

  setRosterProvider(provider: RosterProvider): void {
    this.rosterProvider = provider;
  }

  async execute(
    _call: ToolCall,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (!this.rosterProvider) {
      return {
        success: false,
        error: 'Roster provider is not configured.',
      };
    }

    try {
      const roster = await this.rosterProvider();
      return { success: true, data: roster };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list agents',
      };
    }
  }
}
import type { ToolDefinition, ToolCall, AgentMessage } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

/**
 * Provider that returns messages addressed to an agent (or all messages for
 * the company). Implementations typically query the message repository.
 */
export type MessagesProvider = (params: {
  companyId: string;
  agentId: string;
  limit?: number;
}) => Promise<AgentMessage[]>;

/**
 * Get Messages tool - lets an agent read messages sent to it by other agents.
 * This is the read side of agent-to-agent collaboration: agents can check for
 * messages, requests, or updates from teammates.
 */
export class GetMessagesTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'get_messages',
    description: `Retrieve messages sent to you by other agents. Use this to check for requests, updates, or collaboration from your teammates. Returns the most recent messages addressed to you.`,
    parameters: [
      {
        name: 'limit',
        type: 'number',
        description: 'Optional maximum number of messages to return (default 20)',
        required: false,
      },
    ],
  };

  private messagesProvider?: MessagesProvider;

  constructor(provider?: MessagesProvider) {
    this.messagesProvider = provider;
  }

  setMessagesProvider(provider: MessagesProvider): void {
    this.messagesProvider = provider;
  }

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (!this.messagesProvider) {
      return { success: false, error: 'Messages provider is not configured' };
    }

    const limit = call.arguments.limit ? Number(call.arguments.limit) : 20;

    try {
      const messages = await this.messagesProvider({
        companyId: context.companyId,
        agentId: context.agentId,
        limit,
      });
      return { success: true, data: { messages } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load messages',
      };
    }
  }
}
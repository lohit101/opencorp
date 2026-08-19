import type { ToolDefinition, ToolCall, AgentMessage } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

/**
 * Send message tool - allows agents to send messages to other agents.
 */
export class SendMessageTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'send_message',
    description: 'Send a message to another agent in the company.',
    parameters: [
      {
        name: 'recipientAgentId',
        type: 'string',
        description: 'The ID of the agent to send the message to',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'The message content',
        required: true,
      },
      {
        name: 'taskId',
        type: 'string',
        description: 'Optional task ID this message relates to',
        required: false,
      },
    ],
  };

  private messageHandler?: (message: AgentMessage) => Promise<void>;

  constructor(handler?: (message: AgentMessage) => Promise<void>) {
    this.messageHandler = handler;
  }

  setMessageHandler(handler: (message: AgentMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const recipientAgentId = String(call.arguments.recipientAgentId ?? '');
    const content = String(call.arguments.content ?? '');
    const taskId = call.arguments.taskId ? String(call.arguments.taskId) : null;

    if (!recipientAgentId) {
      return { success: false, error: 'Recipient agent ID is required' };
    }

    if (!content.trim()) {
      return { success: false, error: 'Message content is required' };
    }

    const message: AgentMessage = {
      id: crypto.randomUUID(),
      companyId: context.companyId,
      senderAgentId: context.agentId,
      recipientAgentId,
      taskId,
      content,
      timestamp: new Date().toISOString(),
    };

    if (this.messageHandler) {
      try {
        await this.messageHandler(message);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to deliver message',
        };
      }
    }

    return {
      success: true,
      data: { messageId: message.id, delivered: true },
    };
  }
}
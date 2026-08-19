import { prisma } from '../client.js';
import type { AgentMessage } from '@opencorp/shared';

/**
 * MessageRepository handles persistence for agent-to-agent messages.
 */
export class MessageRepository {
  async create(data: {
    companyId: string;
    senderAgentId: string;
    recipientAgentId?: string;
    taskId?: string;
    content: string;
  }): Promise<AgentMessage> {
    const message = await prisma.message.create({
      data: {
        companyId: data.companyId,
        senderAgentId: data.senderAgentId,
        recipientAgentId: data.recipientAgentId ?? null,
        taskId: data.taskId ?? null,
        content: data.content,
      },
    });

    return this.toDomain(message);
  }

  async findByCompany(companyId: string): Promise<AgentMessage[]> {
    const messages = await prisma.message.findMany({
      where: { companyId },
      orderBy: { timestamp: 'asc' },
    });
    return messages.map((m) => this.toDomain(m));
  }

  async findByAgent(agentId: string): Promise<AgentMessage[]> {
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderAgentId: agentId }, { recipientAgentId: agentId }],
      },
      orderBy: { timestamp: 'asc' },
    });
    return messages.map((m) => this.toDomain(m));
  }

  private toDomain(
    message: {
      id: string;
      companyId: string;
      senderAgentId: string;
      recipientAgentId: string | null;
      taskId: string | null;
      content: string;
      timestamp: Date;
    },
  ): AgentMessage {
    return {
      id: message.id,
      companyId: message.companyId,
      senderAgentId: message.senderAgentId,
      recipientAgentId: message.recipientAgentId,
      taskId: message.taskId,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
    };
  }
}
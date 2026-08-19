import { prisma } from '../client.js';
import type { SystemEvent, EventType } from '@opencorp/shared';

/**
 * EventStore handles persistence and retrieval of system events.
 */
export class EventStore {
  async create(data: {
    companyId: string;
    type: EventType;
    agentId?: string;
    taskId?: string;
    eventData: Record<string, unknown>;
  }): Promise<SystemEvent> {
    const event = await prisma.systemEvent.create({
      data: {
        companyId: data.companyId,
        type: data.type,
        agentId: data.agentId ?? null,
        taskId: data.taskId ?? null,
        data: JSON.stringify(data.eventData),
      },
    });

    return this.toDomain(event);
  }

  async findByCompany(companyId: string, limit = 100): Promise<SystemEvent[]> {
    const events = await prisma.systemEvent.findMany({
      where: { companyId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return events.map((e) => this.toDomain(e));
  }

  async findByAgent(agentId: string, limit = 100): Promise<SystemEvent[]> {
    const events = await prisma.systemEvent.findMany({
      where: { agentId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return events.map((e) => this.toDomain(e));
  }

  private toDomain(
    event: {
      id: string;
      companyId: string;
      type: string;
      agentId: string | null;
      taskId: string | null;
      data: string;
      timestamp: Date;
    },
  ): SystemEvent {
    return {
      id: event.id,
      companyId: event.companyId,
      type: event.type as EventType,
      agentId: event.agentId ?? undefined,
      taskId: event.taskId ?? undefined,
      data: JSON.parse(event.data) as Record<string, unknown>,
      timestamp: event.timestamp.toISOString(),
    };
  }
}
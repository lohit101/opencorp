import { prisma } from '../client.js';
import type { Task, TaskStatus } from '@opencorp/shared';

/**
 * TaskRepository handles persistence for Task entities.
 */
export class TaskRepository {
  async create(data: {
    companyId: string;
    title: string;
    description: string;
    assignedAgentId?: string;
    parentTaskId?: string;
    priority?: number;
  }): Promise<Task> {
    const task = await prisma.task.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        assignedAgentId: data.assignedAgentId ?? null,
        parentTaskId: data.parentTaskId ?? null,
        priority: data.priority ?? 1,
        status: 'pending',
      },
    });

    return this.toDomain(task);
  }

  async findById(id: string): Promise<Task | null> {
    const task = await prisma.task.findUnique({ where: { id } });
    return task ? this.toDomain(task) : null;
  }

  async findByCompany(companyId: string): Promise<Task[]> {
    const tasks = await prisma.task.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map((t) => this.toDomain(t));
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await prisma.task.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'completed' ? new Date() : undefined,
      },
    });
    return this.toDomain(task);
  }

  async updateResult(id: string, result: string): Promise<Task> {
    const task = await prisma.task.update({
      where: { id },
      data: { result },
    });
    return this.toDomain(task);
  }

  async updateError(id: string, error: string): Promise<Task> {
    const task = await prisma.task.update({
      where: { id },
      data: { error },
    });
    return this.toDomain(task);
  }

  async assign(id: string, agentId: string): Promise<Task> {
    const task = await prisma.task.update({
      where: { id },
      data: { assignedAgentId: agentId, status: 'assigned' },
    });
    return this.toDomain(task);
  }

  private toDomain(
    task: {
      id: string;
      companyId: string;
      title: string;
      description: string;
      status: string;
      assignedAgentId: string | null;
      parentTaskId: string | null;
      priority: number;
      result: string | null;
      error: string | null;
      createdAt: Date;
      updatedAt: Date;
      completedAt: Date | null;
    },
  ): Task {
    return {
      id: task.id,
      companyId: task.companyId,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatus,
      assignedAgentId: task.assignedAgentId,
      parentTaskId: task.parentTaskId,
      priority: task.priority,
      result: task.result ?? undefined,
      error: task.error ?? undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    };
  }
}
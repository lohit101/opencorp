import { prisma } from '../client.js';
import type { MemoryEntry, MemoryType } from '@opencorp/shared';
import type { MemoryStore, MemorySearchParams } from '@opencorp/memory';

/**
 * PrismaMemoryStore implements MemoryStore using SQLite via Prisma.
 */
export class PrismaMemoryStore implements MemoryStore {
  async store(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MemoryEntry> {
    const memory = await prisma.memory.create({
      data: {
        companyId: entry.companyId,
        type: entry.type,
        key: entry.key,
        content: entry.content,
        tags: JSON.stringify(entry.tags),
        sourceAgentId: entry.sourceAgentId ?? null,
      },
    });

    return this.toDomain(memory);
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const memory = await prisma.memory.findUnique({ where: { id } });
    return memory ? this.toDomain(memory) : null;
  }

  async search(params: MemorySearchParams): Promise<MemoryEntry[]> {
    const memories = await prisma.memory.findMany({
      where: {
        companyId: params.companyId,
        ...(params.type ? { type: params.type } : {}),
        ...(params.key ? { key: { contains: params.key } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
    });

    let results = memories.map((m) => this.toDomain(m));

    // Filter by tags in memory (tags stored as JSON)
    if (params.tags && params.tags.length > 0) {
      results = results.filter((entry) =>
        params.tags!.some((tag) => entry.tags.includes(tag)),
      );
    }

    return results;
  }

  async update(
    id: string,
    updates: Partial<MemoryEntry>,
  ): Promise<MemoryEntry> {
    const memory = await prisma.memory.update({
      where: { id },
      data: {
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.key !== undefined ? { key: updates.key } : {}),
        ...(updates.type !== undefined ? { type: updates.type } : {}),
        ...(updates.tags !== undefined
          ? { tags: JSON.stringify(updates.tags) }
          : {}),
      },
    });

    return this.toDomain(memory);
  }

  async delete(id: string): Promise<void> {
    await prisma.memory.delete({ where: { id } });
  }

  private toDomain(
    memory: {
      id: string;
      companyId: string;
      type: string;
      key: string;
      content: string;
      tags: string;
      sourceAgentId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): MemoryEntry {
    return {
      id: memory.id,
      companyId: memory.companyId,
      type: memory.type as MemoryType,
      key: memory.key,
      content: memory.content,
      tags: JSON.parse(memory.tags) as string[],
      sourceAgentId: memory.sourceAgentId ?? undefined,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    };
  }
}
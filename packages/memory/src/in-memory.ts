import type { MemoryEntry } from '@opencorp/shared';
import type { MemoryStore, MemorySearchParams } from './types.js';

/**
 * In-memory implementation of MemoryStore for development/testing.
 * Will be replaced with Prisma/SQLite implementation.
 */
export class InMemoryMemoryStore implements MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();

  async store(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const newEntry: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(newEntry.id, newEntry);
    return newEntry;
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async search(params: MemorySearchParams): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values());

    results = results.filter((e) => e.companyId === params.companyId);

    if (params.type) {
      results = results.filter((e) => e.type === params.type);
    }

    if (params.tags && params.tags.length > 0) {
      results = results.filter((e) =>
        params.tags!.some((tag) => e.tags.includes(tag)),
      );
    }

    if (params.key) {
      results = results.filter((e) => e.key.includes(params.key!));
    }

    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    if (params.offset) {
      results = results.slice(params.offset);
    }
    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  async update(
    id: string,
    updates: Partial<MemoryEntry>,
  ): Promise<MemoryEntry> {
    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Memory entry not found: ${id}`);
    }
    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }
}
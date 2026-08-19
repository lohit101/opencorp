import type { MemoryEntry, MemoryType } from '@opencorp/shared';

/**
 * MemoryStore is the abstraction for persisting and retrieving agent/company memory.
 *
 * For the MVP, this uses SQLite via Prisma.
 * The interface is kept generic to allow alternative backends later.
 */
export interface MemoryStore {
  /**
   * Store a new memory entry.
   */
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>;

  /**
   * Retrieve a memory entry by ID.
   */
  getById(id: string): Promise<MemoryEntry | null>;

  /**
   * Search memory entries by company, type, and/or tags.
   */
  search(params: MemorySearchParams): Promise<MemoryEntry[]>;

  /**
   * Update an existing memory entry.
   */
  update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry>;

  /**
   * Delete a memory entry.
   */
  delete(id: string): Promise<void>;
}

export interface MemorySearchParams {
  companyId: string;
  type?: MemoryType;
  tags?: string[];
  key?: string;
  limit?: number;
  offset?: number;
}
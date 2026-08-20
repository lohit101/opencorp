import { NextResponse } from 'next/server';
import { CompanyRepository, AgentRepository, TaskRepository, EventStore, MessageRepository } from '@opencorp/db';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const companyRepo = new CompanyRepository();
const agentRepo = new AgentRepository();
const taskRepo = new TaskRepository();
const eventStore = new EventStore();
const messageRepo = new MessageRepository();

// GET /api/companies/[companyId] - get a single company with its full state
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const company = await companyRepo.findById(companyId);
    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 },
      );
    }

    const [agents, tasks, events, messages, files] = await Promise.all([
      agentRepo.findByCompany(companyId),
      taskRepo.findByCompany(companyId),
      eventStore.findByCompany(companyId, 300),
      messageRepo.findByCompany(companyId),
      listWorkspaceFiles(companyId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        company,
        agents,
        tasks,
        events,
        messages,
        files,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load company' },
      { status: 500 },
    );
  }
}

/**
 * List the top-level entries of a company's workspace directory (non-recursive).
 * Returns only the items directly in the project root so the UI shows a compact
 * list; dirs can be expanded by navigating the workspace route.
 */
async function listWorkspaceFiles(companyId: string): Promise<
  { path: string; name: string; type: 'file' | 'directory' }[]
> {
  const workspaceRoot = path.join(process.cwd(), '..', '..', '.workspaces', companyId);
  const results: { path: string; name: string; type: 'file' | 'directory' }[] = [];

  let entries;
  try {
    entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  } catch {
    return results; // directory doesn't exist yet
  }

  for (const entry of entries) {
    if (entry.name === '.git') continue;
    results.push({
      path: entry.name,
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    });
  }

  // Sort: directories first, then files, each alphabetically.
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}
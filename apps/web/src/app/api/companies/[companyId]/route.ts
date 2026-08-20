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
 * Recursively list non-git files in a company's workspace directory.
 * Returns simple metadata for the UI (path, name, type).
 */
async function listWorkspaceFiles(companyId: string): Promise<
  { path: string; name: string; type: 'file' | 'directory' }[]
> {
  const workspaceRoot = path.join(process.cwd(), '..', '..', '.workspaces', companyId);
  const results: { path: string; name: string; type: 'file' | 'directory' }[] = [];

  async function walk(dir: string, relBase: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist yet
    }

    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push({ path: rel, name: entry.name, type: 'directory' });
        await walk(path.join(dir, entry.name), rel);
      } else {
        results.push({ path: rel, name: entry.name, type: 'file' });
      }
    }
  }

  await walk(workspaceRoot, '');
  return results;
}
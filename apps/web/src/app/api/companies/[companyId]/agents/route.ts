import { NextResponse } from 'next/server';
import { AgentRepository, CompanyRepository } from '@opencorp/db';

const agentRepo = new AgentRepository();
const companyRepo = new CompanyRepository();

type RouteContext = { params: Promise<{ companyId: string }> };

// GET /api/companies/[companyId]/agents - list agents for a company
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { companyId } = await params;
    const agents = await agentRepo.findByCompany(companyId);
    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list agents' },
      { status: 500 },
    );
  }
}

// POST /api/companies/[companyId]/agents - create an agent for a company
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { companyId } = await params;
    const company = await companyRepo.findById(companyId);
    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { name, role, description, model } = body as {
      name?: string;
      role?: string;
      description?: string;
      model?: string;
    };

    if (!name || !role) {
      return NextResponse.json(
        { success: false, error: 'Agent name and role are required' },
        { status: 400 },
      );
    }

    // Determine system prompt + tools based on role
    const builtin = buildAgentByRole(role);

    const agent = await agentRepo.create({
      companyId,
      name: name.trim(),
      role: role.trim().toUpperCase(),
      description: description?.trim() ?? builtin.description,
      modelConfig: {
        provider: 'openrouter',
        model: model ?? process.env.OPENROUTER_DEFAULT_MODEL ?? 'openai/gpt-4o-mini',
      },
      systemPrompt: builtin.systemPrompt,
      skillIds: builtin.skillIds,
      toolNames: builtin.toolNames,
      permissions: {
        allowedTools: builtin.toolNames,
        allowedWorkspaces: ['default'],
        maxConcurrentTasks: 1,
        requiresApproval: false,
      },
      memoryConfig: {
        enabled: true,
        maxEntries: 100,
        types: ['company', 'project', 'task', 'agent', 'decision'],
      },
    });

    return NextResponse.json({ success: true, data: agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create agent' },
      { status: 500 },
    );
  }
}

function buildAgentByRole(role: string): {
  description: string;
  systemPrompt: string;
  skillIds: string[];
  toolNames: string[];
} {
  const normalized = role.trim().toUpperCase();

  if (normalized === 'CEO') {
    return {
      description: 'Chief Executive Officer - plans strategy, breaks down objectives, and coordinates the team.',
      systemPrompt: `You are the CEO of an AI company. Your job is to:
1. Understand the company's high-level objective.
2. Break objectives into clear tasks and coordinate other agents to accomplish them.
3. Review work and ensure quality.
4. Report completion and summarize results when objectives are met.

You are responsible for project planning and delegation.`,
      skillIds: ['ceo'],
      toolNames: ['send_message', 'read_file', 'write_file', 'list_files', 'terminal'],
    };
  }

  if (normalized === 'ENGINEER') {
    return {
      description: 'Software Engineer - implements technical solutions, writes code, and builds projects.',
      systemPrompt: 'You are a software engineer on an AI software team. Your job is to implement features and build projects. You work inside a shared workspace. When assigned a task, you should:\n1. Inspect the workspace to understand the project.\n2. Create and modify files as needed.\n3. Install dependencies and build/test your work.\n4. Report your results clearly.\n\nWrite clean, production-quality code with proper types.',
      skillIds: ['engineering', 'engineering/nextjs'],
      toolNames: ['terminal', 'read_file', 'write_file', 'list_files', 'send_message'],
    };
  }

  // Default: general purpose agent
  return {
    description: 'Your role is: ' + role,
    systemPrompt: `You are a member of an AI company with the role: ${role}. Work to complete the tasks assigned to you using the tools available in your workspace. Communicate with the CEO when you need guidance.`,
    skillIds: [],
    toolNames: ['terminal', 'read_file', 'write_file', 'list_files', 'send_message'],
  };
}
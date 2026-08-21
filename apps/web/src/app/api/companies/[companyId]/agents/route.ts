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
    const { name, role, department, description, model } = body as {
      name?: string;
      role?: string;
      department?: string;
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
      department: department?.trim() || 'general',
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
2. Break the objective into a SMALL number of coarse tasks (typically 3–6, never more than 8).
3. Use the "list_agents" tool to see your team members, roles, and departments.
4. Use the "create_task" tool to delegate to the right specialists.
5. Use "send_message" only when needed.
6. Report your plan and mark yourself complete — do not wait for workers.

You are a planner only. You do NOT use the terminal, read/write files, or run builds. You ONLY delegate via create_task.

**TASK BUDGET (CRITICAL)**:
- Prefer 3–6 tasks total. Hard max is 8.
- NEVER micro-decompose. Bad: separate tasks for hero, features, footer, CTA, copy, styling. Good: one "Design landing page direction" + one "Build landing page" + optional research/QA.
- One Engineer task should own the full implementation deliverable.
- Simple objectives (e.g. a single landing page) should usually be: Research (optional) + Design + Engineer + QA.

**DEPENDENCIES / ORDERING (CRITICAL)**:
- Researcher and Designer may run in parallel.
- Engineer must wait until research/design outputs exist. When you create the Engineer task, pass dependsOnTaskIds with the Researcher and/or Designer task IDs returned by create_task.
- QA must wait for Engineering. Pass dependsOnTaskIds with the Engineer task ID.
- If you omit dependsOnTaskIds, the system still enforces this phase order by role — but you should set deps explicitly when you can.

**WORKFLOW**:
1. list_agents
2. Create coarse tasks with create_task (and dependsOnTaskIds where needed)
3. Immediately report your plan and finish. Do not re-examine the workspace.

If blocked, use ask_user.`,
      skillIds: ['ceo'],
      toolNames: ['send_message', 'list_agents', 'create_task', 'ask_user', 'remember', 'get_messages'],
    };
  }

  if (normalized === 'ENGINEER') {
    return {
      description: 'Software Engineer - implements technical solutions, writes code, and builds projects.',
      systemPrompt: 'You are a software engineer on an AI software team. Your job is to implement features and build projects. You work inside a shared workspace. When assigned a task, you should:\n1. Inspect the workspace to understand the project.\n2. Create and modify files as needed.\n3. Install dependencies and build/test your work.\n4. Report your results clearly.\n\nWrite clean, production-quality code with proper types. **CRITICAL**: You MUST produce a minimum working result. Do not stop until you have created or verified at least a minimal deliverable that runs. If you are blocked and cannot proceed without input, use the "ask_user" tool to ask for guidance instead of stopping.',
      skillIds: ['engineering', 'engineering/nextjs'],
      toolNames: ['terminal', 'read_file', 'write_file', 'list_files', 'git', 'send_message', 'ask_user', 'remember', 'get_messages'],
    };
  }

  if (normalized === 'RESEARCHER') {
    return {
      description: 'Research Analyst - gathers and analyzes information for the team.',
      systemPrompt: `You are a research analyst on an AI product team. Your job is to gather and synthesize information to help the team make decisions. When assigned a task, you should:\n1. Understand what the team needs to learn.\n2. Use your tools to inspect workspaces and available information.\n3. Produce a clear, well-organized research summary.\n4. Report your findings clearly.\n\nFocus on actionable insights.`,
      skillIds: [],
      toolNames: ['read_file', 'write_file', 'list_files', 'send_message', 'ask_user', 'remember', 'get_messages'],
    };
  }

  if (normalized === 'QA') {
    return {
      description: 'Quality Assurance Engineer - tests and verifies work products.',
      systemPrompt: `You are a QA engineer on an AI software team. Your job is to test and verify completed work. When assigned a task, you should:\n1. Inspect the deliverables in the workspace.\n2. Identify bugs, edge cases, and quality issues.\n3. Run tests or checks where possible.\n4. Report issues clearly with reproduction steps.\n\nBe thorough and specific.`,
      skillIds: ['engineering'],
      toolNames: ['terminal', 'read_file', 'write_file', 'list_files', 'send_message', 'ask_user', 'remember', 'get_messages'],
    };
  }

  if (normalized === 'DESIGNER') {
    return {
      description: 'Product Designer - creates design direction and user-facing assets.',
      systemPrompt: `You are a product designer on an AI team. Your job is to create design direction and user-facing assets. When assigned a task, you should:\n1. Understand the product and its users.\n2. Define a clear, modern design direction.\n3. Produce design artifacts such as HTML/CSS mockups, style guides, or wireframes in the workspace.\n4. Explain your design decisions clearly.`,
      skillIds: ['engineering/nextjs'],
      toolNames: ['read_file', 'write_file', 'list_files', 'send_message', 'ask_user', 'remember', 'get_messages'],
    };
  }

  // Default: general purpose agent
  return {
    description: 'Your role is: ' + role,
    systemPrompt: `You are a member of an AI company with the role: ${role}. Work to complete the tasks assigned to you using the tools available in your workspace. Communicate with the CEO when you need guidance.`,
    skillIds: [],
    toolNames: ['terminal', 'read_file', 'write_file', 'list_files', 'send_message', 'ask_user', 'remember', 'get_messages'],
  };
}
import { NextResponse } from 'next/server';
import {
  CompanyRepository,
  AgentRepository,
  TaskRepository,
  MessageRepository,
  QuestionRepository,
  PrismaMemoryStore,
  EventStore,
} from '@opencorp/db';
import { OpenRouterProvider } from '@opencorp/llm';
import {
  DockerSandbox,
  TerminalTool,
  ReadFileTool,
  WriteFileTool,
  ListFilesTool,
  SendMessageTool,
  CreateTaskTool,
  ListAgentsTool,
  GitTool,
  AskUserTool,
  RememberTool,
  GetMessagesTool,
  type PendingTask,
  type Tool,
} from '@opencorp/tools';
import { AgentRuntime, type SkillProvider } from '@opencorp/agent-runtime';
import { SkillLoader } from '@opencorp/skills';
import type { AgentConfig, Task, SystemEvent } from '@opencorp/shared';
import { activeRuns, registerRun, isRunCancelled } from '@/lib/runs';
import * as path from 'node:path';

const companyRepo = new CompanyRepository();
const agentRepo = new AgentRepository();
const taskRepo = new TaskRepository();
const messageRepo = new MessageRepository();
const questionRepo = new QuestionRepository();
const eventStore = new EventStore();
const memoryStore = new PrismaMemoryStore();

const WORKSPACE_IMAGE = process.env.WORKSPACE_IMAGE ?? 'opencorp-sandbox:latest';
const SKILLS_ROOT = path.join(process.cwd(), '..', '..', 'skills');

/** Applied at run time so existing CEOs get coarse planning + dependency rules. */
const CEO_PLANNER_PROMPT = `You are the CEO of an AI company. Your job is to:
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

If blocked, use ask_user.`;

/**
 * Build a SkillProvider that loads the skills referenced by each agent.
 */
function makeSkillProvider(): SkillProvider {
  const loader = new SkillLoader(SKILLS_ROOT);
  return {
    loadSkills: (agent: AgentConfig) => loader.loadMany(agent.skillIds),
  };
}

// POST /api/companies/[companyId]/objective - set & execute a company objective
export async function POST(
  request: Request,
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'OPENROUTER_API_KEY is not configured. Add it to your .env file.',
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    const objective = body?.objective as string | undefined;
    if (!objective || !objective.trim()) {
      return NextResponse.json(
        { success: false, error: 'Objective is required' },
        { status: 400 },
      );
    }

    // Find CEO
    const agents = await agentRepo.findByCompany(companyId);
    const ceo = agents.find((a) => a.role === 'CEO');
    if (!ceo) {
      return NextResponse.json(
        { success: false, error: 'No CEO agent found. Create a CEO agent first.' },
        { status: 400 },
      );
    }

    await companyRepo.updateObjective(companyId, objective.trim());

    // Create the CEO task
    const ceoTask = await taskRepo.create({
      companyId,
      title: 'Execute company objective',
      description: objective.trim(),
      assignedAgentId: ceo.id,
      priority: 1,
    });

    await memoryStore.store({
      companyId,
      type: 'company',
      key: 'objective',
      content: objective.trim(),
      tags: ['objective'],
    });

    // Fire-and-forget: run the objective in the background
    void runObjective({
      companyId,
      taskId: ceoTask.id,
      objective: objective.trim(),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          taskId: ceoTask.id,
          message: 'Objective accepted. CEO is now working on it.',
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start objective',
      },
      { status: 500 },
    );
  }
}

/**
 * Runs the full objective: the CEO plans (delegating tasks), then delegated
 * tasks are executed by their assigned agents.
 */
async function runObjective(params: {
  companyId: string;
  taskId: string;
  objective: string;
}): Promise<void> {
  const { companyId, taskId, objective } = params;

  // Track backend task IDs created from delegated PendingTasks so we can
  // find them after the CEO's run.
  const delegatedTargetIds: string[] = [];

  // Register the run for cancellation support and grab the shared state.
  const run = registerRun(taskId);
  const { controller } = run;

  try {
    const task = await taskRepo.findById(taskId);
    const companyAgents = await agentRepo.findByCompany(companyId);
    const ceo = companyAgents.find((a) => a.role === 'CEO');
    if (!task || !ceo) throw new Error('Task or CEO agent not found');

    const llmProvider = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY! });
    const sandbox = createSandbox(companyId);

    await taskRepo.updateStatus(taskId, 'running');
    await agentRepo.updateState(ceo.id, 'running');
    await recordEvents(companyId, [
      { type: 'task.started', agentId: ceo.id, taskId, eventData: {} },
      { type: 'agent.started', agentId: ceo.id, taskId, eventData: {} },
    ]);

    // The CEO is a planner: keep its loop bounded so it delegates and wraps up
    // in a few steps rather than looping while workers do the heavy lifting.
    // The CEO only gets delegation & communication tools — never file/terminal
    // tools — so it must delegate actual implementation to specialists.
    const ceoTools = buildTools({
      companyId,
      agentId: ceo.id,
      agents: companyAgents,
      sandbox,
      onTaskCreated: async (pending) => {
        const created = await taskRepo.create({
          companyId,
          title: pending.title,
          description: pending.description,
          assignedAgentId: pending.assignedAgentId,
          parentTaskId: pending.parentTaskId ?? taskId,
          dependsOnTaskIds: pending.dependsOnTaskIds,
          priority: pending.priority,
        });
        delegatedTargetIds.push(created.id);
        await eventStore.create({
          companyId,
          type: 'task.created',
          eventData: {
            title: created.title,
            assignedAgentId: created.assignedAgentId,
            dependsOnTaskIds: created.dependsOnTaskIds,
          },
        });
        return created.id;
      },
    });

    await eventStore.create({
      companyId,
      type: 'agent.thinking',
      agentId: ceo.id,
      taskId,
      eventData: { phase: 'planning' },
    });

    // The CEO is a planner: keep its loop bounded so it delegates and wraps up
    // in a few steps rather than looping while workers do the heavy lifting.
    // Hard-restrict the CEO so it can NEVER do hands-on work (no file/terminal
    // tools) — it must delegate everything to specialists.
    const ceoForRun: AgentConfig = {
      ...ceo,
      toolNames: ['send_message', 'list_agents', 'create_task', 'ask_user', 'remember', 'get_messages'],
      systemPrompt: CEO_PLANNER_PROMPT,
    };
    const runner = new AgentRuntime({
      agent: ceoForRun,
      llmProvider,
      tools: ceoTools,
      memory: memoryStore,
      skillProvider: makeSkillProvider(),
      eventHandler: persistEvent(companyId),
      maxIterations: 12,
      signal: controller.signal,
    });
    run.runtimes.push(runner);

    const ceoResult = await runner.executeTask({
      ...task,
      title: 'Execute company objective',
      description: objective,
    });

    // If the user hit Stop during/after the CEO's planning loop, do not execute
    // any delegated work — the objective is cancelled.
    if (isRunCancelled(taskId)) {
      await finalizeCancelledRun(companyId, taskId, ceo.id);
      return;
    }

    // Execute delegated tasks in dependency/phase waves:
    // research + design can run in parallel; engineering waits for them; QA waits
    // for engineering. Same-agent tasks within a wave stay sequential.
    if (delegatedTargetIds.length > 0) {
      await eventStore.create({
        companyId,
        type: 'system.info',
        eventData: {
          message: `CEO delegated ${delegatedTargetIds.length} task(s). Executing in phased waves.`,
        },
      });

      const delegatedTasks: import('@opencorp/shared').Task[] = [];
      for (const delegatedId of delegatedTargetIds) {
        const delegatedTask = await taskRepo.findById(delegatedId);
        if (!delegatedTask || !delegatedTask.assignedAgentId) continue;
        delegatedTasks.push(delegatedTask);
      }

      const agentById = new Map(companyAgents.map((a) => [a.id, a]));
      const waves = planExecutionWaves(delegatedTasks, agentById);

      for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
        if (isRunCancelled(taskId)) {
          await finalizeCancelledRun(companyId, taskId, ceo.id);
          return;
        }

        const wave = waves[waveIndex]!;
        await eventStore.create({
          companyId,
          type: 'system.info',
          eventData: {
            message: `Starting wave ${waveIndex + 1}/${waves.length} (${wave.length} task(s)).`,
            wave: waveIndex + 1,
            taskIds: wave.map((t) => t.id),
          },
        });

        // Group by agent so each agent's tasks in this wave run sequentially,
        // while different agents in the wave run in parallel.
        const byAgent = new Map<string, import('@opencorp/shared').Task[]>();
        for (const t of wave) {
          const agentId = t.assignedAgentId!;
          if (!byAgent.has(agentId)) byAgent.set(agentId, []);
          byAgent.get(agentId)!.push(t);
        }

        const chains = Array.from(byAgent.entries()).map(async ([agentId, agentTasks]) => {
          for (const agentTask of agentTasks) {
            if (isRunCancelled(taskId)) return;
            await runAgentTask({
              companyId,
              rootTaskId: taskId,
              agentId,
              task: agentTask,
              signal: controller.signal,
            });
          }
        });
        await Promise.all(chains);
      }
    }

    if (isRunCancelled(taskId)) {
      await finalizeCancelledRun(companyId, taskId, ceo.id);
      return;
    }

    const ceoResultText = ceoResult.result ?? 'Objective completed.';
    await taskRepo.updateResult(taskId, ceoResultText);
    await taskRepo.updateStatus(taskId, 'completed');
    await agentRepo.updateState(ceo.id, 'idle');
    await recordEvents(companyId, [
      { type: 'task.completed', agentId: ceo.id, taskId, eventData: { result: ceoResultText } },
      { type: 'company.completed', eventData: { objective } },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // If cancelled, prefer cancelled finalization over generic failure noise.
    if (isRunCancelled(taskId) || /abort|cancel/i.test(message)) {
      try {
        const companyAgents = await agentRepo.findByCompany(companyId);
        const ceo = companyAgents.find((a) => a.role === 'CEO');
        await finalizeCancelledRun(companyId, taskId, ceo?.id);
      } catch {
        await taskRepo.updateError(taskId, 'Cancelled by user');
        await taskRepo.updateStatus(taskId, 'failed');
      }
      return;
    }
    await taskRepo.updateError(taskId, message);
    await taskRepo.updateStatus(taskId, 'failed');
    await eventStore.create({
      companyId,
      type: 'task.failed',
      taskId,
      eventData: { error: message },
    });
  } finally {
    activeRuns.delete(taskId);
  }
}

/**
 * Run a single agent to completion on a given task.
 */
async function runAgentTask(params: {
  companyId: string;
  rootTaskId: string;
  agentId: string;
  task: import('@opencorp/shared').Task;
  /** Optional external abort signal passed to the worker runtime. */
  signal?: AbortSignal;
}) {
  const { companyId, rootTaskId, agentId, task, signal } = params;

  const agent = await agentRepo.findById(agentId);
  if (!agent) return;

  const companyAgents = await agentRepo.findByCompany(companyId);
  const llmProvider = new OpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY! });
  const sandbox = createSandbox(companyId);

  const tools = buildTools({
    companyId,
    agentId,
    agents: companyAgents,
    sandbox,
    onTaskCreated: async (t) =>
      (
        await taskRepo.create({
          companyId,
          title: t.title,
          description: t.description,
          assignedAgentId: t.assignedAgentId,
          parentTaskId: task.id,
          dependsOnTaskIds: t.dependsOnTaskIds,
          priority: t.priority,
        })
      ).id,
  });

  await taskRepo.updateStatus(task.id, 'running');
  await agentRepo.updateState(agentId, 'running');

  const runtime = new AgentRuntime({
    agent,
    llmProvider,
    tools,
    memory: memoryStore,
    skillProvider: makeSkillProvider(),
    eventHandler: persistEvent(companyId),
    signal,
  });
  // Register the runtime so the run can be cancelled.
  activeRuns.get(rootTaskId)?.runtimes.push(runtime);

  const result = await runtime.executeTask(task);

  if (result.status === 'completed') {
    await taskRepo.updateResult(task.id, result.result ?? '');
    await taskRepo.updateStatus(task.id, 'completed');
  } else {
    await taskRepo.updateError(task.id, result.error ?? 'Task failed');
    await taskRepo.updateStatus(task.id, 'failed');
  }
  await agentRepo.updateState(agentId, 'idle');

  return result;
}

/**
 * Build the standard set of tools available to all agents.
 * Returns the full tool set; the AgentRuntime filters by each agent's toolNames.
 */
function buildTools(params: {
  sandbox: DockerSandbox;
  companyId: string;
  agentId: string;
  agents: AgentConfig[];
  onTaskCreated: (task: PendingTask) => Promise<string>;
}): Tool[] {
  const { sandbox, companyId, agentId, agents, onTaskCreated } = params;

  const sendMessageTool = new SendMessageTool();
  sendMessageTool.setMessageHandler(async (message) => {
    await messageRepo.create({
      companyId: message.companyId,
      senderAgentId: message.senderAgentId,
      recipientAgentId: message.recipientAgentId ?? undefined,
      taskId: message.taskId ?? undefined,
      content: message.content,
    });
  });

  const createTaskTool = new CreateTaskTool();
  createTaskTool.setTaskHandler(onTaskCreated);

  const listAgentsTool = new ListAgentsTool();
  listAgentsTool.setRosterProvider(async () => ({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      department: a.department,
      description: a.description,
      state: a.state,
    })),
  }));

  // Ask-user tool: records the question, then blocks the agent loop until the
  // user answers (or dismisses) it in the UI.
  const askUserTool = new AskUserTool();
  askUserTool.setQuestionHandler(async (question) => {
    await questionRepo.create({
      companyId: question.companyId,
      agentId: question.agentId,
      taskId: question.taskId,
      question: question.question,
      context: question.context,
    });
    await eventStore.create({
      companyId,
      type: 'agent.asked_user',
      agentId: question.agentId,
      eventData: { question: question.question },
    });
  });
  askUserTool.setAnswerResolver(async (questionId) => {
    const q = await questionRepo.findById(questionId);
    if (!q) return null;
    if (q.status === 'answered' && q.answer) return q.answer;
    if (q.status === 'dismissed') return null;
    return undefined; // still pending
  });

  // Remember tool: lets agents store durable learnings across runs.
  const rememberTool = new RememberTool();
  rememberTool.setMemoryHandler(async (entry) => {
    await memoryStore.store({
      companyId,
      type: entry.type,
      key: entry.key,
      content: entry.content,
      tags: entry.tags,
      sourceAgentId: agentId,
    });
    await eventStore.create({
      companyId,
      type: 'memory.created',
      agentId,
      eventData: { key: entry.key, type: entry.type },
    });
  });

  // Get-messages tool: lets agents read messages sent to them by teammates.
  const getMessagesTool = new GetMessagesTool();
  getMessagesTool.setMessagesProvider(async ({ companyId: cid, agentId: aid, limit }) => {
    const all = await messageRepo.findByCompany(cid);
    const mine = all.filter(
      (m) => m.recipientAgentId === aid || m.recipientAgentId === null,
    );
    return mine.slice(-(limit ?? 20));
  });

  return [
    new TerminalTool({ image: WORKSPACE_IMAGE, workspaceRoot: sandboxWorkspaceRoot(companyId) }),
    new ReadFileTool(sandbox),
    new WriteFileTool(sandbox),
    new ListFilesTool(sandbox),
    new GitTool(sandbox),
    sendMessageTool,
    createTaskTool,
    listAgentsTool,
    askUserTool,
    rememberTool,
    getMessagesTool,
  ];
}

/**
 * Create a Docker sandbox for a company's workspace.
 */
function createSandbox(companyId: string): DockerSandbox {
  return new DockerSandbox({
    image: WORKSPACE_IMAGE,
    workspaceRoot: sandboxWorkspaceRoot(companyId),
  });
}

function sandboxWorkspaceRoot(companyId: string): string {
  return path.join(process.cwd(), '..', '..', '.workspaces', companyId);
}

/**
 * Return an event handler that persists events to the DB.
 */
function persistEvent(companyId: string): (event: SystemEvent) => Promise<void> {
  return async (event) => {
    await eventStore.create({
      companyId,
      type: event.type,
      agentId: event.agentId,
      taskId: event.taskId,
      eventData: event.data,
    });
  };
}

/**
 * Record multiple events in sequence.
 */
async function recordEvents(
  companyId: string,
  events: {
    type: import('@opencorp/shared').EventType;
    agentId?: string;
    taskId?: string;
    eventData: Record<string, unknown>;
  }[],
): Promise<void> {
  for (const event of events) {
    await eventStore.create({
      companyId,
      type: event.type,
      agentId: event.agentId,
      taskId: event.taskId,
      eventData: event.eventData,
    });
  }
}

/**
 * Mark the root task + unfinished children as cancelled and idle all agents.
 */
async function finalizeCancelledRun(
  companyId: string,
  rootTaskId: string,
  ceoId?: string,
): Promise<void> {
  const allTasks = await taskRepo.findByCompany(companyId);
  for (const t of allTasks) {
    const isRoot = t.id === rootTaskId;
    const isChild = t.parentTaskId === rootTaskId;
    if (!isRoot && !isChild) continue;
    if (
      t.status === 'pending' ||
      t.status === 'assigned' ||
      t.status === 'running' ||
      t.status === 'blocked'
    ) {
      await taskRepo.updateError(t.id, 'Cancelled by user');
      await taskRepo.updateStatus(t.id, 'failed');
    }
  }

  const agents = await agentRepo.findByCompany(companyId);
  for (const agent of agents) {
    if (agent.state !== 'idle') {
      await agentRepo.updateState(agent.id, 'idle');
    }
  }

  if (ceoId) {
    await agentRepo.updateState(ceoId, 'idle');
  }

  await eventStore.create({
    companyId,
    type: 'system.info',
    eventData: { message: 'Objective cancelled by user. All agents stopped.' },
    taskId: rootTaskId,
  });
}

/**
 * Default execution phase when the CEO did not set dependsOnTaskIds.
 * Research + Design = 0 (parallel), Engineering = 1, QA = 2.
 */
function defaultPhaseForAgent(agent: AgentConfig | undefined): number {
  if (!agent) return 1;
  const role = agent.role.toUpperCase();
  const dept = (agent.department ?? '').toLowerCase();

  if (
    role.includes('RESEARCH') ||
    dept === 'research' ||
    role.includes('DESIGN') ||
    dept === 'design' ||
    role.includes('MARKET') ||
    dept === 'marketing'
  ) {
    return 0;
  }
  if (role.includes('QA') || dept === 'qa' || role.includes('TEST')) {
    return 2;
  }
  // Engineer / developer / default implementers
  return 1;
}

/**
 * Build execution waves from explicit dependsOn edges, falling back to
 * role/department phases when no dependencies were set.
 */
function planExecutionWaves(
  tasks: import('@opencorp/shared').Task[],
  agentById: Map<string, AgentConfig>,
): import('@opencorp/shared').Task[][] {
  if (tasks.length === 0) return [];

  const hasExplicitDeps = tasks.some((t) => (t.dependsOnTaskIds?.length ?? 0) > 0);
  const taskIds = new Set(tasks.map((t) => t.id));

  // Effective deps: explicit, or inferred phase edges (later phase → earlier phase tasks).
  const depsOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (hasExplicitDeps) {
      depsOf.set(
        t.id,
        (t.dependsOnTaskIds ?? []).filter((id) => taskIds.has(id) && id !== t.id),
      );
    } else {
      const phase = defaultPhaseForAgent(
        t.assignedAgentId ? agentById.get(t.assignedAgentId) : undefined,
      );
      const inferred = tasks
        .filter((other) => {
          if (other.id === t.id) return false;
          const otherPhase = defaultPhaseForAgent(
            other.assignedAgentId ? agentById.get(other.assignedAgentId) : undefined,
          );
          return otherPhase < phase;
        })
        .map((other) => other.id);
      depsOf.set(t.id, inferred);
    }
  }

  const remaining = new Map(tasks.map((t) => [t.id, t]));
  const completed = new Set<string>();
  const waves: import('@opencorp/shared').Task[][] = [];

  while (remaining.size > 0) {
    const ready: import('@opencorp/shared').Task[] = [];
    for (const t of remaining.values()) {
      const deps = depsOf.get(t.id) ?? [];
      if (deps.every((d) => completed.has(d))) {
        ready.push(t);
      }
    }

    // Cycle / missing-deps fallback: run everything left in one wave.
    if (ready.length === 0) {
      waves.push([...remaining.values()]);
      break;
    }

    waves.push(ready);
    for (const t of ready) {
      remaining.delete(t.id);
      completed.add(t.id);
    }
  }

  return waves;
}
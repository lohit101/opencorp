import { NextResponse } from 'next/server';
import {
  CompanyRepository,
  AgentRepository,
  TaskRepository,
  MessageRepository,
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
import { activeRuns } from '@/lib/runs';
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

  // Register the run for cancellation support.
  activeRuns.set(taskId, []);

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
          priority: pending.priority,
        });
        delegatedTargetIds.push(created.id);
        await eventStore.create({
          companyId,
          type: 'task.created',
          eventData: { title: created.title, assignedAgentId: created.assignedAgentId },
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
    const runner = new AgentRuntime({
      agent: ceo,
      llmProvider,
      tools: ceoTools,
      memory: memoryStore,
      skillProvider: makeSkillProvider(),
      eventHandler: persistEvent(companyId),
      maxIterations: 12,
    });
    activeRuns.get(taskId)?.push(runner);

    const ceoResult = await runner.executeTask({
      ...task,
      title: 'Execute company objective',
      description: objective,
    });

    // Execute delegated tasks after the CEO's planning loop. Tasks assigned to
    // different agents run in parallel; tasks assigned to the same agent run
    // sequentially to avoid conflicts on the same workspace.
    if (delegatedTargetIds.length > 0) {
      await eventStore.create({
        companyId,
        type: 'system.info',
        eventData: { message: `CEO delegated ${delegatedTargetIds.length} task(s). Executing them now.` },
      });

      // Load all delegated tasks and group by assigned agent.
      const delegatedTasks: { task: import('@opencorp/shared').Task; agentId: string }[] = [];
      for (const delegatedId of delegatedTargetIds) {
        const delegatedTask = await taskRepo.findById(delegatedId);
        if (!delegatedTask || !delegatedTask.assignedAgentId) continue;
        delegatedTasks.push({ task: delegatedTask, agentId: delegatedTask.assignedAgentId });
      }

      // Group by agent so each agent's tasks run sequentially.
      const byAgent = new Map<string, import('@opencorp/shared').Task[]>();
      for (const { task: t, agentId } of delegatedTasks) {
        if (!byAgent.has(agentId)) byAgent.set(agentId, []);
        byAgent.get(agentId)!.push(t);
      }

      // Run each agent's task chain in parallel across agents.
      const chains = Array.from(byAgent.entries()).map(async ([agentId, agentTasks]) => {
        for (const agentTask of agentTasks) {
          await runAgentTask({
            companyId,
            rootTaskId: taskId,
            agentId,
            task: agentTask,
          });
        }
      });
      await Promise.all(chains);
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
}) {
  const { companyId, rootTaskId, agentId, task } = params;

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
  });
  // Register the runtime so the run can be cancelled.
  activeRuns.get(rootTaskId)?.push(runtime);

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
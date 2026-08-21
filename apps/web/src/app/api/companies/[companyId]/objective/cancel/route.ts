import { NextResponse } from 'next/server';
import { TaskRepository, AgentRepository, EventStore } from '@opencorp/db';
import { cancelRun } from '@/lib/runs';

const taskRepo = new TaskRepository();
const agentRepo = new AgentRepository();
const eventStore = new EventStore();

// POST /api/companies/[companyId]/objective/cancel - cancel a running objective
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const body = await request.json();
    const taskId = body?.taskId as string | undefined;
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 },
      );
    }

    // Soft-stop every registered runtime (CEO + delegated workers) and abort
    // in-flight LLM/tool calls. Workers wrap up in a few thinking steps.
    const found = cancelRun(taskId);

    // Mark root + all child tasks that are still live as cancelled.
    const allTasks = await taskRepo.findByCompany(companyId);
    for (const task of allTasks) {
      const isRoot = task.id === taskId;
      const isChild = task.parentTaskId === taskId;
      if (!isRoot && !isChild) continue;
      if (
        task.status === 'running' ||
        task.status === 'pending' ||
        task.status === 'assigned' ||
        task.status === 'blocked'
      ) {
        await taskRepo.updateError(task.id, 'Objective execution cancelled by user');
        await taskRepo.updateStatus(task.id, 'failed');
      }
    }

    // Idle every agent in the company so the UI reflects the stop.
    const agents = await agentRepo.findByCompany(companyId);
    for (const agent of agents) {
      if (agent.state !== 'idle') {
        await agentRepo.updateState(agent.id, 'idle');
      }
    }

    await eventStore.create({
      companyId,
      type: 'system.info',
      taskId,
      eventData: {
        message: found
          ? 'Stop requested — all agents wrapping up.'
          : 'No active run found (may already be complete).',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: found
          ? 'Objective cancelled — agents wrapping up'
          : 'No active run found (may already be complete)',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel objective',
      },
      { status: 500 },
    );
  }
}

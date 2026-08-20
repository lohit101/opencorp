import { NextResponse } from 'next/server';
import { TaskRepository } from '@opencorp/db';
import { cancelRun, isRunCancelled } from '@/lib/runs';

const taskRepo = new TaskRepository();

// POST /api/companies/[companyId]/objective/cancel - cancel a running objective
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const body = await request.json();
    const taskId = body?.taskId as string | undefined;
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 },
      );
    }

    // Signal the run to stop: abort any in-flight LLM/tool call and set the
    // cancelled flag so the orchestrator halts before running more work.
    const found = cancelRun(taskId);

    // Mark the task as failed/cancelled if it is still in a live state.
    const task = await taskRepo.findById(taskId);
    if (task && (task.status === 'running' || task.status === 'pending' || task.status === 'assigned')) {
      await taskRepo.updateError(taskId, 'Objective execution cancelled by user');
      await taskRepo.updateStatus(taskId, 'failed');
    }

    return NextResponse.json({
      success: true,
      data: { message: found ? 'Objective cancelled' : 'No active run found (may already be complete)' },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to cancel objective' },
      { status: 500 },
    );
  }
}
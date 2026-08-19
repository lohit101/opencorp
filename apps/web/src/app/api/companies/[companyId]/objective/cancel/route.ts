import { NextResponse } from 'next/server';
import { TaskRepository } from '@opencorp/db';
import { activeRuns } from '@/lib/runs';

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

    const runtimes = activeRuns.get(taskId);
    if (runtimes && runtimes.length > 0) {
      for (const runtime of runtimes) {
        runtime.cancel();
      }
      activeRuns.delete(taskId);
    }

    // Mark the task as failed/blocked as it was cancelled
    const task = await taskRepo.findById(taskId);
    if (task && (task.status === 'running' || task.status === 'pending' || task.status === 'assigned')) {
      await taskRepo.updateError(taskId, 'Objective execution cancelled by user');
      await taskRepo.updateStatus(taskId, 'failed');
    }

    return NextResponse.json({
      success: true,
      data: { message: runtimes ? 'Objective cancelled' : 'No active run found (may already be complete)' },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to cancel objective' },
      { status: 500 },
    );
  }
}
import { NextResponse } from 'next/server';
import { TaskRepository } from '@opencorp/db';

const taskRepo = new TaskRepository();

type RouteContext = { params: Promise<{ companyId: string }> };

// GET /api/companies/[companyId]/tasks - list tasks for a company
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { companyId } = await params;
    const tasks = await taskRepo.findByCompany(companyId);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list tasks' },
      { status: 500 },
    );
  }
}

// POST /api/companies/[companyId]/tasks - create a task
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { companyId } = await params;
    const body = await request.json();
    const { title, description, assignedAgentId, parentTaskId, priority } = body as {
      title?: string;
      description?: string;
      assignedAgentId?: string;
      parentTaskId?: string;
      priority?: number;
    };

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'Task title is required' },
        { status: 400 },
      );
    }

    const task = await taskRepo.create({
      companyId,
      title: title.trim(),
      description: description?.trim() ?? '',
      assignedAgentId,
      parentTaskId,
      priority,
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create task' },
      { status: 500 },
    );
  }
}
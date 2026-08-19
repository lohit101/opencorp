import { NextResponse } from 'next/server';
import { CompanyRepository, AgentRepository, TaskRepository, EventStore, MessageRepository } from '@opencorp/db';

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

    const [agents, tasks, events, messages] = await Promise.all([
      agentRepo.findByCompany(companyId),
      taskRepo.findByCompany(companyId),
      eventStore.findByCompany(companyId, 300),
      messageRepo.findByCompany(companyId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        company,
        agents,
        tasks,
        events,
        messages,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load company' },
      { status: 500 },
    );
  }
}
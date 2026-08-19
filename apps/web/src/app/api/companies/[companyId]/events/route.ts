import { NextResponse } from 'next/server';
import { EventStore } from '@opencorp/db';

const eventStore = new EventStore();

// GET /api/companies/[companyId]/events - list recent events for a company
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '200', 10) || 200;
    const events = await eventStore.findByCompany(companyId, limit);
    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list events' },
      { status: 500 },
    );
  }
}
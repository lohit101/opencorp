import { NextResponse } from 'next/server';
import { PrismaMemoryStore } from '@opencorp/db';

const memoryStore = new PrismaMemoryStore();

// GET /api/companies/[companyId]/memories - list memory entries for a company
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10) || 100;
    const memories = await memoryStore.search({ companyId, limit });
    return NextResponse.json({ success: true, data: memories });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list memories' },
      { status: 500 },
    );
  }
}
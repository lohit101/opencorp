import { NextResponse } from 'next/server';
import { MessageRepository } from '@opencorp/db';

const messageRepo = new MessageRepository();

// GET /api/companies/[companyId]/messages - list agent messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const messages = await messageRepo.findByCompany(companyId);
    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list messages' },
      { status: 500 },
    );
  }
}
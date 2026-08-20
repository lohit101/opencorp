import { NextResponse } from 'next/server';
import { QuestionRepository } from '@opencorp/db';

const questionRepo = new QuestionRepository();

// GET /api/companies/[companyId]/questions - list questions for a company
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const questions = await questionRepo.findByCompany(companyId);
    return NextResponse.json({ success: true, data: questions });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load questions',
      },
      { status: 500 },
    );
  }
}
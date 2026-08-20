import { NextResponse } from 'next/server';
import { QuestionRepository } from '@opencorp/db';

const questionRepo = new QuestionRepository();

// POST /api/companies/[companyId]/questions/[questionId]/answer - answer a question
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; questionId: string }> },
) {
  try {
    const { companyId, questionId } = await params;
    const body = await request.json();
    const answer = body?.answer as string | undefined;

    if (!answer || !answer.trim()) {
      return NextResponse.json(
        { success: false, error: 'Answer is required' },
        { status: 400 },
      );
    }

    const question = await questionRepo.findById(questionId);
    if (!question || question.companyId !== companyId) {
      return NextResponse.json(
        { success: false, error: 'Question not found' },
        { status: 404 },
      );
    }

    const updated = await questionRepo.answer(questionId, answer.trim());
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to answer question',
      },
      { status: 500 },
    );
  }
}
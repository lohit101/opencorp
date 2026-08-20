import { prisma } from '../client.js';

/**
 * A question an agent is asking the user. Mirrors the type in @opencorp/tools
 * to avoid a cross-package dependency on the tools package.
 */
export interface PendingQuestion {
  id: string;
  companyId: string;
  agentId: string;
  taskId?: string;
  question: string;
  context?: string;
  status: 'pending' | 'answered' | 'dismissed';
  answer?: string;
  createdAt: string;
  answeredAt?: string;
}

/**
 * QuestionRepository handles persistence for agent→user questions.
 */
export class QuestionRepository {
  async create(data: {
    companyId: string;
    agentId: string;
    taskId?: string;
    question: string;
    context?: string;
  }): Promise<PendingQuestion> {
    const question = await prisma.question.create({
      data: {
        companyId: data.companyId,
        agentId: data.agentId,
        taskId: data.taskId ?? null,
        question: data.question,
        context: data.context ?? null,
        status: 'pending',
      },
    });

    return this.toDomain(question);
  }

  async findByCompany(companyId: string): Promise<PendingQuestion[]> {
    const questions = await prisma.question.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
    return questions.map((q) => this.toDomain(q));
  }

  async findPendingByCompany(companyId: string): Promise<PendingQuestion[]> {
    const questions = await prisma.question.findMany({
      where: { companyId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    return questions.map((q) => this.toDomain(q));
  }

  async findById(id: string): Promise<PendingQuestion | null> {
    const question = await prisma.question.findUnique({ where: { id } });
    return question ? this.toDomain(question) : null;
  }

  async answer(id: string, answer: string): Promise<PendingQuestion> {
    const question = await prisma.question.update({
      where: { id },
      data: {
        status: 'answered',
        answer,
        answeredAt: new Date(),
      },
    });
    return this.toDomain(question);
  }

  async dismiss(id: string): Promise<PendingQuestion> {
    const question = await prisma.question.update({
      where: { id },
      data: { status: 'dismissed' },
    });
    return this.toDomain(question);
  }

  private toDomain(question: {
    id: string;
    companyId: string;
    agentId: string;
    taskId: string | null;
    question: string;
    context: string | null;
    status: string;
    answer: string | null;
    createdAt: Date;
    answeredAt: Date | null;
  }): PendingQuestion {
    return {
      id: question.id,
      companyId: question.companyId,
      agentId: question.agentId,
      taskId: question.taskId ?? undefined,
      question: question.question,
      context: question.context ?? undefined,
      status: question.status as PendingQuestion['status'],
      answer: question.answer ?? undefined,
      createdAt: question.createdAt.toISOString(),
      answeredAt: question.answeredAt?.toISOString(),
    };
  }
}
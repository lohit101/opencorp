import type { ToolDefinition, ToolCall } from '@opencorp/shared';
import type { Tool, ToolExecutionContext, ToolExecutionResult } from './types.js';

/**
 * A question an agent asks the user. The orchestrator surfaces these to the
 * UI and waits for the user's reply before the agent continues.
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
 * Resolves a pending question to its answer. Implementations typically poll
 * the database until the user answers (or the question is dismissed).
 * Returns null if the question is dismissed or times out.
 */
export type AnswerResolver = (questionId: string) => Promise<string | null | undefined>;

/**
 * Ask User tool - allows an agent to ask the user a question when it needs
 * input it cannot get from other agents (e.g. agent-to-agent collaboration
 * failed, or a decision requires human judgment). The agent's loop pauses
 * until the user answers; the answer is returned as the tool result.
 */
export class AskUserTool implements Tool {
  readonly definition: ToolDefinition = {
    name: 'ask_user',
    description: `Ask the user a question when you need input you cannot obtain yourself. Use this when agent-to-agent collaboration has failed, when you need a decision or clarification that requires human judgment, or when you are blocked and need guidance. Your loop will pause until the user answers; their answer is returned to you.`,
    parameters: [
      {
        name: 'question',
        type: 'string',
        description: 'The question to ask the user. Be specific and concise.',
        required: true,
      },
      {
        name: 'context',
        type: 'string',
        description: 'Optional context explaining why you need this input',
        required: false,
      },
    ],
  };

  private questionHandler?: (question: PendingQuestion) => Promise<void>;
  private answerResolver?: AnswerResolver;

  constructor(handler?: (question: PendingQuestion) => Promise<void>) {
    this.questionHandler = handler;
  }

  setQuestionHandler(handler: (question: PendingQuestion) => Promise<void>): void {
    this.questionHandler = handler;
  }

  setAnswerResolver(resolver: AnswerResolver): void {
    this.answerResolver = resolver;
  }

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const question = String(call.arguments.question ?? '');
    const questionContext = call.arguments.context
      ? String(call.arguments.context)
      : undefined;

    if (!question.trim()) {
      return { success: false, error: 'Question is required' };
    }

    const pending: PendingQuestion = {
      id: crypto.randomUUID(),
      companyId: context.companyId,
      agentId: context.agentId,
      question,
      context: questionContext,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    if (this.questionHandler) {
      try {
        await this.questionHandler(pending);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to record question',
        };
      }
    }

    // If no answer resolver is wired, return immediately (question recorded
    // but the agent won't wait for an answer).
    if (!this.answerResolver) {
      return {
        success: true,
        data: {
          questionId: pending.id,
          message:
            'Your question has been sent to the user. Continue with what you can, or wait for their answer.',
        },
      };
    }

    // Block until the user answers. Poll the resolver.
    const answer = await this.waitForAnswer(pending.id);

    if (answer === null) {
      return {
        success: false,
        error:
          'The user dismissed your question. Proceed with your best judgment and note the missing input.',
      };
    }

    return {
      success: true,
      data: {
        questionId: pending.id,
        answer,
        message: `The user answered: ${answer}`,
      },
    };
  }

  private async waitForAnswer(questionId: string): Promise<string | null> {
    // Poll every 2 seconds for up to 10 minutes.
    const pollIntervalMs = 2000;
    const maxWaitMs = 10 * 60 * 1000;
    const started = Date.now();

    while (Date.now() - started < maxWaitMs) {
      const answer = await this.answerResolver?.(questionId);
      if (answer !== undefined && answer !== null) {
        return answer;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return null;
  }
}
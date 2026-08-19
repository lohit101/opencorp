import type { ChatOptions, ChatResponse, HealthCheckResult, LLMMessage, LLMProvider } from './types.js';
import type { ToolCall, ToolDefinition } from '@opencorp/shared';

/**
 * OpenRouter provider implementation.
 *
 * Communicates with the OpenRouter API to access a wide variety of LLMs.
 * Users must provide their own API key via environment configuration.
 */
export class OpenRouterProvider implements LLMProvider {
  readonly providerType = 'openrouter';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  async chat(
    messages: LLMMessage[],
    options: ChatOptions,
  ): Promise<ChatResponse> {
    const body = this.buildRequestBody(messages, options);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/opencorp/opencorp',
        'X-Title': 'OpenCorp',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as OpenRouterResponse;
    return this.parseResponse(data);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await this.chat(
        [{ role: 'user', content: 'Respond with exactly: OK' }],
        { model: 'openai/gpt-4o-mini', maxTokens: 10 },
      );
      return { ok: true, message: 'Provider is reachable' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildRequestBody(
    messages: LLMMessage[],
    options: ChatOptions,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: this.formatMessages(messages, options.systemPrompt),
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.topP !== undefined) body.top_p = options.topP;

    if (options.tools && options.tools.length > 0) {
      body.tools = this.formatTools(options.tools);
    }

    return body;
  }

  private formatMessages(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): Record<string, unknown>[] {
    const formatted: Record<string, unknown>[] = [];

    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') {
        formatted.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      } else if (msg.role === 'assistant' && msg.toolCallId) {
        // This is a tool result context message; skip in favor of tool role
        continue;
      } else {
        formatted.push({ role: msg.role, content: msg.content });
      }
    }

    return formatted;
  }

  private formatTools(tools: ToolDefinition[]): Record<string, unknown>[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.parameters.map((p: ToolDefinition['parameters'][0]) => [
              p.name,
              {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
              },
            ]),
          ),
          required: tool.parameters.filter((p: ToolDefinition['parameters'][0]) => p.required).map((p: ToolDefinition['parameters'][0]) => p.name),
        },
      },
    }));
  }

  private parseResponse(data: OpenRouterResponse): ChatResponse {
    const choice = data.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      toolName: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
      status: 'pending' as const,
    }));

    return {
      content: message.content ?? '',
      toolCalls,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  private mapFinishReason(
    reason: string | null,
  ): import('./types.js').FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      default:
        return 'unknown';
    }
  }
}

// ---------------------------------------------------------------------------
// OpenRouter API response types
// ---------------------------------------------------------------------------

interface OpenRouterResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
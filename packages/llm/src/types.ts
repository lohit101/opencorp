import type { ToolDefinition, ToolCall } from '@opencorp/shared';

/**
 * LLMProvider is the core abstraction for interacting with language models.
 *
 * All LLM providers (OpenRouter, OpenAI, Anthropic, etc.) must implement this interface.
 * The agent runtime depends on this interface, not on any specific provider implementation.
 */
export interface LLMProvider {
  /** The provider type identifier */
  readonly providerType: string;

  /**
   * Send a conversation to the LLM and receive a response.
   *
   * @param messages - The conversation history
   * @param options - Configuration for this request
   * @returns The model's response, which may include text and/or tool calls
   */
  chat(
    messages: LLMMessage[],
    options: ChatOptions,
  ): Promise<ChatResponse>;

  /**
   * Check whether the provider is properly configured and accessible.
   */
  healthCheck(): Promise<HealthCheckResult>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  name?: string;
}

export interface ChatOptions {
  model: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  finishReason: FinishReason;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'error' | 'unknown';

export interface HealthCheckResult {
  ok: boolean;
  message: string;
  model?: string;
}
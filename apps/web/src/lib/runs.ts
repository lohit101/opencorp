import type { AgentRuntime } from '@opencorp/agent-runtime';

/**
 * Module-level registry of active objective runs, keyed by the root task id.
 * Each entry holds the AgentRuntime instances that the cancel endpoint calls
 * .cancel() on to stop execution.
 *
 * This lives in its own module (not a route file) so both the objective route
 * and the cancel route can import it without Next.js route-handler restrictions.
 */
export const activeRuns = new Map<string, AgentRuntime[]>();
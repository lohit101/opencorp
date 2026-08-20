import type { AgentRuntime } from '@opencorp/agent-runtime';

/**
 * Shared state for a single running objective. Held across the whole run so
 * both the orchestrator (objective route) and the cancel endpoint can observe
 * cancellation without depending on per-LLM-call abort behavior.
 */
export interface Run {
  /** Abort signal wired into every AgentRuntime's LLM/tool calls. */
  controller: AbortController;
  /** Set true once the user requests cancellation of this run. */
  cancelled: boolean;
  /** The AgentRuntime instances spun up by this run (CEO + delegated workers). */
  runtimes: AgentRuntime[];
}

/**
 * Module-level registry of active objective runs, keyed by the root task id.
 *
 * This lives in its own module (not a route file) so both the objective route
 * and the cancel route can import it without Next.js route-handler restrictions.
 */
export const activeRuns = new Map<string, Run>();

/**
 * Start tracking a new run and return its shared handle.
 */
export function registerRun(taskId: string): Run {
  const run: Run = {
    controller: new AbortController(),
    cancelled: false,
    runtimes: [],
  };
  activeRuns.set(taskId, run);
  return run;
}

/**
 * Request cancellation of the run's current task. Aborts any in-flight LLM/tool
 * call (so a blocking call returns immediately) and marks the run cancelled so
 * the orchestrator stops before executing more work. Returns whether an active
 * run was found.
 */
export function cancelRun(taskId: string): boolean {
  const run = activeRuns.get(taskId);
  if (!run) return false;
  run.cancelled = true;
  run.controller.abort();
  return true;
}

/**
 * True if a run has been requested to cancel.
 */
export function isRunCancelled(taskId: string): boolean {
  return activeRuns.get(taskId)?.cancelled ?? false;
}
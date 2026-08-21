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
 * Request cancellation of the run. Soft-stops every registered agent runtime
 * (CEO + workers) so they abort in-flight work and wrap up in a few steps,
 * and marks the run cancelled so the orchestrator skips remaining tasks.
 */
export function cancelRun(taskId: string): boolean {
  const run = activeRuns.get(taskId);
  if (!run) return false;
  run.cancelled = true;
  // Soft-stop every worker first so each one wraps up; requestStop also aborts
  // that runtime's in-flight LLM/tool calls.
  for (const runtime of run.runtimes) {
    try {
      runtime.requestStop();
    } catch {
      // Best-effort; continue stopping others.
    }
  }
  // Abort the shared controller so any runtime that only listens to the
  // external signal (and any late-registered one) still stops.
  if (!run.controller.signal.aborted) {
    run.controller.abort();
  }
  return true;
}

/**
 * True if a run has been requested to cancel.
 */
export function isRunCancelled(taskId: string): boolean {
  return activeRuns.get(taskId)?.cancelled ?? false;
}

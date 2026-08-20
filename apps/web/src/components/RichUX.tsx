'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types (mirror the dashboard's local interfaces)
// ---------------------------------------------------------------------------

interface Agent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  description: string;
  state: string;
}

interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
  assignedAgentId?: string;
  parentTaskId?: string;
  priority: number;
  result?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

interface SystemEvent {
  id: string;
  companyId: string;
  type: string;
  agentId?: string;
  taskId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface AgentMessage {
  id: string;
  senderAgentId: string;
  recipientAgentId?: string;
  content: string;
  timestamp: string;
}

interface MemoryEntry {
  id: string;
  companyId: string;
  type: string;
  key: string;
  content: string;
  tags: string[];
  sourceAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Agent avatars with role-based colors and status animations
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<string, string> = {
  CEO: 'bg-brand-600',
  ENGINEER: 'bg-blue-600',
  RESEARCHER: 'bg-violet-600',
  QA: 'bg-emerald-600',
  DESIGNER: 'bg-pink-600',
};

const STATE_STYLES: Record<string, { dot: string; label: string; pulse: boolean }> = {
  idle: { dot: 'bg-zinc-500', label: 'text-zinc-400', pulse: false },
  running: { dot: 'bg-brand-400', label: 'text-brand-400', pulse: true },
  thinking: { dot: 'bg-amber-400', label: 'text-amber-400', pulse: true },
  waiting: { dot: 'bg-sky-400', label: 'text-sky-400', pulse: false },
  blocked: { dot: 'bg-orange-400', label: 'text-orange-400', pulse: false },
  error: { dot: 'bg-red-400', label: 'text-red-400', pulse: false },
};

export function AgentAvatar({
  name,
  role,
  state,
  size = 'md',
}: {
  name: string;
  role: string;
  state?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-12 w-12 text-lg' : 'h-9 w-9 text-sm';
  const color = ROLE_COLORS[role.toUpperCase()] ?? 'bg-zinc-600';
  const st = state ? STATE_STYLES[state] : undefined;

  return (
    <div className="relative">
      <span
        className={`flex ${dims} items-center justify-center rounded-xl ${color} font-bold text-white`}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      {st && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full ${
            st.pulse ? 'animate-ping' : ''
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message history viewer
// ---------------------------------------------------------------------------

export function MessageViewer({
  messages,
  agents,
}: {
  messages: AgentMessage[];
  agents: Agent[];
}) {
  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Message History ({messages.length})
      </h3>
      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No agent-to-agent messages yet.
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {[...messages]
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <AgentAvatar
                    name={agentName(m.senderAgentId)}
                    role=""
                    size="sm"
                  />
                  <span className="text-xs font-medium text-zinc-300">
                    {agentName(m.senderAgentId)}
                  </span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-xs text-zinc-400">
                    {agentName(m.recipientAgentId)}
                  </span>
                  <span className="ml-auto text-[10px] text-zinc-600">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {m.content}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory browser
// ---------------------------------------------------------------------------

const MEMORY_TYPE_COLORS: Record<string, string> = {
  company: 'bg-brand-600',
  project: 'bg-blue-600',
  task: 'bg-amber-600',
  agent: 'bg-violet-600',
  decision: 'bg-emerald-600',
};

export function MemoryBrowser({
  companyId,
  agents,
}: {
  companyId: string;
  agents: Agent[];
}) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/companies/${companyId}/memories`);
        const json = await res.json();
        if (json.success) setMemories(json.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  const types = ['all', ...Array.from(new Set(memories.map((m) => m.type)))];
  const visible = filter === 'all' ? memories : memories.filter((m) => m.type === filter);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Memory ({memories.length})
        </h3>
        <div className="flex flex-wrap gap-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                filter === t
                  ? 'bg-brand-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-zinc-500">Loading memories...</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No memories stored yet. Agents record decisions and context here.
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {visible.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${
                    MEMORY_TYPE_COLORS[m.type] ?? 'bg-zinc-600'
                  }`}
                >
                  {m.type}
                </span>
                <span className="text-xs font-medium text-zinc-300">{m.key}</span>
                {m.sourceAgentId && (
                  <span className="text-[10px] text-zinc-500">
                    by {agentName(m.sourceAgentId)}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-3 text-xs text-zinc-400">{m.content}</p>
              {m.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run history & replay
// ---------------------------------------------------------------------------

interface RunSummary {
  id: string;
  objective: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  taskCount: number;
  agentCount: number;
}

export function RunHistory({
  tasks,
  events,
  agents,
  onReplay,
}: {
  tasks: Task[];
  events: SystemEvent[];
  agents: Agent[];
  onReplay: (objective: string) => void;
}) {
  // Group tasks by their root objective run. We approximate a "run" as the
  // set of tasks sharing the same root task (the "Execute company objective").
  const rootTasks = tasks.filter((t) => !t.parentTaskId);
  const runs: RunSummary[] = rootTasks.map((root) => {
    const children = tasks.filter((t) => t.parentTaskId === root.id);
    const allIds = new Set([root.id, ...children.map((c) => c.id)]);
    const runEvents = events.filter((e) => e.taskId && allIds.has(e.taskId));
    const runAgents = new Set(
      [root, ...children]
        .map((t) => t.assignedAgentId)
        .filter(Boolean),
    );
    const status: RunSummary['status'] =
      root.status === 'completed'
        ? 'completed'
        : root.status === 'failed'
          ? 'failed'
          : root.status === 'cancelled'
            ? 'cancelled'
            : 'running';

    return {
      id: root.id,
      objective: root.description,
      startedAt: root.createdAt ?? '',
      endedAt: root.completedAt,
      status,
      taskCount: children.length + 1,
      agentCount: runAgents.size,
    };
  });

  const statusColors: Record<string, string> = {
    running: 'text-brand-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
    cancelled: 'text-orange-400',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Run History ({runs.length})
      </h3>
      {runs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No runs yet. Execute a company objective to see history here.
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {runs.map((run) => (
            <div
              key={run.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="line-clamp-1 text-xs font-medium text-zinc-300">
                  {run.objective}
                </p>
                <span className={`shrink-0 text-xs ${statusColors[run.status]}`}>
                  {run.status}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                <span>{new Date(run.startedAt).toLocaleString()}</span>
                <span>·</span>
                <span>{run.taskCount} tasks</span>
                <span>·</span>
                <span>{run.agentCount} agents</span>
                {run.endedAt && (
                  <>
                    <span>·</span>
                    <span>
                      {Math.max(
                        0,
                        Math.round(
                          (new Date(run.endedAt).getTime() -
                            new Date(run.startedAt).getTime()) /
                            1000,
                        ),
                      )}
                      s
                    </span>
                  </>
                )}
              </div>
              {run.status === 'completed' && (
                <button
                  onClick={() => onReplay(run.objective)}
                  className="mt-1 text-[10px] text-brand-400 underline hover:text-brand-300"
                >
                  ↻ Replay this run
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task timeline (Gantt-style)
// ---------------------------------------------------------------------------

export function TaskTimeline({
  tasks,
  agents,
}: {
  tasks: Task[];
  agents: Agent[];
}) {
  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'Unassigned';

  const statusColors: Record<string, string> = {
    pending: 'bg-zinc-600',
    assigned: 'bg-amber-500',
    running: 'bg-brand-500',
    blocked: 'bg-orange-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Task Timeline
      </h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No tasks yet. Run an objective to populate the timeline.
        </p>
      ) : (
        <div className="space-y-2">
          {[...tasks]
            .sort(
              (a, b) =>
                new Date(a.createdAt ?? 0).getTime() -
                new Date(b.createdAt ?? 0).getTime(),
            )
            .map((task) => (
              <div key={task.id} className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    statusColors[task.status] ?? 'bg-zinc-600'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-300">
                    {task.title}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {agentName(task.assignedAgentId)} ·{' '}
                    {task.createdAt
                      ? new Date(task.createdAt).toLocaleTimeString()
                      : '—'}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-zinc-500">
                  {task.status}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log viewer with filtering
// ---------------------------------------------------------------------------

export function LogViewer({
  events,
  agents,
}: {
  events: SystemEvent[];
  agents: Agent[];
}) {
  const [filter, setFilter] = useState<string>('all');
  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  const categories = ['all', 'tool', 'task', 'agent', 'message', 'company', 'system'];
  const visible =
    filter === 'all'
      ? events
      : events.filter((e) => {
          if (filter === 'tool') return e.type.includes('tool');
          if (filter === 'task') return e.type.includes('task');
          if (filter === 'agent') return e.type.includes('agent');
          if (filter === 'message') return e.type.includes('message');
          if (filter === 'system') return e.type.includes('system');
          return true;
        });

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Event Log ({visible.length})
        </h3>
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                filter === c
                  ? 'bg-brand-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No events in this category.</p>
      ) : (
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1 font-mono text-[11px]">
          {visible.map((e) => (
            <div key={e.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-zinc-600">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-zinc-500">[{agentName(e.agentId)}]</span>
              <span className="text-zinc-300">{e.type}</span>
              {e.data && Object.keys(e.data).length > 0 && (
                <span className="text-zinc-600">
                  {JSON.stringify(e.data).slice(0, 80)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export for the dashboard
export const types = ['all', 'company', 'project', 'task', 'agent', 'decision'];
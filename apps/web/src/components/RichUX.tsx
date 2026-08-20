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
  department?: string;
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

// ---------------------------------------------------------------------------
// Virtual office layout
// ---------------------------------------------------------------------------

const OFFICE_ROLE_ICONS: Record<string, string> = {
  CEO: '👔',
  ENGINEER: '💻',
  RESEARCHER: '🔬',
  QA: '🧪',
  DESIGNER: '🎨',
};

export function VirtualOffice({ agents }: { agents: Agent[] }) {
  const running = agents.filter((a) => a.state !== 'idle').length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          🏢 Virtual Office
        </h3>
        <span className="text-xs text-zinc-500">
          {running} active / {agents.length} total
        </span>
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Add agents to populate the office.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
            >
              <div className="flex items-center gap-2">
                <AgentAvatar
                  name={agent.name}
                  role={agent.role}
                  state={agent.state}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {agent.name}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {OFFICE_ROLE_ICONS[agent.role.toUpperCase()] ?? '💼'}{' '}
                    {agent.role}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    agent.state === 'idle' ? 'bg-zinc-500' : 'bg-brand-400 animate-pulse'
                  }`}
                />
                <span className="text-[10px] text-zinc-400">{agent.state}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real-time activity visualization (live pulse)
// ---------------------------------------------------------------------------

export function ActivityVisualizer({
  events,
  agents,
}: {
  events: SystemEvent[];
  agents: Agent[];
}) {
  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  // Show the most recent events as a live "pulse" stream.
  const recent = [...events].slice(-12).reverse();

  const colorFor = (type: string): string => {
    if (type.includes('completed')) return 'text-green-400';
    if (type.includes('failed') || type.includes('error')) return 'text-red-400';
    if (type.includes('tool')) return 'text-brand-400';
    if (type.includes('message')) return 'text-purple-400';
    if (type.includes('thinking')) return 'text-amber-400';
    return 'text-zinc-400';
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          ⚡ Live Activity
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-brand-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
          Live
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Agent activity will pulse here in real time.
        </p>
      ) : (
        <div className="space-y-1.5 font-mono text-xs">
          {recent.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <span className="shrink-0 text-zinc-600">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className={`truncate ${colorFor(e.type)}`}>
                [{agentName(e.agentId)}] {e.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent profiles & statistics
// ---------------------------------------------------------------------------

export function AgentProfiles({
  agents,
  tasks,
  messages,
}: {
  agents: Agent[];
  tasks: Task[];
  messages: AgentMessage[];
}) {
  const statsFor = (agentId: string) => {
    const assigned = tasks.filter((t) => t.assignedAgentId === agentId);
    const completed = assigned.filter((t) => t.status === 'completed');
    const failed = assigned.filter((t) => t.status === 'failed');
    const sent = messages.filter((m) => m.senderAgentId === agentId).length;
    const received = messages.filter((m) => m.recipientAgentId === agentId).length;
    return { assigned: assigned.length, completed: completed.length, failed: failed.length, sent, received };
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Agent Profiles ({agents.length})
      </h3>
      {agents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Add agents to see their profiles and stats.
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {agents.map((agent) => {
            const s = statsFor(agent.id);
            return (
              <div
                key={agent.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div className="flex items-center gap-2">
                  <AgentAvatar name={agent.name} role={agent.role} state={agent.state} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {agent.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">{agent.role}</p>
                  </div>
                  <span className="ml-auto text-[10px] text-zinc-500">
                    {agent.state}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                  <Stat label="Tasks" value={s.assigned} />
                  <Stat label="Done" value={s.completed} color="text-green-400" />
                  <Stat label="Failed" value={s.failed} color="text-red-400" />
                  <Stat label="Sent" value={s.sent} color="text-purple-400" />
                  <Stat label="Recv" value={s.received} color="text-sky-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-zinc-300',
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
      <span className="text-[9px] text-zinc-600">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live terminal output view
// ---------------------------------------------------------------------------

export function TerminalView({
  events,
  agents,
}: {
  events: SystemEvent[];
  agents: Agent[];
}) {
  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  const lines = events
    .slice()
    .reverse()
    .map((e) => {
      const tag = e.agentId ? agentName(e.agentId) : 'system';
      let detail = '';
      if (e.type.includes('tool') && e.data.toolName) {
        detail = ` → ${e.data.toolName}`;
      } else if (e.type.includes('task') && e.data.title) {
        detail = ` → ${e.data.title}`;
      } else if (e.type.includes('message')) {
        detail = ' → message';
      }
      return {
        id: e.id,
        text: `[${new Date(e.timestamp).toLocaleTimeString()}] [${tag}] ${e.type}${detail}`,
        color: e.type.includes('failed') || e.type.includes('error') ? 'text-red-400' : 'text-zinc-300',
      };
    })
    .slice(0, 40);

  return (
    <div className="rounded-xl border border-zinc-800 bg-black/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          ⌨️ Terminal Output
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          Connected
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="font-mono text-xs text-zinc-500">
          $ Waiting for agent activity...
        </p>
      ) : (
        <div className="max-h-80 space-y-0.5 overflow-y-auto pr-1 font-mono text-[11px]">
          {lines.map((line) => (
            <div key={line.id} className={`${line.color} whitespace-pre-wrap`}>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export for the dashboard
export const types = ['all', 'company', 'project', 'task', 'agent', 'decision'];

// ---------------------------------------------------------------------------
// Department tree / branch visualization
// ---------------------------------------------------------------------------

const DEPARTMENT_ICONS: Record<string, string> = {
  engineering: '⚙️',
  marketing: '📣',
  design: '🎨',
  research: '🔬',
  qa: '🧪',
  operations: '📊',
  general: '🏢',
};

const DEPARTMENT_COLORS: Record<string, string> = {
  engineering: 'border-blue-500/40 text-blue-300',
  marketing: 'border-pink-500/40 text-pink-300',
  design: 'border-purple-500/40 text-purple-300',
  research: 'border-violet-500/40 text-violet-300',
  qa: 'border-emerald-500/40 text-emerald-300',
  operations: 'border-amber-500/40 text-amber-300',
  general: 'border-zinc-600/40 text-zinc-300',
};

export function DepartmentTree({
  agents,
  tasks,
  events,
  messages,
}: {
  agents: Agent[];
  tasks: Task[];
  events: SystemEvent[];
  messages: AgentMessage[];
}) {
  const [view, setView] = useState<{ level: 'root' } | { level: 'dept'; dept: string } | { level: 'agent'; agentId: string }>({ level: 'root' });

  // Group agents by department.
  const departments = new Map<string, Agent[]>();
  for (const agent of agents) {
    const dept = agent.department || 'general';
    if (!departments.has(dept)) departments.set(dept, []);
    departments.get(dept)!.push(agent);
  }
  const deptNames = Array.from(departments.keys()).sort();

  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  // Breadcrumb navigation
  const breadcrumb = (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={() => setView({ level: 'root' })}
        className={`rounded px-2 py-1 font-medium ${view.level === 'root' ? 'text-brand-300 bg-brand-600/20' : 'text-zinc-300 hover:bg-zinc-800'}`}
      >
        🌳 All Departments
      </button>
      {view.level === 'dept' && (
        <>
          <span className="text-zinc-600">/</span>
          <span className="rounded px-2 py-1 font-medium capitalize text-brand-300 bg-brand-600/20">
            {view.dept}
          </span>
        </>
      )}
      {view.level === 'agent' && (
        <>
          <span className="text-zinc-600">/</span>
          <button
            onClick={() => setView({ level: 'dept', dept: agents.find((a) => a.id === view.agentId)?.department || 'general' })}
            className="rounded px-2 py-1 font-medium capitalize text-zinc-300 hover:bg-zinc-800"
          >
            {agents.find((a) => a.id === view.agentId)?.department || 'general'}
          </button>
          <span className="text-zinc-600">/</span>
          <span className="rounded px-2 py-1 font-medium text-brand-300 bg-brand-600/20">
            {agentName(view.agentId)}
          </span>
        </>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          🌳 Organization Tree
        </h3>
        <span className="text-xs text-zinc-500">
          {agents.length} agents · {deptNames.length} departments
        </span>
      </div>

      {agents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Add agents to build your organization tree.
        </p>
      ) : (
        <>
          {breadcrumb}
          {view.level === 'root' && (
            <RootDept
              departments={departments}
              onSelectDept={(dept) => setView({ level: 'dept', dept })}
            />
          )}
          {view.level === 'dept' && (
            <DeptDetail
              dept={view.dept}
              members={departments.get(view.dept) ?? []}
              onSelectAgent={(agentId) => setView({ level: 'agent', agentId })}
            />
          )}
          {view.level === 'agent' && (
            <AgentDetail
              agent={agents.find((a) => a.id === view.agentId)!}
              tasks={tasks}
              events={events}
              messages={messages}
              agentName={agentName}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root view: departments as clickable branch nodes
// ---------------------------------------------------------------------------

function RootDept({
  departments,
  onSelectDept,
}: {
  departments: Map<string, Agent[]>;
  onSelectDept: (dept: string) => void;
}) {
  const deptNames = Array.from(departments.keys()).sort();
  return (
    <div className="space-y-3">
      {deptNames.map((dept) => {
        const members = departments.get(dept)!;
        const active = members.filter((a) => a.state !== 'idle').length;
        return (
          <button
            key={dept}
            onClick={() => onSelectDept(dept)}
            className={`w-full rounded-lg border ${DEPARTMENT_COLORS[dept] ?? DEPARTMENT_COLORS.general} bg-zinc-900/60 p-4 text-left transition-colors hover:border-brand-500 hover:bg-zinc-800/60`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{DEPARTMENT_ICONS[dept] ?? '🏢'}</span>
                <div>
                  <p className="text-base font-semibold capitalize text-zinc-100">
                    {dept}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {members.length} agent{members.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {active > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-brand-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
                    {active} active
                  </span>
                )}
                <span className="text-zinc-600">›</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {members.map((agent) => (
                <span
                  key={agent.id}
                  className={`h-2 w-2 rounded-full ${agent.state === 'idle' ? 'bg-zinc-500' : 'bg-brand-400 animate-pulse'}`}
                  title={agent.name}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 2: agents within a department as clickable nodes
// ---------------------------------------------------------------------------

function DeptDetail({
  dept,
  members,
  onSelectAgent,
}: {
  dept: string;
  members: Agent[];
  onSelectAgent: (agentId: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs text-zinc-500">
        Click an agent to zoom into their individual monitoring.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
            className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 text-left transition-colors hover:border-brand-500 hover:bg-zinc-800/60"
          >
            <div className="flex items-center gap-2">
              <AgentAvatar name={agent.name} role={agent.role} state={agent.state} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">
                  {agent.name}
                </p>
                <p className="text-[10px] text-zinc-500">{agent.role}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${agent.state === 'idle' ? 'bg-zinc-500' : 'bg-brand-400 animate-pulse'}`}
              />
              <span className="text-[10px] text-zinc-400">{agent.state}</span>
              <span className="ml-auto text-zinc-600">›</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 3: individual agent monitoring
// ---------------------------------------------------------------------------

function AgentDetail({
  agent,
  tasks,
  events,
  messages,
  agentName,
}: {
  agent: Agent;
  tasks: Task[];
  events: SystemEvent[];
  messages: AgentMessage[];
  agentName: (id?: string) => string;
}) {
  const agentTasks = tasks.filter((t) => t.assignedAgentId === agent.id);
  const agentEvents = events.filter((e) => e.agentId === agent.id);
  const agentMessages = messages.filter(
    (m) => m.senderAgentId === agent.id || m.recipientAgentId === agent.id,
  );

  const statusColors: Record<string, string> = {
    pending: 'border-zinc-700 text-zinc-400',
    assigned: 'border-amber-700 text-amber-400',
    running: 'border-brand-500 text-brand-400',
    blocked: 'border-orange-700 text-orange-400',
    completed: 'border-green-700 text-green-400',
    failed: 'border-red-700 text-red-400',
  };

  return (
    <div className="space-y-4">
      {/* Agent header */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4">
        <div className="flex items-center gap-3">
          <AgentAvatar name={agent.name} role={agent.role} state={agent.state} size="lg" />
          <div>
            <p className="text-base font-semibold text-zinc-100">{agent.name}</p>
            <p className="text-xs text-zinc-500">
              {agent.role} · {agent.department || 'general'}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className={`h-2 w-2 rounded-full ${agent.state === 'idle' ? 'bg-zinc-500' : 'bg-brand-400 animate-pulse'}`}
            />
            {agent.state}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-400">{agent.description}</p>
      </div>

      {/* Agent stats */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Tasks" value={agentTasks.length} />
        <Stat
          label="Done"
          value={agentTasks.filter((t) => t.status === 'completed').length}
          color="text-green-400"
        />
        <Stat
          label="Failed"
          value={agentTasks.filter((t) => t.status === 'failed').length}
          color="text-red-400"
        />
        <Stat
          label="Msgs"
          value={agentMessages.length}
          color="text-purple-400"
        />
      </div>

      {/* Agent tasks */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Tasks ({agentTasks.length})
        </p>
        {agentTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks assigned to this agent.</p>
        ) : (
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {agentTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-100">{task.title}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusColors[task.status] ?? 'text-zinc-400'}`}>
                    {task.status}
                  </span>
                </div>
                {task.result && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">{task.result}</p>
                )}
                {task.error && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-red-400">Error: {task.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent activity */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Activity ({agentEvents.length})
        </p>
        {agentEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity yet.</p>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto pr-1 font-mono text-[11px]">
            {agentEvents.slice().reverse().map((e) => (
              <div key={e.id} className="flex gap-2 py-0.5">
                <span className="shrink-0 text-zinc-600">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-zinc-300">{e.type}</span>
                {e.data && Object.keys(e.data).length > 0 && (
                  <span className="text-zinc-600">
                    {JSON.stringify(e.data).slice(0, 60)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent messages */}
      {agentMessages.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Messages ({agentMessages.length})
          </p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {agentMessages.slice().reverse().map((m) => (
              <div key={m.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                <p className="text-[10px] text-zinc-500">
                  {agentName(m.senderAgentId)} → {agentName(m.recipientAgentId)} ·{' '}
                  {new Date(m.timestamp).toLocaleTimeString()}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{m.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radial "digital brain" wheel visualization
// ---------------------------------------------------------------------------

const BRAIN_DEPT_COLORS: Record<string, string> = {
  engineering: '#3b82f6', // blue
  marketing: '#ec4899', // pink
  design: '#a855f7', // purple
  research: '#8b5cf6', // violet
  qa: '#10b981', // emerald
  operations: '#f59e0b', // amber
  general: '#71717a', // zinc
};

const BRAIN_ROLE_COLORS: Record<string, string> = {
  CEO: '#f59e0b',
  ENGINEER: '#3b82f6',
  RESEARCHER: '#8b5cf6',
  QA: '#10b981',
  DESIGNER: '#ec4899',
};

export function BrainWheel({
  agents,
  tasks,
  events,
  messages,
}: {
  agents: Agent[];
  tasks: Task[];
  events: SystemEvent[];
  messages: AgentMessage[];
}) {
  const [center, setCenter] = useState<{ type: 'company' } | { type: 'dept'; dept: string } | { type: 'agent'; agentId: string }>({ type: 'company' });

  // Group agents by department.
  const departments = new Map<string, Agent[]>();
  for (const agent of agents) {
    const dept = agent.department || 'general';
    if (!departments.has(dept)) departments.set(dept, []);
    departments.get(dept)!.push(agent);
  }
  const deptNames = Array.from(departments.keys()).sort();

  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  // Determine the current ring of nodes around the center.
  let ring: { id: string; label: string; sub: string; color: string; onClick: () => void }[] = [];
  let centerLabel = 'Company';
  let centerSub = `${agents.length} agents`;

  if (center.type === 'company') {
    centerLabel = 'OpenCorp';
    centerSub = `${agents.length} agents · ${deptNames.length} depts`;
    ring = deptNames.map((dept) => {
      const members = departments.get(dept)!;
      const active = members.filter((a) => a.state !== 'idle').length;
      return {
        id: `dept-${dept}`,
        label: dept,
        sub: `${members.length} agent${members.length !== 1 ? 's' : ''}${active ? ` · ${active} active` : ''}`,
        color: BRAIN_DEPT_COLORS[dept] ?? '#71717a',
        onClick: () => setCenter({ type: 'dept', dept }),
      };
    });
  } else if (center.type === 'dept') {
    const members = departments.get(center.dept) ?? [];
    centerLabel = center.dept;
    centerSub = `${members.length} agents`;
    ring = members.map((agent) => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      sub: agent.role,
      color: BRAIN_ROLE_COLORS[agent.role.toUpperCase()] ?? '#71717a',
      onClick: () => setCenter({ type: 'agent', agentId: agent.id }),
    }));
  } else {
    const agent = agents.find((a) => a.id === center.agentId)!;
    centerLabel = agent.name;
    centerSub = agent.role;
    // Agent ring: show their tasks as nodes.
    const agentTasks = tasks.filter((t) => t.assignedAgentId === agent.id);
    ring = agentTasks.map((task) => ({
      id: `task-${task.id}`,
      label: task.title.length > 18 ? task.title.slice(0, 18) + '…' : task.title,
      sub: task.status,
      color: task.status === 'completed' ? '#10b981' : task.status === 'failed' ? '#ef4444' : '#3b82f6',
      onClick: () => {},
    }));
  }

  const SIZE = 460;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 170; // ring radius
  const NODE_R = 44;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          🧠 Digital Brain
        </h3>
        <div className="flex items-center gap-2">
          {center.type !== 'company' && (
            <button
              onClick={() => setCenter({ type: 'company' })}
              className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-brand-500 hover:text-brand-300"
            >
              ↺ All Departments
            </button>
          )}
          {center.type === 'agent' && (
            <button
              onClick={() => setCenter({ type: 'dept', dept: agents.find((a) => a.id === center.agentId)?.department || 'general' })}
              className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-brand-500 hover:text-brand-300"
            >
              ↺ {agents.find((a) => a.id === center.agentId)?.department || 'general'}
            </button>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full">
        {/* Connection lines from center to ring nodes */}
        {ring.map((node, i) => {
          const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
          const x = CX + Math.cos(angle) * R;
          const y = CY + Math.sin(angle) * R;
          return (
            <line
              key={`line-${node.id}`}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke={node.color}
              strokeOpacity={0.4}
              strokeWidth={1.5}
            />
          );
        })}

        {/* Ring nodes */}
        {ring.map((node, i) => {
          const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
          const x = CX + Math.cos(angle) * R;
          const y = CY + Math.sin(angle) * R;
          return (
            <g key={node.id} onClick={node.onClick} className="cursor-pointer">
              <circle cx={x} cy={y} r={NODE_R} fill={node.color} fillOpacity={0.25} stroke={node.color} strokeWidth={2} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={13} fontWeight={700}>
                {node.label.charAt(0).toUpperCase()}
              </text>
              <text x={x} y={y + NODE_R + 12} textAnchor="middle" fill="#a1a1aa" fontSize={9}>
                {node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label}
              </text>
            </g>
          );
        })}

        {/* Center node */}
        <g onClick={() => center.type !== 'company' && setCenter({ type: 'company' })} className="cursor-pointer">
          <circle cx={CX} cy={CY} r={58} fill="#18181b" stroke="#f59e0b" strokeWidth={2.5} />
          <circle cx={CX} cy={CY} r={58} fillOpacity={0} className="animate-ping" />
          <text x={CX} y={CY - 6} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={800}>
            {centerLabel.charAt(0).toUpperCase()}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" fill="#a1a1aa" fontSize={9}>
            {centerLabel.length > 12 ? centerLabel.slice(0, 12) + '…' : centerLabel}
          </text>
          <text x={CX} y={CY + 30} textAnchor="middle" fill="#71717a" fontSize={8}>
            {centerSub}
          </text>
        </g>
      </svg>

      {/* Legend / hint */}
      <p className="mt-2 text-[10px] text-zinc-500">
        Click a node to zoom into it. Center shows the current focus.
      </p>
    </div>
  );
}
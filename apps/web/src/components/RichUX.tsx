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
  CEO: 'bg-chart-4',
  ENGINEER: 'bg-chart-1',
  RESEARCHER: 'bg-chart-5',
  QA: 'bg-chart-2',
  DESIGNER: 'bg-chart-3',
};

const STATE_STYLES: Record<string, { dot: string; label: string; pulse: boolean }> = {
  idle: { dot: 'bg-muted-foreground', label: 'text-muted-foreground', pulse: false },
  running: { dot: 'bg-chart-1', label: 'text-chart-1', pulse: true },
  thinking: { dot: 'bg-chart-4', label: 'text-chart-4', pulse: true },
  waiting: { dot: 'bg-chart-5', label: 'text-chart-5', pulse: false },
  blocked: { dot: 'bg-chart-3', label: 'text-chart-3', pulse: false },
  error: { dot: 'bg-destructive', label: 'text-destructive', pulse: false },
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
    <div className="glass rounded-2xl p-5 shadow-xl shadow-card/20">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
    <div className="glass rounded-2xl p-5 shadow-xl shadow-card/20">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
    <div className="glass rounded-2xl p-5 shadow-xl shadow-card/20">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
    <div className="glass rounded-2xl p-5 shadow-xl shadow-card/20">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
    <div className="glass rounded-2xl p-5 shadow-xl shadow-card/20">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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

  const SIZE = 480;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 175; // ring radius
  const NODE_R = 46;

  return (
    <div className="glass rounded-2xl p-5 shadow-xl shadow-chart-1/10">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          🧠 Digital Brain
        </h3>
        <div className="flex items-center gap-2">
          {center.type !== 'company' && (
            <button
              onClick={() => setCenter({ type: 'company' })}
              className="rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-chart-1 hover:text-foreground"
            >
              ↺ All Departments
            </button>
          )}
          {center.type === 'agent' && (
            <button
              onClick={() => setCenter({ type: 'dept', dept: agents.find((a) => a.id === center.agentId)?.department || 'general' })}
              className="rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-muted-foreground transition-all hover:border-chart-1 hover:text-foreground"
            >
              ↺ {agents.find((a) => a.id === center.agentId)?.department || 'general'}
            </button>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full">
        <defs>
          {/* Glow filter for nodes */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Radial gradient for center */}
          <radialGradient id="centerGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="40%" stopColor={center.type === 'company' ? '#f59e0b' : '#3b82f6'} />
            <stop offset="100%" stopColor="#18181b" />
          </radialGradient>
        </defs>

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
              strokeOpacity={0.35}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          );
        })}

        {/* Ring nodes with glow + pulse */}
        {ring.map((node, i) => {
          const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
          const x = CX + Math.cos(angle) * R;
          const y = CY + Math.sin(angle) * R;
          return (
            <g key={node.id} onClick={node.onClick} className="cursor-pointer" filter="url(#glow)">
              <circle cx={x} cy={y} r={NODE_R} fill={node.color} fillOpacity={0.18} stroke={node.color} strokeWidth={2.5} />
              <circle cx={x} cy={y} r={NODE_R} fill="none" stroke={node.color} strokeOpacity={0.5} strokeWidth={1} className="animate-ping" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={15} fontWeight={800}>
                {node.label.charAt(0).toUpperCase()}
              </text>
              <text x={x} y={y + NODE_R + 14} textAnchor="middle" fill="#a1a1aa" fontSize={9}>
                {node.label.length > 14 ? node.label.slice(0, 14) + '…' : node.label}
              </text>
            </g>
          );
        })}

        {/* Center node with gradient + glow */}
        <g onClick={() => center.type !== 'company' && setCenter({ type: 'company' })} className="cursor-pointer">
          <circle cx={CX} cy={CY} r={62} fill="url(#centerGrad)" stroke="#f59e0b" strokeWidth={3} filter="url(#glow)" />
          <circle cx={CX} cy={CY} r={62} fill="none" stroke="#f59e0b" strokeOpacity={0.4} strokeWidth={1.5} className="animate-ping" />
          <text x={CX} y={CY - 8} textAnchor="middle" fill="#fff" fontSize={17} fontWeight={900}>
            {centerLabel.charAt(0).toUpperCase()}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" fill="#e0e0e0" fontSize={10}>
            {centerLabel.length > 12 ? centerLabel.slice(0, 12) + '…' : centerLabel}
          </text>
          <text x={CX} y={CY + 32} textAnchor="middle" fill="#a1a1aa" fontSize={8}>
            {centerSub}
          </text>
        </g>
      </svg>

      {/* Legend / hint */}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Click a node to zoom into it. Center shows the current focus.
      </p>
    </div>
  );
}
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentAvatar,
  MessageViewer,
  MemoryBrowser,
  RunHistory,
  TaskTimeline,
  LogViewer,
  BrainWheel,
} from './RichUX';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Company {
  id: string;
  name: string;
  description: string;
  objective?: string;
}

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

interface WorkspaceFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CompanyDashboard() {
  const [company, setCompany] = useState<Company | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [objectiveRunning, setObjectiveRunning] = useState(false);

  // Create company form
  const [companyName, setCompanyName] = useState('');
  const [companyDesc, setCompanyDesc] = useState('');

  // Create agent form
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('CEO');
  const [agentDepartment, setAgentDepartment] = useState('engineering');

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isEditingObjective = useRef(false);
  const companyRef = useRef<Company | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Apply the theme class to <html> so CSS variables switch the palette.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
  }, [theme]);

  const loadData = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const json = await res.json();
      if (json.success) {
        companyRef.current = json.data.company;
        setCompany(json.data.company);
        setAgents(json.data.agents);
        setTasks(json.data.tasks);
        setEvents(json.data.events);
        setMessages(json.data.messages);
        setFiles(json.data.files ?? []);
        // Only refresh the objective from the server if the user isn't drafting
        // a new one (avoids clobbering in-progress input during polling).
        if (!isEditingObjective.current) {
          setObjective(json.data.company.objective ?? '');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company');
    }
  }, []);

  // Load the list of existing companies on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/companies');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setAllCompanies(json.data);
          if (json.data.length > 0 && !companyRef.current) {
            loadData(json.data[0].id);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [loadData]);

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName, description: companyDesc }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      companyRef.current = json.data;
      setCompany(json.data);
      setAllCompanies((prev) => [...prev, json.data]);
      setCompanyName('');
      setCompanyDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${company.id}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          role: agentRole,
          department: agentDepartment,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setAgentName('');
      await loadData(company.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  const startObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !objective.trim()) return;
    setLoading(true);
    setError(null);
    setObjectiveRunning(true);
    try {
      const res = await fetch(`/api/companies/${company.id}/objective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start objective');
      setObjectiveRunning(false);
    } finally {
      setLoading(false);
    }
  };

  const cancelObjective = async () => {
    if (!company) return;
    setError(null);
    // Find the running root task to cancel
    const rootTask = tasks.find((t) => t.title === 'Execute company objective' && !t.parentTaskId);
    if (!rootTask) return;
    try {
      await fetch(`/api/companies/${company.id}/objective/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: rootTask.id }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel objective');
    }
  };

  // Replay a past run by re-submitting its objective.
  const startObjectiveFromReplay = async (companyId: string, objectiveText: string) => {
    setLoading(true);
    setError(null);
    setObjectiveRunning(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/objective`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: objectiveText }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replay objective');
      setObjectiveRunning(false);
    } finally {
      setLoading(false);
    }
  };

  // Start polling when a company is selected
  useEffect(() => {
    if (!company?.id) return;
    loadData(company.id);
    pollTimer.current = setInterval(() => loadData(company.id), 2000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [company?.id, loadData]);

  // Track whether the objective is in progress based on task states
  useEffect(() => {
    if (tasks.some((t) => ['running', 'pending', 'assigned'].includes(t.status))) {
      setObjectiveRunning(true);
    } else if (
      tasks.length > 0 &&
      tasks.every((t) => ['completed', 'failed'].includes(t.status))
    ) {
      setObjectiveRunning(false);
    }
  }, [tasks]);

  return (
    <div className="min-h-screen">
      <Header
        companyName={company?.name}
        running={objectiveRunning}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <main className="mx-auto max-w-7xl px-6 py-8 animate-fade-up">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {!company ? (
          <CreateCompanyPanel
            companyName={companyName}
            setCompanyName={setCompanyName}
            companyDesc={companyDesc}
            setCompanyDesc={setCompanyDesc}
            onSubmit={createCompany}
            loading={loading}
            existingCompanies={allCompanies}
            onSelectCompany={(id) => loadData(id)}
          />
        ) : (
          <div className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <AgentCreatePanel
                agentName={agentName}
                setAgentName={setAgentName}
                agentRole={agentRole}
                setAgentRole={setAgentRole}
                agentDepartment={agentDepartment}
                setAgentDepartment={setAgentDepartment}
                onSubmit={createAgent}
                loading={loading}
              />
              <ObjectivePanel
                objective={objective}
                setObjective={setObjective}
                onFocusChange={(focused) => {
                  isEditingObjective.current = focused;
                }}
                onSubmit={startObjective}
                onCancel={cancelObjective}
                running={objectiveRunning}
                disabled={agents.length === 0}
              />
            </div>

            <BrainWheel
              agents={agents}
              tasks={tasks}
              events={events}
              messages={messages}
            />

            <AgentsSection agents={agents} />

            <WorkspaceSection companyId={company.id} files={files} />

            <div className="grid gap-6 lg:grid-cols-2">
              <TasksSection tasks={tasks} agents={agents} />
              <ActivityFeed events={events} messages={messages} agents={agents} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <MessageViewer messages={messages} agents={agents} />
              <MemoryBrowser companyId={company.id} agents={agents} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <RunHistory
                tasks={tasks}
                events={events}
                agents={agents}
                onReplay={(objective) => {
                  setObjective(objective);
                  void startObjectiveFromReplay(company.id, objective);
                }}
              />
              <TaskTimeline tasks={tasks} agents={agents} />
            </div>

            <LogViewer events={events} agents={agents} />
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function Header({
  companyName,
  running,
  theme,
  onToggleTheme,
}: {
  companyName?: string;
  running: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-chart-1 via-chart-5 to-chart-2 text-sm font-bold text-white shadow-lg shadow-chart-1/30">
            OC
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-chart-2 animate-ping" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              <span className="gradient-text">OpenCorp</span>{' '}
              <span className="text-muted-foreground">/</span>{' '}
              {companyName ?? 'No Company'}
            </h1>
            {running && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-chart-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-chart-1" />
                Running
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleTheme}
            className="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-all hover:border-chart-1 hover:text-foreground hover:shadow-lg shadow-chart-1/20"
            title="Toggle dark/light theme"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          {!companyName && (
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Home
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-6 flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive backdrop-blur-sm">
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-3 text-destructive underline">
        Dismiss
      </button>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-5 shadow-xl shadow-card/20">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CreateCompanyPanel({
  companyName,
  setCompanyName,
  companyDesc,
  setCompanyDesc,
  onSubmit,
  loading,
  existingCompanies,
  onSelectCompany,
}: {
  companyName: string;
  setCompanyName: (v: string) => void;
  companyDesc: string;
  setCompanyDesc: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  existingCompanies: Company[];
  onSelectCompany: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
        {existingCompanies.length > 0 && (
          <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Or open an existing company
            </p>
            <div className="flex flex-wrap gap-2">
              {existingCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectCompany(c.id)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-brand-500 hover:text-brand-300"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <h2 className="mb-1 text-xl font-semibold text-zinc-100">
          Create Your AI Company
        </h2>
        <p className="mb-6 text-sm text-zinc-500">
          Start by creating a company, then add AI employees (agents) to it.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Company Name
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme AI Corp"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Description
            </label>
            <textarea
              value={companyDesc}
              onChange={(e) => setCompanyDesc(e.target.value)}
              placeholder="What does this company do?"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !companyName.trim()}
            className="w-full rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Company'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AgentCreatePanel({
  agentName,
  setAgentName,
  agentRole,
  setAgentRole,
  agentDepartment,
  setAgentDepartment,
  onSubmit,
  loading,
}: {
  agentName: string;
  setAgentName: (v: string) => void;
  agentRole: string;
  setAgentRole: (v: string) => void;
  agentDepartment: string;
  setAgentDepartment: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
  return (
    <Card title="Add an Employee">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Name
          </label>
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="e.g. Alex"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Department
          </label>
          <select
            value={agentDepartment}
            onChange={(e) => setAgentDepartment(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500"
          >
            <option value="engineering">Engineering</option>
            <option value="marketing">Marketing</option>
            <option value="design">Design</option>
            <option value="research">Research</option>
            <option value="qa">QA</option>
            <option value="operations">Operations</option>
            <option value="general">General</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            Role
          </label>
          <select
            value={agentRole}
            onChange={(e) => setAgentRole(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500"
          >
            <option value="CEO">CEO</option>
            <option value="ENGINEER">Engineer</option>
            <option value="RESEARCHER">Researcher</option>
            <option value="QA">QA</option>
            <option value="DESIGNER">Designer</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading || !agentName.trim()}
          className="w-full rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-brand-500 hover:text-brand-300 disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add Agent'}
        </button>
      </form>
    </Card>
  );
}

function ObjectivePanel({
  objective,
  setObjective,
  onFocusChange,
  onSubmit,
  onCancel,
  running,
  disabled,
}: {
  objective: string;
  setObjective: (v: string) => void;
  onFocusChange: (focused: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  running: boolean;
  disabled: boolean;
}) {
  return (
    <Card title="Company Objective">
      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder={
            disabled
              ? 'Add at least a CEO agent first.'
              : 'e.g. Build me a landing page for an AI email automation product.'
          }
          rows={4}
          disabled={disabled || running}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-brand-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || running || !objective.trim()}
          className="w-full rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
        >
          {running ? '● Working...' : '▶ Run Company'}
        </button>
        {running && (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-lg border border-red-700 px-6 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-950/50"
            >
              ■ Stop Run
            </button>
            <p className="text-center text-xs text-brand-400">
              Agents are working. Watch the activity feed below.
            </p>
          </>
        )}
      </form>
    </Card>
  );
}

function AgentsSection({ agents }: { agents: Agent[] }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-zinc-100">
        Agents ({agents.length})
      </h2>
      {agents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No agents yet. Create a CEO and an Engineer to get started.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const stateColors: Record<string, string> = {
    idle: 'bg-zinc-500',
    running: 'bg-brand-500',
    thinking: 'bg-amber-500',
    error: 'bg-red-500',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AgentAvatar name={agent.name} role={agent.role} state={agent.state} />
          <div>
            <p className="font-medium text-zinc-100">{agent.name}</p>
            <p className="text-xs text-zinc-500">{agent.role}</p>
          </div>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-zinc-800 ${
            stateColors[agent.state] ?? 'bg-zinc-500'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {agent.state}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-400">{agent.description}</p>
    </div>
  );
}

function WorkspaceSection({
  companyId,
  files,
}: {
  companyId: string;
  files: WorkspaceFile[];
}) {
  const [dirStack, setDirStack] = useState<string[]>([]);
  const [currentFiles, setCurrentFiles] = useState<WorkspaceFile[]>(files);
  const [loadingDir, setLoadingDir] = useState(false);

  const currentPath = dirStack.join('/');

  // Load a directory's contents. dirPath is relative to the workspace root.
  const loadDir = useCallback(async (dirPath: string) => {
    setLoadingDir(true);
    try {
      const q = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(
        `/api/companies/${companyId}/workspace${q}`,
      );
      const json = await res.json();
      if (json.success) {
        setCurrentFiles(json.data);
      } else {
        setCurrentFiles([]);
      }
    } catch {
      setCurrentFiles([]);
    } finally {
      setLoadingDir(false);
    }
  }, [companyId]);

  // Navigate into a subdirectory.
  const openDir = (name: string) => {
    const next = [...dirStack, name];
    setDirStack(next);
    void loadDir(next.join('/'));
  };

  // Navigate up one level.
  const upDir = () => {
    if (dirStack.length === 0) return;
    const next = dirStack.slice(0, -1);
    setDirStack(next);
    void loadDir(next.join('/'));
  };

  // Reset to the project root.
  const toRoot = () => {
    setDirStack([]);
    void loadDir('');
  };

  // Switch the visible set when the parent-provided root files change
  // (e.g. after a fresh poll/reload) if we're at the root.
  useEffect(() => {
    if (dirStack.length === 0) setCurrentFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // html files at the current level (for quick "View" buttons).
  const currentHtmlFiles = currentFiles.filter(
    (f) => f.type === 'file' && f.name.endsWith('.html'),
  );

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-zinc-100">
        Workspace Deliverables
      </h2>
      {files.length === 0 && dirStack.length === 0 ? (
        <p className="text-sm text-zinc-500">
          The agents haven&apos;t created any files yet. Run an objective and their
          work will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Breadcrumbs / navigation */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={toRoot}
              className="rounded px-2 py-1 font-medium text-zinc-300 hover:bg-zinc-800"
            >
              📁 /workspace
            </button>
            {dirStack.map((seg, i) => {
              const path = dirStack.slice(0, i + 1).join('/');
              return (
                <span key={path} className="flex items-center gap-2">
                  <span className="text-zinc-600">/</span>
                  <button
                    onClick={() => {
                      const next = dirStack.slice(0, i + 1);
                      setDirStack(next);
                      void loadDir(path);
                    }}
                    className="rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800"
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
            {dirStack.length > 0 && (
              <button
                onClick={upDir}
                className="ml-1 rounded border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-brand-500 hover:text-brand-300"
              >
                ← Up
              </button>
            )}
          </div>

          {/* Open the root directory in one click */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() =>
                window.open(
                  `/api/companies/${companyId}/workspace?path=${encodeURIComponent(currentPath || '')}`,
                  '_blank',
                  'noopener,noreferrer',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-brand-500 hover:text-brand-300"
            >
              ⬆ Open {currentPath ? currentPath : 'Project Root'} folder
            </button>
            {currentHtmlFiles.length > 0 && (
              <a
                href={`/api/companies/${companyId}/workspace?path=${encodeURIComponent(
                  currentPath ? `${currentPath}/index.html` : 'index.html',
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
              >
                👁 View {currentHtmlFiles[0].name}
              </a>
            )}
          </div>

          {/* File listing (one level deep) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {currentPath ? `Contents of ${currentPath} (` : 'Files ('}
              {currentFiles.length})
            </p>
            {loadingDir ? (
              <p className="text-sm text-zinc-500">Loading...</p>
            ) : currentFiles.length === 0 ? (
              <p className="text-sm text-zinc-500">This directory is empty.</p>
            ) : (
              <div className="grid gap-1 font-mono text-xs sm:grid-cols-2">
                {currentFiles.map((file) =>
                  file.type === 'directory' ? (
                    <button
                      key={file.path}
                      onClick={() => openDir(file.name)}
                      className="flex items-center gap-2 rounded px-1 py-1 text-left text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-brand-300"
                    >
                      <span>📁</span>
                      <span className="truncate">{file.name}</span>
                      <span className="ml-auto text-zinc-600">/</span>
                    </button>
                  ) : (
                    <a
                      key={file.path}
                      href={`/api/companies/${companyId}/workspace?path=${encodeURIComponent(
                        currentPath ? `${currentPath}/${file.name}` : file.name,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded px-1 py-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      <span>📄</span>
                      <span className="truncate">{file.name}</span>
                    </a>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TasksSection({ tasks, agents }: { tasks: Task[]; agents: Agent[] }) {
  const statusColors: Record<string, string> = {
    pending: 'border-zinc-700 text-zinc-400',
    assigned: 'border-amber-700 text-amber-400',
    running: 'border-brand-500 text-brand-400',
    blocked: 'border-orange-700 text-orange-400',
    completed: 'border-green-700 text-green-400',
    failed: 'border-red-700 text-red-400',
  };

  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'Unassigned';

  return (
    <Card title={`Tasks (${tasks.length})`}>
      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No tasks yet. Run a company objective to create tasks.
        </p>
      ) : (
        <div className="max-h-100 space-y-2 overflow-y-auto pr-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{task.title}</p>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                    statusColors[task.status] ?? 'text-zinc-400'
                  }`}
                >
                  {task.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Assignee: {agentName(task.assignedAgentId)}
              </p>
              {task.result && (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{task.result}</p>
              )}
              {task.error && (
                <p className="mt-1 line-clamp-2 text-xs text-red-400">
                  Error: {task.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ActivityFeed({
  events,
  messages,
  agents,
}: {
  events: SystemEvent[];
  messages: AgentMessage[];
  agents: Agent[];
}) {
  const agentName = (id?: string) =>
    agents.find((a) => a.id === id)?.name ?? 'system';

  const feed: { id: string; ts: string; text: string; color: string }[] = [
    ...events.map((e) => ({
      id: e.id,
      ts: e.timestamp,
      text: formatEvent(e, agentName),
      color: typeColor(e.type),
    })),
    ...messages.map((m) => ({
      id: m.id,
      ts: m.timestamp,
      text: `${agentName(m.senderAgentId)} → ${agentName(m.recipientAgentId)}: ${
        m.content.length > 100 ? m.content.slice(0, 100) + '…' : m.content
      }`,
      color: 'text-purple-400',
    })),
  ]
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .slice(-60)
    .reverse();

  const colorMap: Record<string, string> = {
    green: 'text-green-400',
    red: 'text-red-400',
    brand: 'text-brand-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    zinc: 'text-zinc-400',
  };

  return (
    <Card title="Live Activity">
      {feed.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Activity will appear here as agents work.
        </p>
      ) : (
        <div className="max-h-100 space-y-1.5 overflow-y-auto pr-1 font-mono text-xs">
          {feed.map((item) => (
            <div key={item.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-zinc-600">
                {new Date(item.ts).toLocaleTimeString()}
              </span>
              <span className={colorMap[item.color] ?? 'text-zinc-400'}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function formatEvent(
  event: SystemEvent,
  agentName: (id?: string) => string,
): string {
  const tag = event.agentId ? agentName(event.agentId) : 'company';
  switch (event.type) {
    case 'task.created':
      return `[${tag}] created task "${event.data.title}"`;
    case 'task.started':
      return `[${tag}] started working`;
    case 'task.completed':
      return `[${tag}] completed task`;
    case 'task.failed':
      return `[${tag}] task FAILED: ${event.data.error}`;
    case 'agent.started':
      return `[${tag}] agent went live`;
    case 'agent.thinking':
      return `[${tag}] thinking...`;
    case 'agent.tool_called':
      return `[${tag}] tool → ${event.data.toolName}`;
    case 'agent.tool_completed':
      return `[${tag}] tool done → ${event.data.toolName}`;
    case 'company.objective_set':
      return `[company] objective: ${event.data.objective}`;
    case 'company.completed':
      return `[company] objective complete 🎉`;
    case 'system.info':
      return `[system] ${event.data.message}`;
    case 'agent.message_sent':
      return `[${tag}] sent a message`;
    case 'agent.iteration_limit':
      return `[${tag}] hit iteration limit (${event.data.maxIterations}) — wrapping up`;
    default:
      return `[${tag}] ${event.type}`;
  }
}

function typeColor(t: string): string {
  if (t.includes('completed')) return 'green';
  if (t.includes('failed') || t.includes('error')) return 'red';
  if (t.includes('tool')) return 'brand';
  if (t.includes('message')) return 'purple';
  if (t.includes('thinking') || t.includes('started')) return 'amber';
  return 'zinc';
}
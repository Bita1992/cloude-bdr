import { useEffect, useMemo, useState } from 'react';
import { DailyBriefing } from './DailyBriefing.jsx';
import { MetricGridNew } from './MetricGridNew.jsx';
import { NextTaskHero } from './NextTaskHero.jsx';
import { CelebrationOverlay } from './CelebrationOverlay.jsx';
import { RelatorioDiario } from './relatorio/RelatorioDiario.jsx';
import { useDailyReport, postDailyReportAction } from './relatorio/useDailyReport.js';
import './briefing.css';
import {
  BarChart3,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  UserRoundCheck,
  X
} from 'lucide-react';

const NAV = [
  { id: 'execution', label: 'Execução BDR', icon: Target },
  { id: 'funnels', label: 'Funis', icon: GitBranch },
  { id: 'enrichment', label: 'Enriquecimento', icon: ShieldCheck },
  { id: 'agenda', label: 'Tarefas', icon: CalendarClock },
  { id: 'messages', label: 'Mensagens', icon: MessageSquare },
  { id: 'cadences', label: 'Cadências', icon: RefreshCcw },
  { id: 'leads', label: 'Lead 360', icon: Search },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'crm', label: 'CRM Closer', icon: UserRoundCheck },
  { id: 'report', label: 'Relatório', icon: FileText },
  { id: 'settings', label: 'Config. 3C+', icon: Settings }
];

const TYPE_LABEL = {
  ENRICHMENT: 'Enriquecimento',
  CALL: 'Ligação',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  LINKEDIN: 'LinkedIn',
  FOLLOW_UP: 'Follow-up',
  MEETING_CONFIRMATION: 'Confirmação',
  CLOSER_FOLLOW_UP: 'Closer'
};

const STAGE_LABEL = {
  MEETING_SCHEDULED: 'Reunião agendada',
  MEETING_DONE: 'Reunião ocorrida',
  DIAGNOSIS_DONE: 'Diagnóstico',
  PROPOSAL_SENT: 'Proposta enviada',
  PROPOSAL_FOLLOW_UP: 'Follow-up proposta',
  NEGOTIATION: 'Negociação',
  CLOSED_WON: 'Ganho',
  CLOSED_LOST: 'Perdido'
};

const THREEC_CLASSIFICATION_LABEL = {
  connected: 'Conectou',
  meeting: 'Agendou',
  follow: 'Follow',
  no_answer: 'Não atendeu',
  voicemail: 'Caixa postal',
  phone_invalid: 'Telefone inválido',
  phone_no_link: 'Sem vínculo',
  not_interested: 'Sem interesse',
  out_of_icp: 'Fora do ICP',
  gatekeeper: 'Gatekeeper',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  unknown: 'Desconhecido'
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Erro ${response.status}`);
    error.status = response.status;
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cloud-bdr-auth-expired'));
    }
    throw error;
  }
  return data;
}

function taskIdFromQuery() {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('task');
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function taskExecutionUrl(taskId) {
  if (!taskId) return '/';
  if (typeof window === 'undefined') return `/?task=${taskId}&mode=execute`;
  const url = new URL(window.location.href);
  url.searchParams.set('task', taskId);
  url.searchParams.set('mode', 'execute');
  return `${url.pathname}${url.search}${url.hash}`;
}

function clearTaskQuery() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('task');
  url.searchParams.delete('mode');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : '';
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function primaryName(lead) {
  return lead?.contacts?.[0]?.name || '[Nome]';
}

function companyNameFromTask(task) {
  return task?.trade_name || task?.legal_name || 'Lead';
}

function companyNameFromLead(lead) {
  return lead?.trade_name || lead?.legal_name || 'Lead';
}

function replaceTemplate(template, task, lead) {
  return String(template || '')
    .replaceAll('[Nome]', primaryName(lead))
    .replaceAll('[Empresa]', companyNameFromTask(task) || companyNameFromLead(lead));
}

function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

function App() {
  const [dark, toggleDark] = useDarkMode();
  const [auth, setAuth] = useState({ checking: true, authenticated: false, user: null });
  const [view, setView] = useState('execution');
  const [boot, setBoot] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [funnelDashboard, setFunnelDashboard] = useState(null);
  const [closerDashboard, setCloserDashboard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTaskData, setSelectedTaskData] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusStartTaskId, setFocusStartTaskId] = useState(null);
  const [focusFilterTypes, setFocusFilterTypes] = useState([]);
  const [focusBlockLabel, setFocusBlockLabel] = useState('');

  async function loadShell({ respectUrlTask = true } = {}) {
    const [bootstrap, bdr, funnels, closer, today] = await Promise.all([
      api('/api/bootstrap'),
      api('/api/dashboard/bdr'),
      api('/api/dashboard/funnels'),
      api('/api/dashboard/closer'),
      api('/api/tasks/today')
    ]);
    setBoot(bootstrap);
    setDashboard(bdr);
    setFunnelDashboard(funnels);
    setCloserDashboard(closer);
    setTasks(today);
    const urlTaskId = respectUrlTask ? taskIdFromQuery() : null;
    const nextTaskId = urlTaskId || selectedTaskId || today[0]?.id || null;
    if (nextTaskId) setSelectedTaskId(Number(nextTaskId));
    else setSelectedTaskId(null);
    return { bootstrap, bdr, funnels, closer, today };
  }

  function clearAppState() {
    setBoot(null);
    setDashboard(null);
    setFunnelDashboard(null);
    setCloserDashboard(null);
    setTasks([]);
    setSelectedTaskId(null);
    setSelectedTaskData(null);
  }

  async function handleLogin(credentials) {
    const result = await api('/api/auth/login', { method: 'POST', body: credentials });
    setAuth({ checking: false, authenticated: true, user: result.user });
    await loadShell();
    setToast('Login realizado.');
  }

  async function handleLogout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    clearAppState();
    setAuth({ checking: false, authenticated: false, user: null });
    setToast('');
  }

  function selectTask(taskId, { replace = false } = {}) {
    if (!taskId) return;
    const numericTaskId = Number(taskId);
    setSelectedTaskId(numericTaskId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('task', numericTaskId);
      url.searchParams.set('mode', 'execute');
      window.history[replace ? 'replaceState' : 'pushState']({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }

  async function openTask(taskId) {
    if (!taskId) return;
    const numericTaskId = Number(taskId);
    setSelectedTaskId(numericTaskId);
    const data = await api(`/api/tasks/${numericTaskId}`);
    setSelectedTaskData(data);
  }

  async function reloadSelectedTask() {
    if (!selectedTaskId) return;
    await openTask(selectedTaskId);
  }

  useEffect(() => {
    let active = true;
    const handleExpired = () => {
      clearAppState();
      setAuth({ checking: false, authenticated: false, user: null });
      setToast('Sessão expirada. Faça login novamente.');
    };
    window.addEventListener('cloud-bdr-auth-expired', handleExpired);
    api('/api/auth/session')
      .then(async (session) => {
        if (!active) return;
        const authenticated = session.authenticated || session.authEnabled === false;
        setAuth({ checking: false, authenticated, user: session.user });
        if (authenticated) await loadShell();
      })
      .catch((error) => {
        if (!active) return;
        setAuth({ checking: false, authenticated: false, user: null });
        setToast(error.message);
      });
    return () => {
      active = false;
      window.removeEventListener('cloud-bdr-auth-expired', handleExpired);
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const taskId = taskIdFromQuery();
      if (taskId) {
        setView('execution');
        setSelectedTaskId(taskId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (selectedTaskId) openTask(selectedTaskId).catch((error) => setToast(error.message));
  }, [selectedTaskId]);

  async function refreshAfterAction(message) {
    const completedTaskId = selectedTaskId;
    const { today } = await loadShell({ respectUrlTask: false });
    const nextTask = today.find((task) => task.id !== completedTaskId) || today[0];
    if (nextTask) selectTask(nextTask.id, { replace: true });
    else {
      setSelectedTaskId(null);
      setSelectedTaskData(null);
      clearTaskQuery();
    }
    setToast(message);
  }

  function startFocus(taskId, filterTypes = [], blockLabel = '') {
    setFocusStartTaskId(taskId ?? tasks[0]?.id ?? null);
    setFocusFilterTypes(filterTypes ?? []);
    setFocusBlockLabel(blockLabel ?? '');
    setFocusMode(true);
  }

  if (auth.checking) return <AuthLoading />;

  if (!auth.authenticated) {
    return <LoginView onLogin={handleLogin} toast={toast} setToast={setToast} />;
  }

  const username = auth.user?.username || 'BDR';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── CelebrationOverlay (sempre por cima) ── */}
      {celebrating && (
        <CelebrationOverlay
          meetingsTotal={dashboard?.meetings ?? 0}
          onDone={() => setCelebrating(false)}
        />
      )}

      {/* ── Modo Foco (full-screen z-50) ── */}
      {focusMode && (
        <FocusMode
          tasks={tasks}
          startTaskId={focusStartTaskId}
          filterTypes={focusFilterTypes}
          blockLabel={focusBlockLabel}
          onExit={() => setFocusMode(false)}
          onCelebrate={() => setCelebrating(true)}
          onRefreshShell={() => loadShell({ respectUrlTask: false }).catch((e) => setToast(e.message))}
          setToast={setToast}
        />
      )}

      {/* ── TopBar ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-[1600px] px-5 h-14 flex items-center gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative h-7 w-7 rounded-md bg-primary/15 border border-primary/40 grid place-items-center">
              <span className="h-2 w-2 rounded-full bg-primary" />
            </div>
            <span className="font-semibold text-lg leading-none tracking-tight">
              Cloud <span className="text-primary">BDR</span>
            </span>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-0.5 ml-4 text-sm">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-surface-2 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface'
                  }`}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Leads count badge */}
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {boot?.counts?.leads ?? '-'} leads
            </span>

            {/* Refresh */}
            <button
              className="h-8 w-8 grid place-items-center rounded-md border border-border bg-surface hover:bg-surface-2 transition-colors text-muted-foreground hover:text-foreground"
              onClick={() => loadShell().catch((error) => setToast(error.message))}
              title="Atualizar"
            >
              <RefreshCcw size={15} />
            </button>

            {/* Logout */}
            <button
              className="h-8 w-8 grid place-items-center rounded-md border border-border bg-surface hover:bg-surface-2 transition-colors text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
              title="Sair"
            >
              <LogOut size={15} />
            </button>

            {/* Avatar */}
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/60 to-info/60 grid place-items-center text-[11px] font-bold text-primary-foreground">
              {initials}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="mx-auto max-w-[1600px] px-5 py-5 flex flex-col gap-4">
        {toast && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 text-warning px-4 py-3 text-sm font-medium">
            <span>{toast}</span>
            <button
              onClick={() => setToast('')}
              className="shrink-0 h-6 w-6 grid place-items-center rounded-md hover:bg-warning/20 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {view === 'execution' && (
          <ExecutionView
            dashboard={dashboard}
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={selectTask}
            selectedTaskData={selectedTaskData}
            loading={loading}
            setLoading={setLoading}
            onDone={refreshAfterAction}
            onCelebrate={() => setCelebrating(true)}
            onReloadTask={reloadSelectedTask}
            setToast={setToast}
            onStartFocus={startFocus}
          />
        )}
        {view === 'enrichment' && <QueueView type="ENRICHMENT" onSelectTask={selectTask} setView={setView} setToast={setToast} />}
        {view === 'funnels' && <FunnelsView data={funnelDashboard} onSelectTask={selectTask} setView={setView} />}
        {view === 'agenda' && <AgendaView onSelectTask={selectTask} setView={setView} setToast={setToast} onStartFocus={startFocus} />}
        {view === 'messages' && <MensagensView setToast={setToast} onSelectTask={selectTask} setView={setView} />}
        {view === 'cadences' && <CadenceView setToast={setToast} />}
        {view === 'leads' && <LeadSearchView setToast={setToast} />}
        {view === 'dashboard' && <DashboardView dashboard={dashboard} closerDashboard={closerDashboard} />}
        {view === 'crm' && <CrmView setToast={setToast} />}
        {view === 'report' && <RelatorioView />}
        {view === 'settings' && <SettingsView config={boot?.threeC} />}
      </main>
    </div>
  );
}

function AuthLoading() {
  return (
    <div className="min-h-screen bg-background grid place-items-center">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="relative h-10 w-10 rounded-xl bg-primary/15 border border-primary/40 grid place-items-center">
          <span className="h-3 w-3 rounded-full bg-primary animate-pulse" />
        </div>
        <p className="text-sm">Carregando sessão...</p>
      </div>
    </div>
  );
}

function LoginView({ onLogin, toast, setToast }) {
  const [username, setUsername] = useState('bdr');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setToast('');
    try {
      await onLogin({ username, password });
    } catch (error) {
      setToast(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background grid place-items-center px-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

        <div className="relative p-8 flex flex-col gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/40 grid place-items-center">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            </div>
            <div>
              <div className="font-semibold text-lg leading-none">
                Cloud <span className="text-primary">BDR</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Sales engagement</div>
            </div>
          </div>

          {/* Title */}
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-primary font-semibold">Acesso interno</div>
              <h1 className="text-2xl font-bold mt-0.5 leading-none">Login BDR</h1>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring transition-colors"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Senha</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring transition-colors"
              />
            </label>

            {toast && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-sm font-medium">
                {toast}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition disabled:opacity-50 disabled:cursor-wait glow-primary mt-1"
            >
              <Check size={16} />
              {pending ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ExecutionView({ dashboard, tasks, selectedTaskId, onSelectTask, selectedTaskData, loading, setLoading, onDone, onCelebrate, onReloadTask, setToast, onStartFocus }) {
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const grouped = useMemo(() => {
    const buckets = {
      ENRICHMENT: [],
      CALL: [],
      MESSAGE: [],
      FOLLOW: [],
      CLOSER: []
    };
    tasks.forEach((task) => {
      if (task.type === 'ENRICHMENT') buckets.ENRICHMENT.push(task);
      else if (task.type === 'CALL') buckets.CALL.push(task);
      else if (['WHATSAPP', 'EMAIL', 'LINKEDIN'].includes(task.type)) buckets.MESSAGE.push(task);
      else if (['FOLLOW_UP', 'MEETING_CONFIRMATION'].includes(task.type)) buckets.FOLLOW.push(task);
      else buckets.CLOSER.push(task);
    });
    return buckets;
  }, [tasks]);

  const queueSummary = [
    ['ENRICHMENT', 'Enriq.', grouped.ENRICHMENT.length],
    ['CALL', 'Ligar', grouped.CALL.length],
    ['MESSAGE', 'Msgs', grouped.MESSAGE.length],
    ['FOLLOW', 'Follow', grouped.FOLLOW.length],
    ['CLOSER', 'Closer', grouped.CLOSER.length]
  ];

  return (
    <>
      <DayPlan tasks={tasks} onStartFocus={onStartFocus} />
      <DailyBriefing dashboard={dashboard} userName="Luciano" onStartFocus={() => onStartFocus(tasks[0]?.id, [], '')} />
      <MetricGridNew dashboard={dashboard} />
      <NextTaskHero
        task={tasks[0]}
        onExecute={(t) => onStartFocus(t?.id ?? tasks[0]?.id, [], '')}
        onSkip={() => onSelectTask(tasks[1]?.id ?? tasks[0]?.id)}
      />

      <div className="grid gap-4" style={{ gridTemplateColumns: queueCollapsed ? '72px 1fr' : 'minmax(280px,320px) 1fr' }}>
        {/* ── Queue panel ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden self-start sticky top-20">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            {!queueCollapsed && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary font-semibold">Hoje</div>
                <div className="font-semibold text-sm mt-0.5">Fila de tarefas</div>
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {!queueCollapsed && (
                <span className="rounded-full bg-primary/15 text-primary text-[11px] font-bold px-2 py-0.5">{tasks.length}</span>
              )}
              <button
                type="button"
                className="h-7 w-7 grid place-items-center rounded-md border border-border bg-surface hover:bg-surface-2 transition-colors text-muted-foreground"
                onClick={() => setQueueCollapsed((c) => !c)}
                title={queueCollapsed ? 'Expandir fila' : 'Recolher fila'}
              >
                {queueCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </button>
            </div>
          </div>

          {/* Body */}
          {queueCollapsed ? (
            <div className="flex flex-col gap-1.5 p-2">
              {queueSummary.map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQueueCollapsed(false)}
                  className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors py-2.5"
                >
                  <strong className="text-primary text-base font-bold font-mono">{count}</strong>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
              <TaskGroup title="Enriquecer"           tasks={grouped.ENRICHMENT} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
              <TaskGroup title="Ligar"                tasks={grouped.CALL}       selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
              <TaskGroup title="Mensagens"            tasks={grouped.MESSAGE}    selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
              <TaskGroup title="Follow-ups e reuniões" tasks={grouped.FOLLOW}   selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
              <TaskGroup title="Closer"               tasks={grouped.CLOSER}    selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
            </div>
          )}
        </section>

        {/* ── Workbench ── */}
        <TaskWorkbench
          data={selectedTaskData}
          loading={loading}
          setLoading={setLoading}
          onDone={onDone}
          onCelebrate={onCelebrate}
          onReloadTask={onReloadTask}
          setToast={setToast}
        />
      </div>
    </>
  );
}

function MetricGrid({ dashboard }) {
  const metrics = [
    ['Leads', dashboard?.leads, 'border-border'],
    ['Abertas', dashboard?.openTasks, 'border-border'],
    ['Hoje', dashboard?.dueToday, 'border-info/30'],
    ['Atrasadas', dashboard?.overdue, 'border-hot/30 bg-hot/5'],
    ['Ligações feitas', dashboard?.callsDoneToday, 'border-border'],
    ['Significativas', dashboard?.significantCallsToday, 'border-success/30'],
    ['Não significativas', dashboard?.nonSignificantCallsToday, 'border-border'],
    ['Reuniões', dashboard?.meetings, 'border-primary/30 bg-primary/5'],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map(([label, value, accent]) => (
        <div key={label} className={`rounded-xl border ${accent} bg-card p-4`}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-mono text-2xl font-semibold mt-1">{value ?? '-'}</div>
        </div>
      ))}
    </div>
  );
}

const TASK_BADGE_COLORS = {
  CALL:                 'bg-info/10 text-info border-info/20',
  WHATSAPP:             'bg-success/10 text-success border-success/20',
  EMAIL:                'bg-primary/10 text-primary border-primary/20',
  LINKEDIN:             'bg-info/10 text-info border-info/20',
  FOLLOW_UP:            'bg-warning/10 text-warning border-warning/20',
  MEETING_CONFIRMATION: 'bg-success/10 text-success border-success/20',
  CLOSER_FOLLOW_UP:     'bg-success/10 text-success border-success/20',
  ENRICHMENT:           'bg-surface-2 text-muted-foreground border-border',
};

function TaskGroup({ title, tasks, selectedTaskId, onSelectTask }) {
  return (
    <div className="border-t border-border first:border-t-0 pt-1 mt-1 first:pt-0 first:mt-0">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{title}</span>
        <span className="text-[10px] font-mono text-primary font-bold">{tasks.length}</span>
      </div>
      {tasks.slice(0, 10).map((task) => {
        const selected = selectedTaskId === task.id;
        return (
          <button
            key={task.id}
            className={`group w-full text-left flex items-start justify-between gap-2 px-3 py-2.5 transition-colors ${
              selected
                ? 'bg-primary/10 border-l-2 border-primary'
                : 'hover:bg-surface border-l-2 border-transparent'
            }`}
            onClick={() => onSelectTask(task.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{companyNameFromTask(task)}</div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${TASK_BADGE_COLORS[task.type] || TASK_BADGE_COLORS.ENRICHMENT}`}>
                  {TYPE_LABEL[task.type]}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">{task.title}</span>
              </div>
            </div>
            <time className="text-[10px] text-warning font-mono shrink-0 mt-0.5">{formatDate(task.due_at)}</time>
          </button>
        );
      })}
      {!tasks.length && <p className="px-3 py-2 text-xs text-muted-foreground italic">Sem tarefas nesse bloco.</p>}
    </div>
  );
}

function TaskWorkbench({ data, loading, setLoading, onDone, onCelebrate, onReloadTask, setToast }) {
  const task = data?.task;
  const lead = data?.lead;
  const [fields, setFields] = useState({});
  const [callId, setCallId] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (!task) return;
    const base = {
      phone: task.primary_phone || lead?.phones?.[0]?.phone || '',
      recipient_email: '',
      subject: '',
      conversation_note: '',
      reason: '',
      followup_at: '',
      meeting_at: '',
      value: '',
      expected_close_at: ''
    };
    setFields({ ...base, ...(lead?.enrichment || {}), ...(task.fields || {}) });
    setCallId('');
  }, [task?.id]);

  if (!task) {
    return (
      <section className="workbench empty-state">
        <Clock3 size={28} />
        <h2>Nenhuma tarefa selecionada</h2>
        <p>Selecione uma tarefa da fila para executar.</p>
      </section>
    );
  }

  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function selectPhone(phone) {
    update('phone', phone);
    setToast(`Telefone ${phone} selecionado para a ligação.`);
  }

  async function saveDraft() {
    if (!task) return;
    setSavingDraft(true);
    try {
      const response = await api(`/api/tasks/${task.id}/fields`, {
        method: 'PATCH',
        body: { fields: { ...fields, ...(callId ? { call_id: callId } : {}) } }
      });
      setFields((current) => ({ ...current, ...(response.task?.fields || {}) }));
      if (onReloadTask) await onReloadTask();
      setToast('Rascunho salvo nesta tarefa.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setSavingDraft(false);
    }
  }

  async function complete(outcome) {
    setLoading(true);
    try {
      await api(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        body: { outcome, fields: { ...fields, ...(callId ? { call_id: callId } : {}) } }
      });
      if (outcome === 'meeting_scheduled' || outcome === 'meeting_happened') {
        onCelebrate?.();
      }
      await onDone('Tarefa concluída e próxima ação criada.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function startCall() {
    const phone = fields.phone || task.primary_phone;
    if (!phone) {
      setToast('Escolha um telefone para ligar.');
      return;
    }
    setLoading(true);
    try {
      const response = await api('/api/3c/manual-call/start', {
        method: 'POST',
        body: { taskId: task.id, leadId: task.lead_id, phone }
      });
      setCallId(response.callId || '');
      setToast('Ligação enviada para a 3C+.');
    } catch (error) {
      setToast(`${error.message}. Use o telefone local como fallback.`);
    } finally {
      setLoading(false);
    }
  }

  const template = replaceTemplate(task.payload?.messageTemplate, task, lead);
  const subject = replaceTemplate(task.payload?.subjectTemplate, task, lead);
  const primaryPhone = fields.phone || task.primary_phone;

  return (
    <section className="workbench cockpit-workbench">
      <div className="lead-header">
        <div>
          <span className="eyebrow">{TYPE_LABEL[task.type]}</span>
          <h2>{companyNameFromTask(task)}</h2>
          <p>{lead?.cnpj} · {lead?.city || 'Cidade não informada'}</p>
        </div>
        <div className="lead-state">
          <span>{lead?.state}</span>
          <strong>{task.title}</strong>
          <a className="task-open-link" href={taskExecutionUrl(task.id)} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Nova aba
          </a>
        </div>
      </div>

      <div className="context-strip">
        <span>Prazo: {formatDate(task.due_at)}</span>
        {task.attempt_number && <span>Tentativa do sistema: {task.attempt_number}</span>}
        {lead?.cnpj && <span className="copy-chip">CNPJ: {lead.cnpj}<CopyButton value={lead.cnpj} label="Copiar CNPJ" setToast={setToast} /></span>}
        {primaryPhone && <span className="copy-chip">Telefone: {primaryPhone}<CopyButton value={primaryPhone} label="Copiar telefone" setToast={setToast} /></span>}
      </div>

      {task.type === 'CALL' && <CallPrepPanel lead={lead} primaryPhone={primaryPhone} setToast={setToast} />}

      <div className="task-script">
        <strong>Roteiro da tarefa</strong>
        <p>{scriptFor(task.type, task)}</p>
      </div>

      <TaskFields
        task={task}
        lead={lead}
        fields={fields}
        update={update}
        template={template}
        subject={subject}
        startCall={startCall}
        callId={callId}
        loading={loading}
      />

      <LeadDataPanel lead={lead} selectedPhone={primaryPhone} onSelectPhone={selectPhone} setToast={setToast} />

      <OutcomeBar task={task} complete={complete} loading={loading} onSaveDraft={saveDraft} savingDraft={savingDraft} />
    </section>
  );
}

function scriptFor(type, task) {
  if (type === 'ENRICHMENT') return 'Validar fit, telefone, decisor, canal social, contexto e hipótese de dor antes de liberar a cadência fria.';
  if (type === 'CALL') return 'Abrir curto, confirmar decisor, contextualizar o motivo comercial e tabular o resultado real da chamada.';
  if (type === 'WHATSAPP') return 'Enviar a mensagem pronta, registrar envio e interromper a cadência se houver resposta com interesse ou objeção clara.';
  if (type === 'EMAIL' && task.payload?.funnel === 'EMAIL_FUNNEL') return 'Executar o funil de e-mail gerado pela ligação: assunto, contexto da tentativa, envio e próxima etapa automática.';
  if (type === 'EMAIL') return 'Enviar e-mail curto com contexto, sem transformar a tarefa em redação manual.';
  if (type === 'LINKEDIN') return 'Checar decisor e sinal público relevante. Se fizer conexão ou abordagem, registrar como feito.';
  if (type === 'FOLLOW_UP') return 'Cumprir o combinado de retorno. Se houver nova data prometida, registrar data e hora.';
  if (type === 'MEETING_CONFIRMATION') return 'Confirmar presença, participantes, dor e briefing mínimo para o closer conduzir.';
  if (type === 'CLOSER_FOLLOW_UP') return 'Executar próximo passo comercial depois da reunião: proposta, objeção, valor e previsão.';
  return task.title;
}

function CopyButton({ value, label, setToast }) {
  async function copy(event) {
    event.stopPropagation();
    const text = String(value || '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label || 'Valor'} copiado.`);
    } catch {
      setToast('Não consegui copiar automaticamente.');
    }
  }
  return (
    <button className="copy-button" type="button" onClick={copy} title={label || 'Copiar'}>
      <Copy size={13} />
    </button>
  );
}

function phoneStatusText(phone) {
  const status = {
    UNVALIDATED: 'não validado',
    ENRICHED_UNVALIDATED: 'enriquecido',
    VALID_DECISION_MAKER: 'decisor',
    CONTACTED: 'contatado',
    INVALID: 'inválido',
    NO_LINK: 'sem vínculo',
    GATEKEEPER: 'gatekeeper'
  };
  const relation = {
    UNKNOWN: 'sem vínculo confirmado',
    DECISION_MAKER: 'telefone do decisor',
    COMPANY: 'empresa',
    GATEKEEPER: 'gatekeeper',
    NO_LINK: 'sem vínculo',
    INVALID: 'inválido'
  };
  return [status[phone.status] || phone.status || 'não validado', relation[phone.relationship] || phone.relationship].filter(Boolean).join(' · ');
}

const ENRICHMENT_VIEW_FIELDS = [
  ['decision_maker', 'Decisor'],
  ['decision_role', 'Cargo'],
  ['site', 'Site'],
  ['instagram', 'Instagram'],
  ['linkedin_company', 'LinkedIn'],
  ['recipient_email', 'E-mail'],
  ['phone_found', 'Telefone encontrado'],
  ['alternate_phone', 'Telefone alternativo'],
  ['phone_source', 'Fonte do telefone'],
  ['rapport', 'Rapport / gancho'],
  ['pain_hypothesis', 'Hipótese de dor'],
  ['notes', 'Observação da pesquisa']
];

function presentValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function buildEnrichmentEntries(enrichment = {}) {
  const entries = ENRICHMENT_VIEW_FIELDS
    .map(([key, label]) => ({ key, label, value: enrichment[key] }))
    .filter((item) => presentValue(item.value));
  const knownValues = new Set(entries.map((item) => String(item.value).trim()));
  const derivedLinks = [enrichment.notes, enrichment.rapport, enrichment.pain_hypothesis]
    .flatMap(extractUrls)
    .filter((url, index, list) => list.indexOf(url) === index && !knownValues.has(url));
  return [
    ...entries,
    ...derivedLinks.map((url) => ({
      key: labelKeyForUrl(url),
      label: labelForUrl(url),
      value: url
    }))
  ];
}

function extractUrls(value) {
  return String(value || '').match(/https?:\/\/[^\s)]+/g) || [];
}

function labelKeyForUrl(url) {
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/linkedin\.com/i.test(url)) return 'linkedin_company';
  return 'site';
}

function labelForUrl(url) {
  if (/instagram\.com/i.test(url)) return 'Instagram encontrado';
  if (/linkedin\.com/i.test(url)) return 'LinkedIn encontrado';
  return 'Site encontrado';
}

function externalHref(key, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let href = extractUrls(text)[0] || text;
  if (key === 'instagram' && text.startsWith('@')) href = `https://instagram.com/${text.slice(1)}`;
  if (key === 'instagram' && !text.includes('/') && !text.includes(' ') && !text.includes('@')) href = `https://instagram.com/${text}`;
  if (key === 'linkedin_company' && !text.startsWith('http') && text.includes('linkedin.com')) href = `https://${text}`;
  if ((key === 'site' || key === 'linkedin_company' || key === 'instagram') && href.startsWith('www.')) href = `https://${href}`;
  if ((key === 'site' || key === 'linkedin_company' || key === 'instagram') && href.startsWith('http')) {
    try {
      return new URL(href).toString();
    } catch {
      return '';
    }
  }
  return '';
}

function ResearchItem({ item, setToast, compact = false }) {
  const href = externalHref(item.key, item.value);
  return (
    <div className={`research-item ${compact ? 'compact' : ''} ${String(item.value).length > 90 ? 'large' : ''}`}>
      <span>{item.label}</span>
      <strong>{String(item.value)}</strong>
      <div className="research-actions">
        <CopyButton value={item.value} label={item.label} setToast={setToast} />
        {href && (
          <a href={href} target="_blank" rel="noreferrer" title={`Abrir ${item.label}`}>
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function CallPrepPanel({ lead, primaryPhone, setToast }) {
  const enrichment = lead?.enrichment || {};
  const links = buildEnrichmentEntries(enrichment).filter((item) => externalHref(item.key, item.value));
  const latestContext = lead?.recentContext?.[0]?.note || '';
  return (
    <div className="call-prep-panel">
      <div className="prep-card">
        <span>Decisor</span>
        <strong>{enrichment.decision_maker || primaryName(lead)}</strong>
        <small>{enrichment.decision_role || 'Cargo não validado'}{primaryPhone ? ` · ${primaryPhone}` : ''}</small>
      </div>
      <div className="prep-card emphasis">
        <span>Gancho de abertura</span>
        <strong>{enrichment.rapport || 'Sem gancho salvo. Use o segmento e a cidade como abertura.'}</strong>
      </div>
      <div className="prep-card">
        <span>Dor provável</span>
        <strong>{enrichment.pain_hypothesis || enrichment.notes || latestContext || 'Validar geração previsível de oportunidades e dependência dos canais atuais.'}</strong>
      </div>
      <div className="prep-card prep-links">
        <span>Canais pesquisados</span>
        {links.length ? links.map((item) => <ResearchItem key={item.key} item={item} setToast={setToast} compact />) : <strong>Site, Instagram e LinkedIn ainda não salvos.</strong>}
      </div>
    </div>
  );
}

function LeadDataPanel({ lead, selectedPhone, onSelectPhone, setToast }) {
  const [note, setNote] = useState('');
  const [localNotes, setLocalNotes] = useState([]);
  const [activeTab, setActiveTab] = useState('context');
  useEffect(() => {
    setLocalNotes([]);
    setNote('');
    setActiveTab('context');
  }, [lead?.id]);

  async function addNote() {
    if (!note.trim()) return;
    try {
      const saved = await api(`/api/leads/${lead.id}/notes`, { method: 'POST', body: { body: note, note_type: 'MANUAL' } });
      setLocalNotes((current) => [{ created_at: saved.created_at, title: 'MANUAL', note: saved.body }, ...current]);
      setNote('');
      setToast('Nota adicionada ao lead.');
    } catch (error) {
      setToast(error.message);
    }
  }

  const rawEntries = Object.entries(lead?.rawData || {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  const contextItems = [...localNotes, ...(lead?.recentContext || [])];
  const enrichmentEntries = buildEnrichmentEntries(lead?.enrichment || {});
  const tabs = [
    ['context', 'Contexto', contextItems.length],
    ['research', 'Pesquisa', enrichmentEntries.length],
    ['phones', 'Telefones', lead?.phones?.length || 0],
    ['recordings', 'Ligações', lead?.recordings?.length || 0],
    ['contacts', 'Sócios', lead?.contacts?.length || 0],
    ['timeline', 'Timeline', lead?.timeline?.length || 0],
    ['raw', 'Planilha', rawEntries.length]
  ];

  function handlePhoneSelect(phone) {
    if (!onSelectPhone) return;
    onSelectPhone(phone);
  }

  return (
    <div className="lead-data-panel tabbed-context-panel">
      <div className="context-panel-head">
        <div>
          <span className="eyebrow">Painel contextual</span>
          <strong>Pesquisa, telefones, sócios e histórico do lead</strong>
        </div>
        <span className="pill">{lead?.openTasks?.length || 0} abertas</span>
      </div>

      <div className="context-tab-list" role="tablist" aria-label="Dados do lead">
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={activeTab === id ? 'active' : ''}
            onClick={() => setActiveTab(id)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="context-tab-panel" role="tabpanel">
        {activeTab === 'context' && (
          <div className="lead-data-section">
            <div className="mini-head">
              <strong>Contexto recente</strong>
              <span>{contextItems.length}</span>
            </div>
            {contextItems.slice(0, 6).map((item, index) => (
              <div className="context-note" key={`${item.created_at}-${index}`}>
                <small>{formatDate(item.created_at)} · {item.title}</small>
                <span>{item.note}</span>
              </div>
            ))}
            {!contextItems.length && <p className="empty-line">Sem notas anteriores para este lead.</p>}
            <div className="quick-note">
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Adicionar nota rápida" />
              <button type="button" onClick={addNote}>Salvar</button>
            </div>
          </div>
        )}

        {activeTab === 'research' && (
          <div className="lead-data-section research-section">
            <div className="mini-head">
              <strong>Pesquisa BDR</strong>
              <span>{enrichmentEntries.length}</span>
            </div>
            {enrichmentEntries.length ? (
              <div className="research-grid">
                {enrichmentEntries.map((item) => <ResearchItem key={item.key} item={item} setToast={setToast} />)}
              </div>
            ) : (
              <p className="empty-line">Sem pesquisa salva ainda para este lead.</p>
            )}
          </div>
        )}

        {activeTab === 'phones' && (
          <div className="lead-data-section">
            <div className="mini-head">
              <strong>Telefones do lead</strong>
              <span>{lead?.phones?.length || 0}</span>
            </div>
            <div className="phone-grid">
              {(lead?.phones || []).map((phone) => {
                const selected = String(phone.phone) === String(selectedPhone);
                return (
                  <div
                    className={`phone-card ${selected ? 'selected' : ''} ${phone.do_not_call ? 'blocked' : ''} ${onSelectPhone ? 'actionable' : ''}`}
                    key={phone.id}
                    role={onSelectPhone ? 'button' : undefined}
                    tabIndex={onSelectPhone ? 0 : undefined}
                    onClick={() => handlePhoneSelect(phone.phone)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') handlePhoneSelect(phone.phone);
                    }}
                  >
                    <div className="phone-card-head">
                      <strong>{phone.phone}</strong>
                      <CopyButton value={phone.phone} label="Telefone" setToast={setToast} />
                    </div>
                    <span>{phone.source || 'base'} · {phoneStatusText(phone)}</span>
                    {phone.owner_name && <small>Dono: {phone.owner_name}</small>}
                    {phone.validation_note && <small>{phone.validation_note}</small>}
                    {phone.do_not_call ? <small className="danger-text">não ligar novamente</small> : null}
                    {onSelectPhone && (
                      <button
                        className="phone-select-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePhoneSelect(phone.phone);
                        }}
                      >
                        {selected ? 'Selecionado' : 'Usar na ligação'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="lead-data-section">
            <div className="mini-head">
              <strong>Sócios e contatos</strong>
              <span>{lead?.contacts?.length || 0}</span>
            </div>
            <div className="compact-list">
              {(lead?.contacts || []).map((contact) => (
                <div className="compact-row" key={contact.id}>
                  <span>{contact.name}</span>
                  <small>{contact.role || 'Contato'}{contact.cpf ? ` · ${contact.cpf}` : ''}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'recordings' && (
          <div className="lead-data-section">
            <div className="mini-head">
              <strong>Ligações</strong>
              <span>{lead?.recordings?.length || 0}</span>
            </div>
            {(lead?.recordings || []).length ? (
              <div className="recording-list">
                {(lead?.recordings || []).map((rec) => (
                  <div className="recording-item" key={rec.id}>
                    <div className="recording-item-head">
                      <strong>{rec.phone} · {rec.qualification || rec.classification || 'ligação'}</strong>
                      <small>{formatDate(rec.created_at)}{rec.duration_seconds ? ` · ${rec.duration_seconds}s` : ''}</small>
                    </div>
                    {/^[a-f0-9]{24}$/.test(rec.call_id || '') && (
                      <audio controls src={`/api/calls/${rec.id}/recording`} preload="none" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-line">Nenhuma ligação registrada para este lead.</p>
            )}
          </div>
        )}

        {activeTab === 'timeline' && <TimelineList events={lead?.timeline || []} />}

        {activeTab === 'raw' && (
          <div className="raw-data">
            <div className="mini-head">
              <strong>Todos os dados da planilha</strong>
              <span>{rawEntries.length}</span>
            </div>
            <div className="raw-grid">
              {rawEntries.map(([key, value]) => (
                <div className="raw-item" key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskFields({ task, lead, fields, update, template, subject, startCall, callId, loading }) {
  if (task.type === 'ENRICHMENT') {
    return (
      <div className="form-grid">
        <Input label="Telefone encontrado" value={fields.phone_found || ''} onChange={(v) => update('phone_found', v)} />
        <Input label="Telefone alternativo" value={fields.alternate_phone || ''} onChange={(v) => update('alternate_phone', v)} />
        <Select label="Fonte do telefone" value={fields.phone_source || ''} onChange={(v) => update('phone_source', v)} options={['Google Maps', 'Site', 'Receita/CNPJ', 'LinkedIn', 'Indicação interna', 'Outro']} />
        <Input label="Site" value={fields.site || ''} onChange={(v) => update('site', v)} />
        <Input label="Instagram" value={fields.instagram || ''} onChange={(v) => update('instagram', v)} />
        <Input label="LinkedIn empresa" value={fields.linkedin_company || ''} onChange={(v) => update('linkedin_company', v)} />
        <Input label="Decisor" value={fields.decision_maker || ''} onChange={(v) => update('decision_maker', v)} />
        <Input label="Cargo" value={fields.decision_role || ''} onChange={(v) => update('decision_role', v)} />
        <Textarea label="Rapport / gancho de abertura" value={fields.rapport || ''} onChange={(v) => update('rapport', v)} />
        <Textarea label="Hipótese de dor" value={fields.pain_hypothesis || ''} onChange={(v) => update('pain_hypothesis', v)} />
        <Textarea label="Observação" value={fields.notes || ''} onChange={(v) => update('notes', v)} wide />
      </div>
    );
  }

  if (task.type === 'CALL') {
    return (
      <div className="call-execution-grid">
        <section className="call-card call-card-primary">
          <div className="call-card-head">
            <strong>Ligar agora</strong>
            <span>Escolha o número e registre se a conversa foi útil.</span>
          </div>
          <PhonePicker lead={lead} value={fields.phone || ''} onChange={(v) => update('phone', v)} />
          <SignificanceToggle value={fields.call_significance || ''} onChange={(v) => update('call_significance', v)} />
          <div className="button-row call-buttons">
            <button className="primary" onClick={startCall} disabled={loading}><Phone size={17} /> Ligar pela 3C+</button>
            <a className="secondary-link" href={`tel:${digits(fields.phone || task.primary_phone)}`}><Phone size={17} /> Telefone local</a>
          </div>
        </section>

        <section className="call-card">
          <div className="call-card-head">
            <strong>Validação do contato</strong>
            <span>Marque o vínculo real do número durante a ligação.</span>
          </div>
          <Select label="Quem atendeu" value={fields.reached_person || ''} onChange={(v) => update('reached_person', v)} options={['Não atendeu', 'Decisor', 'Sócio', 'Secretaria/gatekeeper', 'Financeiro', 'Outro contato']} />
          <Select label="Vínculo do telefone" value={fields.phone_relationship || ''} onChange={(v) => update('phone_relationship', v)} options={['DECISION_MAKER', 'COMPANY', 'GATEKEEPER', 'NO_LINK', 'INVALID']} labels={{ DECISION_MAKER: 'Telefone do decisor', COMPANY: 'Telefone da empresa', GATEKEEPER: 'Gatekeeper/secretaria', NO_LINK: 'Sem vínculo com o lead', INVALID: 'Inválido' }} />
          <Select label="Status do telefone" value={fields.phone_status || ''} onChange={(v) => update('phone_status', v)} options={['VALID_DECISION_MAKER', 'CONTACTED', 'GATEKEEPER', 'NO_LINK', 'INVALID']} labels={{ VALID_DECISION_MAKER: 'Validado decisor', CONTACTED: 'Contatado', GATEKEEPER: 'Gatekeeper', NO_LINK: 'Sem vínculo', INVALID: 'Inválido' }} />
          <Input label="Nome vinculado ao telefone" value={fields.phone_owner_name || ''} onChange={(v) => update('phone_owner_name', v)} />
          <label className="check-field">
            <input type="checkbox" checked={Boolean(fields.phone_do_not_call)} onChange={(event) => update('phone_do_not_call', event.target.checked)} />
            <span>Não ligar novamente para este número</span>
          </label>
          <Input label="Nota da validação do telefone" value={fields.phone_validation_note || ''} onChange={(v) => update('phone_validation_note', v)} />
        </section>

        <section className="call-card">
          <div className="call-card-head">
            <strong>Ponte multicanal</strong>
            <span>Use quando a conversa virar e-mail, material ou registro 3C+.</span>
          </div>
          <Input label="E-mail do decisor / empresa" value={fields.recipient_email || ''} onChange={(v) => update('recipient_email', v)} />
          <Input label="Motivo para funil de e-mail" value={fields.email_funnel_reason || ''} onChange={(v) => update('email_funnel_reason', v)} />
          <Input label="Call ID 3C+" value={callId || fields.call_id || ''} onChange={(v) => update('call_id', v)} />
          <Input label="Áudio / gravação" value={fields.call_audio_url || ''} onChange={(v) => update('call_audio_url', v)} />
        </section>

        <section className="call-card call-card-wide">
          <div className="call-card-head">
            <strong>Resultado da conversa</strong>
            <span>Preencha só o necessário para a próxima task nascer certa.</span>
          </div>
          <div className="call-card-grid">
            <Textarea label="Nota curta da ligação" value={fields.conversation_note || ''} onChange={(v) => update('conversation_note', v)} />
            <Textarea label="Objeção ou motivo" value={fields.reason || ''} onChange={(v) => update('reason', v)} />
            <DateTime label="Retorno prometido" value={fields.followup_at || ''} onChange={(v) => update('followup_at', v)} />
            <DateTime label="Reunião marcada" value={fields.meeting_at || ''} onChange={(v) => update('meeting_at', v)} />
          </div>
        </section>
      </div>
    );
  }

  if (['WHATSAPP', 'EMAIL', 'LINKEDIN'].includes(task.type)) {
    return (
      <div className="form-grid">
        {task.type === 'EMAIL' && (
          <>
            <Input label="Destinatário" value={fields.recipient_email || ''} onChange={(v) => update('recipient_email', v)} />
            <Input label="Assunto" value={fields.subject || subject || 'Contato Cloud Marketing'} onChange={(v) => update('subject', v)} />
          </>
        )}
        {task.payload?.funnel === 'EMAIL_FUNNEL' && (
          <div className="funnel-context wide">
            <strong>Funil de e-mail · etapa {task.payload.emailFunnelStep}</strong>
            <span>{task.payload.funnelReason || 'Ponte criada pela ligação'}</span>
          </div>
        )}
        <Textarea label="Mensagem pronta" value={fields.message || template} onChange={(v) => update('message', v)} wide />
        <Textarea label="Resposta ou contexto" value={fields.conversation_note || ''} onChange={(v) => update('conversation_note', v)} />
        <Textarea label="Motivo / objeção" value={fields.reason || ''} onChange={(v) => update('reason', v)} />
        <ChannelActions task={task} lead={lead} message={fields.message || template} phone={fields.phone || task.primary_phone} email={fields.recipient_email} subject={fields.subject || subject} />
      </div>
    );
  }

  if (task.type === 'FOLLOW_UP') {
    return (
      <div className="form-grid">
        <Select label="Tipo de follow" value={fields.followup_type || ''} onChange={(v) => update('followup_type', v)} options={['RETORNO_PROMETIDO', 'GATEKEEPER', 'EMAIL', 'WHATSAPP', 'PROPOSTA', 'REMARCACAO']} labels={{ RETORNO_PROMETIDO: 'Retorno prometido', GATEKEEPER: 'Gatekeeper', EMAIL: 'Direcionar e-mail', WHATSAPP: 'Direcionar WhatsApp', PROPOSTA: 'Proposta', REMARCACAO: 'Remarcação' }} />
        <Input label="Pessoa que pediu retorno" value={fields.promised_by || ''} onChange={(v) => update('promised_by', v)} />
        <DateTime label="Nova data/hora prometida" value={fields.followup_at || ''} onChange={(v) => update('followup_at', v)} />
        <DateTime label="Reunião marcada" value={fields.meeting_at || ''} onChange={(v) => update('meeting_at', v)} />
        <Textarea label="Combinado / resumo" value={fields.conversation_note || ''} onChange={(v) => update('conversation_note', v)} />
        <Textarea label="Risco de esfriar ou motivo" value={fields.reason || ''} onChange={(v) => update('reason', v)} />
      </div>
    );
  }

  if (task.type === 'MEETING_CONFIRMATION') {
    return (
      <div className="form-grid">
        <DateTime label="Data/hora da reunião" value={fields.meeting_at || task.due_at || ''} onChange={(v) => update('meeting_at', v)} />
        <Input label="Participantes" value={fields.participants || ''} onChange={(v) => update('participants', v)} />
        <Textarea label="Dor para o closer" value={fields.closer_briefing || ''} onChange={(v) => update('closer_briefing', v)} />
        <DateTime label="Remarcar / retorno" value={fields.followup_at || ''} onChange={(v) => update('followup_at', v)} />
      </div>
    );
  }

  return (
    <div className="form-grid">
      <Input label="Valor da proposta" value={fields.value || ''} onChange={(v) => update('value', v)} />
      <DateTime label="Previsão de fechamento" value={fields.expected_close_at || ''} onChange={(v) => update('expected_close_at', v)} />
      <Textarea label="Objeção" value={fields.objection || ''} onChange={(v) => update('objection', v)} />
      <Textarea label="Próximo passo" value={fields.next_step || ''} onChange={(v) => update('next_step', v)} />
      <Textarea label="Motivo se perdido" value={fields.reason || ''} onChange={(v) => update('reason', v)} wide />
    </div>
  );
}

function PhonePicker({ lead, value, onChange }) {
  return (
    <label className="field">
      <span>Telefone para ligar</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecionar telefone</option>
        {(lead?.phones || []).map((phone) => (
          <option key={phone.id} value={phone.phone}>
            {phone.phone} · {phone.source || 'base'} · {phone.do_not_call ? 'não ligar' : phoneStatusText(phone)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SignificanceToggle({ value, onChange }) {
  return (
    <div className="segmented-field">
      <span>Qualidade da ligação</span>
      <div>
        <button type="button" className={value === 'SIGNIFICANT' ? 'active' : ''} onClick={() => onChange('SIGNIFICANT')}>Significativa</button>
        <button type="button" className={value === 'NON_SIGNIFICANT' ? 'active' : ''} onClick={() => onChange('NON_SIGNIFICANT')}>Não significativa</button>
      </div>
    </div>
  );
}

function ChannelActions({ task, message, phone, email, subject = 'Contato Cloud Marketing' }) {
  const cleanPhone = digits(phone);
  const waPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  const encodedSubject = encodeURIComponent(subject || 'Contato Cloud Marketing');
  const body = encodeURIComponent(message || '');
  return (
    <div className="button-row wide">
      {task.type === 'WHATSAPP' && (
        <a className="primary" href={`https://wa.me/${waPhone}?text=${encodeURIComponent(message || '')}`} target="_blank" rel="noreferrer">
          <MessageCircle size={17} /> Abrir WhatsApp
        </a>
      )}
      {task.type === 'EMAIL' && (
        <a className="primary" href={`mailto:${email || ''}?subject=${encodedSubject}&body=${body}`}>
          <Mail size={17} /> Abrir e-mail
        </a>
      )}
      {task.type === 'LINKEDIN' && (
        <a className="primary" href="https://www.linkedin.com/search/results/companies/" target="_blank" rel="noreferrer">
          <ExternalLink size={17} /> Abrir LinkedIn
        </a>
      )}
    </div>
  );
}

function OutcomeBar({ task, complete, loading, onSaveDraft, savingDraft }) {
  const outcomes = outcomesFor(task);
  const primaryCallOutcomes = new Set(['no_answer', 'callback_requested', 'meeting_scheduled', 'not_interested', 'phone_invalid']);
  const visibleOutcomes = task.type === 'CALL' ? outcomes.filter((item) => primaryCallOutcomes.has(item.outcome)) : outcomes;
  const secondaryOutcomes = task.type === 'CALL' ? outcomes.filter((item) => !primaryCallOutcomes.has(item.outcome)) : [];
  const renderOutcome = (item) => (
    <button key={item.outcome} className={item.kind || 'secondary'} onClick={() => complete(item.outcome)} disabled={loading}>
      {item.icon === 'check' ? <Check size={16} /> : <ChevronRight size={16} />}
      {item.label}
    </button>
  );
  return (
    <div className={`outcome-bar ${task.type === 'CALL' ? 'sticky-action-bar' : ''}`}>
      <div className="draft-actions">
        <button className="secondary" type="button" onClick={onSaveDraft} disabled={savingDraft || loading}>
          <Save size={16} />
          {savingDraft ? 'Salvando...' : 'Salvar rascunho'}
        </button>
      </div>
      <div className="outcome-actions">
        {visibleOutcomes.map(renderOutcome)}
        {secondaryOutcomes.length > 0 && (
          <details className="more-outcomes">
            <summary>
              <MoreHorizontal size={16} />
              Mais
            </summary>
            <div>
              {secondaryOutcomes.map(renderOutcome)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function outcomesFor(task) {
  const type = task.type;
  if (type === 'ENRICHMENT') {
    return [
      { outcome: 'approve', label: 'Aprovar e iniciar cadência', kind: 'primary', icon: 'check' },
      { outcome: 'research_again', label: 'Pesquisar mais' },
      { outcome: 'no_fit', label: 'Descartar sem fit' }
    ];
  }
  if (type === 'CALL') {
    return [
      { outcome: 'no_answer', label: 'Não atendeu' },
      { outcome: 'voicemail', label: 'Caixa postal' },
      { outcome: 'call_dropped', label: 'Caiu' },
      { outcome: 'gatekeeper', label: 'Gatekeeper' },
      { outcome: 'gatekeeper_email', label: 'Gatekeeper -> e-mail' },
      { outcome: 'email_only', label: 'Só por e-mail' },
      { outcome: 'material_requested', label: 'Pediu material' },
      { outcome: 'whatsapp_negotiation', label: 'Negociar WhatsApp' },
      { outcome: 'callback_requested', label: 'Pediu retorno' },
      { outcome: 'meeting_scheduled', label: 'Reunião marcada', kind: 'primary', icon: 'check' },
      { outcome: 'phone_invalid', label: 'Telefone inválido' },
      { outcome: 'not_interested', label: 'Sem interesse' },
      { outcome: 'out_of_icp', label: 'Fora ICP' }
    ];
  }
  if (['WHATSAPP', 'EMAIL', 'LINKEDIN'].includes(type)) {
    const isEmailFunnel = task.payload?.funnel === 'EMAIL_FUNNEL';
    return [
      { outcome: type === 'LINKEDIN' ? 'linkedin_done' : 'sent', label: isEmailFunnel ? 'Enviado e avançar funil' : 'Registrar envio', kind: 'primary', icon: 'check' },
      { outcome: 'no_response', label: isEmailFunnel ? 'Sem resposta e avançar' : 'Sem resposta' },
      { outcome: 'interested', label: 'Respondeu com interesse' },
      { outcome: 'not_interested', label: 'Sem interesse' }
    ];
  }
  if (type === 'FOLLOW_UP') {
    return [
      { outcome: 'callback_requested', label: 'Novo retorno' },
      { outcome: 'send_email', label: 'Direcionar e-mail' },
      { outcome: 'send_whatsapp', label: 'Direcionar WhatsApp' },
      { outcome: 'resume_cadence', label: 'Voltar cadência' },
      { outcome: 'meeting_scheduled', label: 'Reunião marcada', kind: 'primary', icon: 'check' },
      { outcome: 'not_interested', label: 'Sem interesse' },
      { outcome: 'no_answer', label: 'Não consegui falar' }
    ];
  }
  if (type === 'MEETING_CONFIRMATION') {
    return [
      { outcome: 'confirmed', label: 'Confirmada', kind: 'primary', icon: 'check' },
      { outcome: 'meeting_happened', label: 'Reunião ocorreu' },
      { outcome: 'reschedule', label: 'Remarcar' },
      { outcome: 'no_show', label: 'No-show' }
    ];
  }
  return [
    { outcome: 'proposal_sent', label: 'Proposta enviada', kind: 'primary', icon: 'check' },
    { outcome: 'follow_sent', label: 'Follow-up feito' },
    { outcome: 'won', label: 'Ganho' },
    { outcome: 'lost', label: 'Perdido' }
  ];
}

function TimelineList({ events }) {
  return (
    <div className="timeline-list">
      {(events || []).slice(0, 12).map((event) => (
        <div className="timeline-item" key={event.id}>
          <time>{formatDate(event.created_at)}</time>
          <strong>{event.title}</strong>
          <span>{event.event_type}</span>
        </div>
      ))}
      {!(events || []).length && <p className="empty-line">Sem eventos na timeline.</p>}
    </div>
  );
}

function LeadTimeline({ lead }) {
  return (
    <div className="timeline">
      <div className="section-head">
        <h3>Timeline</h3>
        <span className="pill">{lead?.timeline?.length || 0}</span>
      </div>
      <TimelineList events={lead?.timeline || []} />
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateTime({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="datetime-local" value={toLocalInput(value)} onChange={(event) => onChange(fromLocalInput(event.target.value))} />
    </label>
  );
}

function Select({ label, value, onChange, options, labels = {} }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecionar</option>
        {options.map((option) => <option key={option} value={option}>{labels[option] || option}</option>)}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange, wide = false }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
    </label>
  );
}

function TaskListPanel({ title, eyebrow, items, onSelectTask, setView, emptyText }) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          {eyebrow && <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-0.5">{eyebrow}</div>}
          <h2 className="font-semibold">{title}</h2>
        </div>
        <span className="rounded-full bg-primary/15 text-primary text-xs font-bold px-2.5 py-1">{items.length}</span>
      </div>
      <div className="divide-y divide-border">
        {items.map((task) => (
          <button
            key={task.id}
            className="group w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface/60 transition-colors text-left"
            onClick={() => { onSelectTask(task.id); setView('execution'); }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{companyNameFromTask(task)}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {TYPE_LABEL[task.type]} · {task.title}
                {task.due_at && <span className="ml-2 font-mono text-warning">{formatDate(task.due_at)}</span>}
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </button>
        ))}
        {!items.length && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground italic">{emptyText || 'Sem itens.'}</div>
        )}
      </div>
    </section>
  );
}

function QueueView({ type, onSelectTask, setView, setToast }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api(`/api/tasks/queue/${type}`).then(setItems).catch((error) => setToast(error.message));
  }, [type]);
  return (
    <TaskListPanel
      title={TYPE_LABEL[type]}
      eyebrow="Fila"
      items={items}
      onSelectTask={onSelectTask}
      setView={setView}
      emptyText="Sem tarefas nessa fila."
    />
  );
}

function AgendaView({ onSelectTask, setView, setToast, onStartFocus }) {
  const [agenda, setAgenda]   = useState([]);
  const [follows, setFollows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api('/api/tasks/queue/MEETING_CONFIRMATION'),
      api('/api/tasks/queue/CLOSER_FOLLOW_UP'),
      api('/api/tasks/queue/FOLLOW_UP'),
    ]).then(([meet, closer, follow]) => {
      const sort = (arr) => [...arr].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
      setAgenda(sort([...meet, ...closer]));
      setFollows(sort(follow));
    }).catch((e) => setToast(e.message))
      .finally(() => setLoading(false));
  }, []);

  function goTask(task) { onSelectTask(task.id); setView('execution'); }

  const Section = ({ title, eyebrow, color, items, types, emptyText }) => (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className={`text-[10px] uppercase tracking-widest font-semibold mb-0.5 ${color}`}>{eyebrow}</div>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/15 text-primary text-xs font-bold px-2.5 py-1">{items.length}</span>
          {items.length > 0 && onStartFocus && (
            <button
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
              onClick={() => onStartFocus(items[0]?.id, types, title)}
            >
              Focar neste grupo
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground animate-pulse">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground italic">{emptyText}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((task) => {
            const due = new Date(task.due_at);
            const isOverdue = due < new Date();
            const isToday = due.toDateString() === new Date().toDateString();
            return (
              <div key={task.id} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-surface/60 transition-colors">
                {/* Date badge */}
                <div className={`shrink-0 w-14 text-center rounded-lg py-1.5 border ${
                  isOverdue ? 'border-hot/40 bg-hot/10' : isToday ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface'
                }`}>
                  <div className={`text-[10px] font-semibold uppercase ${isOverdue ? 'text-hot' : isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isToday ? 'hoje' : isOverdue ? 'atr.' : due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </div>
                  <div className={`text-xs font-mono font-bold ${isOverdue ? 'text-hot' : isToday ? 'text-primary' : 'text-foreground'}`}>
                    {due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${TASK_BADGE_COLORS[task.type] || TASK_BADGE_COLORS.ENRICHMENT}`}>
                      {TYPE_LABEL[task.type]}
                    </span>
                    <span className="font-medium text-sm truncate">{companyNameFromTask(task)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{task.title}</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onStartFocus && (
                    <button
                      className="h-7 px-2.5 rounded-md bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition"
                      onClick={() => onStartFocus(task.id, [task.type], TYPE_LABEL[task.type])}
                      title="Foco nesta tarefa"
                    >
                      Focar
                    </button>
                  )}
                  <button
                    className="h-7 px-2.5 rounded-md border border-border bg-surface text-xs hover:bg-surface-2 transition"
                    onClick={() => goTask(task)}
                    title="Abrir na execução"
                  >
                    Abrir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Agenda — reuniões e closer"
        eyebrow="Reuniões · confirmações · closer"
        color="text-success"
        items={agenda}
        types={['MEETING_CONFIRMATION', 'CLOSER_FOLLOW_UP']}
        emptyText="Nenhuma reunião ou compromisso de closer pendente."
      />
      <Section
        title="Follows — retornos e cadência"
        eyebrow="Follow-ups programados"
        color="text-warning"
        items={follows}
        types={['FOLLOW_UP']}
        emptyText="Nenhum follow-up pendente."
      />
    </div>
  );
}

function FunnelsView({ data, onSelectTask, setView }) {
  const transitions = Object.fromEntries((data?.transitions || []).map((row) => [row.event_type, row.total]));
  return (
    <>
      <div className="funnel-metrics">
        <div className="metric">
          <span>Entraram no e-mail</span>
          <strong>{transitions.EMAIL_FUNNEL_ENTERED || 0}</strong>
        </div>
        <div className="metric">
          <span>Avanços de e-mail</span>
          <strong>{transitions.EMAIL_FUNNEL_NEXT || 0}</strong>
        </div>
        <div className="metric">
          <span>E-mail concluído</span>
          <strong>{transitions.EMAIL_FUNNEL_FINISHED || 0}</strong>
        </div>
        <div className="metric">
          <span>Reuniões</span>
          <strong>{transitions.MEETING_SCHEDULED || 0}</strong>
        </div>
      </div>
      <div className="funnel-board">
        {(data?.buckets || []).map((bucket) => (
          <section className="funnel-col" key={bucket.id}>
            <div className="funnel-col-head">
              <div>
                <strong>{bucket.label}</strong>
                <span>{bucket.description}</span>
              </div>
              <small>{bucket.count}</small>
            </div>
            <div className="funnel-cards">
              {bucket.tasks.map((task) => (
                <button
                  className="funnel-card"
                  key={task.id}
                  onClick={() => {
                    onSelectTask(task.id);
                    setView('execution');
                  }}
                >
                  <strong>{companyNameFromTask(task)}</strong>
                  <span>{TYPE_LABEL[task.type]} · {task.title}</span>
                  <small>{formatDate(task.due_at)}{task.payload?.funnelReason ? ` · ${task.payload.funnelReason}` : ''}</small>
                </button>
              ))}
              {!bucket.tasks.length && <p className="empty-line">Sem leads nesta etapa.</p>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function CadenceView({ setToast }) {
  const [cadence, setCadence] = useState(null);
  useEffect(() => {
    api('/api/cadences').then((rows) => setCadence(rows[0])).catch((error) => setToast(error.message));
  }, []);

  function updateStep(index, key, value) {
    setCadence((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, [key]: value } : step)
    }));
  }

  async function save() {
    await api(`/api/cadences/${cadence.id}`, { method: 'PUT', body: { steps: cadence.steps } });
    setToast('Cadência salva.');
  }

  if (!cadence) return <section className="panel">Carregando cadência...</section>;
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Motor editável</span>
          <h2>{cadence.name}</h2>
        </div>
        <button className="primary" onClick={save}><Check size={16} /> Salvar</button>
      </div>
      <div className="cadence-table">
        <div className="cadence-head">Step</div>
        <div className="cadence-head">Tipo</div>
        <div className="cadence-head">Título</div>
        <div className="cadence-head">D+ dias</div>
        <div className="cadence-head">Hora</div>
        {cadence.steps.map((step, index) => (
          <div className="cadence-row" key={step.step}>
            <strong>{step.step}</strong>
            <select value={step.type} onChange={(event) => updateStep(index, 'type', event.target.value)}>
              {Object.keys(TYPE_LABEL).filter((type) => ['CALL', 'WHATSAPP', 'EMAIL', 'LINKEDIN'].includes(type)).map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
            </select>
            <input value={step.title} onChange={(event) => updateStep(index, 'title', event.target.value)} />
            <input type="number" value={step.dayOffset} onChange={(event) => updateStep(index, 'dayOffset', Number(event.target.value))} />
            <input value={step.time} onChange={(event) => updateStep(index, 'time', event.target.value)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function LeadSearchView({ setToast }) {
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);

  async function search(nextQuery = query) {
    const rows = await api(`/api/leads?q=${encodeURIComponent(nextQuery)}`);
    setLeads(rows);
  }

  async function openLead(id) {
    try {
      setSelected(await api(`/api/leads/${id}`));
    } catch (error) {
      setToast(error.message);
    }
  }

  useEffect(() => {
    search('').catch((error) => setToast(error.message));
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={15} className="text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Buscar empresa ou CNPJ"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button
            onClick={() => search()}
            className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
          >
            Buscar
          </button>
        </div>
        <div className="divide-y divide-border">
          {leads.map((lead) => (
            <button
              key={lead.id}
              className="group w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface/60 transition-colors text-left"
              onClick={() => openLead(lead.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{companyNameFromLead(lead)}</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {lead.cnpj} · {lead.state} · {lead.open_tasks} abertas
                </div>
              </div>
              <ChevronRight size={15} className="text-muted-foreground group-hover:text-foreground shrink-0" />
            </button>
          ))}
          {!leads.length && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground italic">Nenhum lead encontrado.</div>
          )}
        </div>
      </section>
      <LeadDetail lead={selected} setToast={setToast} />
    </div>
  );
}

function LeadDetail({ lead, setToast }) {
  if (!lead) {
    return (
      <section className="rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-3 p-12 text-muted-foreground min-h-48">
        <Search size={28} className="opacity-40" />
        <div className="text-center">
          <div className="font-semibold">Lead 360</div>
          <div className="text-sm mt-1">Abra uma empresa para ver contatos, telefones e histórico.</div>
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-primary font-semibold">{lead.state}</div>
          <h2 className="font-semibold mt-0.5">{companyNameFromLead(lead)}</h2>
        </div>
        <span className="rounded-full bg-primary/15 text-primary text-xs font-bold px-2.5 py-1">
          {lead.openTasks?.length || 0} tarefas
        </span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Info label="CNPJ" value={lead.cnpj} />
          <Info label="Cidade" value={lead.city} />
          <Info label="CNAE" value={lead.cnae} />
          <Info label="Cadência" value={lead.current_cadence_step ? `Step ${lead.current_cadence_step}` : 'Não iniciada'} />
        </div>
        <LeadDataPanel lead={lead} selectedPhone={lead.phones?.[0]?.phone} setToast={setToast} />
        <LeadTimeline lead={lead} />
      </div>
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function DashboardView({ dashboard, closerDashboard }) {
  return (
    <>
      <MetricGrid dashboard={dashboard} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold mb-4">Resultados BDR</h2>
          <BarRows rows={dashboard?.byType || []} labelKey="type" valueKey="total" />
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold mb-4">Tabulações</h2>
          <BarRows rows={dashboard?.outcomes || []} labelKey="outcome" valueKey="total" />
        </section>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Closer</h2>
          <span className="rounded-full bg-primary/15 text-primary text-xs font-bold px-2.5 py-1 font-mono">
            R$ {Number(closerDashboard?.proposalValue || 0).toLocaleString('pt-BR')}
          </span>
        </div>
        <BarRows rows={closerDashboard?.byStage || []} labelKey="stage" valueKey="total" />
      </section>
    </>
  );
}

function BarRows({ rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const pct = (Number(row[valueKey] || 0) / max) * 100;
        return (
          <div key={row[labelKey] || 'sem-status'} className="grid items-center gap-3" style={{ gridTemplateColumns: '160px 1fr 36px' }}>
            <span className="text-sm text-muted-foreground truncate">
              {TYPE_LABEL[row[labelKey]] || STAGE_LABEL[row[labelKey]] || row[labelKey] || 'Sem status'}
            </span>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <strong className="font-mono text-sm text-right">{row[valueKey]}</strong>
          </div>
        );
      })}
      {!rows.length && <p className="text-sm text-muted-foreground italic py-2">Sem dados.</p>}
    </div>
  );
}

function CrmView({ setToast }) {
  const [items, setItems] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newStageName, setNewStageName] = useState('');

  async function loadCrm() {
    const [opportunities, pipelineRows] = await Promise.all([
      api('/api/crm/opportunities'),
      api('/api/crm/pipelines')
    ]);
    setItems(opportunities);
    setPipelines(pipelineRows);
    if (!selectedPipelineId && pipelineRows[0]) setSelectedPipelineId(String(pipelineRows[0].id));
  }

  useEffect(() => {
    loadCrm().catch((error) => setToast(error.message));
  }, []);

  const selectedPipeline = pipelines.find((pipeline) => String(pipeline.id) === String(selectedPipelineId)) || pipelines[0];
  const stageIds = new Set((selectedPipeline?.stages || []).map((stage) => Number(stage.id)));
  const visibleItems = items.filter((item) => !selectedPipeline || Number(item.pipeline_id) === Number(selectedPipeline.id) || (!item.pipeline_id && stageIds.has(Number(item.stage_id))));

  async function createPipeline() {
    if (!newPipelineName.trim()) return;
    const pipeline = await api('/api/crm/pipelines', { method: 'POST', body: { name: newPipelineName } });
    setNewPipelineName('');
    setToast('Pipeline criado.');
    await loadCrm();
    setSelectedPipelineId(String(pipeline.id));
  }

  async function createStage() {
    if (!selectedPipeline || !newStageName.trim()) return;
    await api(`/api/crm/pipelines/${selectedPipeline.id}/stages`, { method: 'POST', body: { name: newStageName } });
    setNewStageName('');
    setToast('Etapa criada.');
    await loadCrm();
  }

  async function moveOpportunity(opportunityId, stageId) {
    await api(`/api/crm/opportunities/${opportunityId}`, { method: 'PATCH', body: { stage_id: Number(stageId) } });
    setToast('Oportunidade movida.');
    await loadCrm();
  }

  if (!pipelines.length) return <section className="panel">Carregando CRM...</section>;

  return (
    <>
      <section className="panel crm-config">
        <div className="section-head">
          <div>
            <span className="eyebrow">Pipeline configurável</span>
            <h2>{selectedPipeline?.name}</h2>
          </div>
          <select value={selectedPipelineId} onChange={(event) => setSelectedPipelineId(event.target.value)}>
            {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
        </div>
        <div className="crm-config-row">
          <input value={newPipelineName} onChange={(event) => setNewPipelineName(event.target.value)} placeholder="Novo pipeline" />
          <button className="secondary" onClick={createPipeline}>Criar pipeline</button>
          <input value={newStageName} onChange={(event) => setNewStageName(event.target.value)} placeholder="Nova etapa neste pipeline" />
          <button className="secondary" onClick={createStage}>Criar etapa</button>
        </div>
      </section>
      <div className="pipeline">
        {(selectedPipeline?.stages || []).map((stage) => {
          const stageItems = visibleItems.filter((item) => Number(item.stage_id) === Number(stage.id) || (!item.stage_id && item.stage === stage.stage_key));
          return (
            <section className="pipeline-col" key={stage.id}>
              <div className="task-group-title">
                <span>{stage.name}</span>
                <small>{stageItems.length}</small>
              </div>
              {stageItems.map((item) => (
                <article className="opportunity" key={item.id}>
                  <strong>{companyNameFromTask(item)}</strong>
                  <span>{item.contact_name || 'Sem contato principal'}</span>
                  <small>R$ {Number(item.value || 0).toLocaleString('pt-BR')} · {item.probability}%</small>
                  <select value={item.stage_id || ''} onChange={(event) => moveOpportunity(item.id, event.target.value)}>
                    {(selectedPipeline?.stages || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </article>
              ))}
              {!stageItems.length && <p className="empty-line">Sem oportunidades.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function RelatorioView() {
  const { report, loading, error } = useDailyReport();
  if (loading) return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground animate-pulse">
      Carregando relatório…
    </div>
  );
  if (error) return (
    <div className="rounded-2xl border border-hot/30 bg-hot/5 px-5 py-6 text-sm text-hot">
      Erro ao carregar relatório: {error}
    </div>
  );
  return <RelatorioDiario data={report} onAction={postDailyReportAction} />;
}

function SettingsView({ config }) {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');

  async function loadIntegration() {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextRecent] = await Promise.all([
        api('/api/integrations/3c/summary'),
        api('/api/integrations/3c/recent?limit=40')
      ]);
      setSummary(nextSummary);
      setRecent(nextRecent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api('/api/import/csv', { method: 'POST' });
      setImportResult(result);
      await loadIntegration();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api('/api/integrations/3c/sync', { method: 'POST' });
      setSyncResult(result);
      await loadIntegration();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadIntegration();
  }, []);

  const today = summary?.today || {};
  const cards = [
    ['Eventos hoje', today.total || 0, 'total'],
    ['Follow', today.follow || 0, 'follow'],
    ['Agendou', today.meeting || 0, 'meeting'],
    ['Não atendeu', today.noAnswer || 0, 'no_answer'],
    ['Inválido', today.invalid || 0, 'phone_invalid'],
    ['Sem vínculo', today.noLink || 0, 'phone_no_link'],
    ['Sem interesse', today.notInterested || 0, 'not_interested'],
    ['Fora ICP', today.outOfIcp || 0, 'out_of_icp'],
    ['Gatekeeper', today.gatekeeper || 0, 'gatekeeper'],
    ['Desconhecido', today.unknown || 0, 'unknown']
  ];

  return (
    <>
      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Integração</span>
            <h2>3C+ discadora e webhook</h2>
          </div>
          <button className="secondary" type="button" onClick={loadIntegration} disabled={loading}>
            Atualizar
          </button>
        </div>
        <div className="info-grid">
          <Info label="Base URL" value={config?.baseUrl} />
          <Info label="Webhook público" value={config?.webhookPublicUrl || 'https://sales.yvex.online/api_3c_receiver.php'} />
          <Info label="Token operador" value={config?.hasOperatorToken ? 'Configurado no .env' : 'Pendente'} />
          <Info label="Token admin" value={config?.hasAdminToken ? 'Configurado no .env' : 'Pendente'} />
          <Info label="Campanha" value={config?.campaignId || 'Não configurada'} />
        </div>
        <p className="settings-note">Tokens ficam somente no arquivo local `.env`. O frontend recebe apenas status booleano e nunca recebe o token real.</p>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Leads da campanha</span>
            <h2>Importar leads dos CSVs 3C+</h2>
          </div>
          <button className="primary" type="button" onClick={runImport} disabled={importing || loading}>
            <Check size={16} />
            {importing ? 'Importando...' : 'Importar CSVs'}
          </button>
        </div>
        <p className="settings-note">Carrega os leads dos arquivos CSV da pasta configurada (CSV_IMPORT_DIR). Idempotente — pode rodar mais de uma vez sem duplicar.</p>
        {importResult && (
          <div className="threec-metrics">
            <div className="threec-metric meeting"><span>Novos leads</span><strong>{importResult.imported}</strong></div>
            <div className="threec-metric follow"><span>Atualizados</span><strong>{importResult.updated}</strong></div>
            <div className="threec-metric connected"><span>Telefones</span><strong>{importResult.phonesAdded}</strong></div>
            <div className="threec-metric total"><span>Arquivos</span><strong>{importResult.files}</strong></div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Sincronização manual</span>
            <h2>Carregar ligações do dia da 3C+</h2>
          </div>
          <button className="primary" type="button" onClick={runSync} disabled={syncing || loading}>
            <RefreshCcw size={16} />
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        </div>
        <p className="settings-note">Busca as ligações tabuladas na 3C+ e cria as tarefas automaticamente no sistema. Roda também a cada 5 minutos em segundo plano.</p>
        {syncResult && (
          <div className="threec-metrics">
            <div className="threec-metric meeting"><span>Processadas</span><strong>{syncResult.processed}</strong></div>
            <div className="threec-metric no_answer"><span>Puladas</span><strong>{syncResult.skipped}</strong></div>
            <div className="threec-metric follow"><span>Duplicadas</span><strong>{syncResult.duplicate}</strong></div>
            <div className="threec-metric unknown"><span>Total na janela</span><strong>{syncResult.total}</strong></div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Retorno da discadora</span>
            <h2>Tabulações recebidas hoje</h2>
          </div>
          {loading && <span className="pill">Carregando</span>}
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="threec-metrics">
          {cards.map(([label, value, kind]) => (
            <div className={`threec-metric ${kind}`} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Auditoria operacional</span>
            <h2>Últimas ligações que voltaram da 3C+</h2>
          </div>
          <span className="pill">{recent.length}</span>
        </div>
        <div className="threec-events">
          <div className="threec-events-head">
            <span>Lead</span>
            <span>Telefone</span>
            <span>Tabulação</span>
            <span>Status</span>
            <span>Quando</span>
            <span>Próxima ação</span>
          </div>
          {recent.map((event) => (
            <article className="threec-event-row" key={event.id}>
              <div>
                <strong>{event.trade_name || event.legal_name || event.company || 'Lead não vinculado'}</strong>
                <span>{event.cnpj || event.event_type}</span>
              </div>
              <strong>{event.phone || '-'}</strong>
              <div>
                <span className={`threec-badge ${event.classification || 'unknown'}`}>
                  {THREEC_CLASSIFICATION_LABEL[event.classification] || event.classification || 'Desconhecido'}
                </span>
                {event.qualification && <small>{event.qualification}</small>}
              </div>
              <span>{event.status}</span>
              <span>{formatDate(event.created_at)}</span>
              <span>{event.open_task_title || event.open_task_type || '-'}</span>
            </article>
          ))}
          {!recent.length && !loading && <p className="empty-line">Nenhum webhook da 3C+ recebido ainda.</p>}
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────
   MODO FOCO — tela cheia sem distração
   ───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   MENSAGENS EM LOTE — WhatsApp e e-mail
   ───────────────────────────────────────────── */

function MensagensView({ setToast }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(new Set());
  const [sent, setSent]           = useState(new Set());
  const [filter, setFilter]       = useState('ALL');
  /* detail panel */
  const [openId, setOpenId]       = useState(null);
  const [detail, setDetail]       = useState(null);   // { task, lead }
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMsg, setEditMsg]     = useState('');     // mensagem editável

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api('/api/tasks/queue/WHATSAPP'),
      api('/api/tasks/queue/EMAIL'),
      api('/api/tasks/queue/LINKEDIN'),
    ]).then(([wa, em, li]) => {
      setItems([...wa, ...em, ...li].sort((a, b) => new Date(a.due_at) - new Date(b.due_at)));
    }).catch((e) => setToast(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleDetail(task) {
    if (openId === task.id) { setOpenId(null); setDetail(null); return; }
    setOpenId(task.id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await api(`/api/tasks/${task.id}`);
      setDetail(data);
      const msg = data.task?.payload?.messageTemplate
        ? replaceTemplate(data.task.payload.messageTemplate, data.task, data.lead)
        : '';
      setEditMsg(msg);
    } catch (e) {
      setToast(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function markSent(task, outcome, extraFields = {}) {
    setSending((s) => new Set(s).add(task.id));
    try {
      await api(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        body: { outcome, fields: { phone: task.primary_phone || '', message: editMsg || '', ...extraFields } },
      });
      setSent((s) => new Set(s).add(task.id));
      if (openId === task.id) { setOpenId(null); setDetail(null); }
    } catch (e) {
      setToast(e.message);
    } finally {
      setSending((s) => { const n = new Set(s); n.delete(task.id); return n; });
    }
  }

  async function markAllSent() {
    for (const task of filtered.filter((t) => !sent.has(t.id))) {
      await markSent(task, task.type === 'LINKEDIN' ? 'linkedin_done' : 'sent');
    }
  }

  function openChannel(task, msg) {
    const phone = String(task.primary_phone || '').replace(/\D/g, '');
    if (task.type === 'WHATSAPP') {
      const wa = phone.startsWith('55') ? phone : `55${phone}`;
      window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg || '')}`, '_blank');
    } else if (task.type === 'EMAIL') {
      const subject = detail?.task?.payload?.subjectTemplate
        ? replaceTemplate(detail.task.payload.subjectTemplate, detail.task, detail.lead)
        : 'Contato Cloud Marketing';
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg || '')}`, '_blank');
    } else {
      window.open('https://www.linkedin.com/search/results/companies/', '_blank');
    }
  }

  const filtered     = filter === 'ALL' ? items : items.filter((t) => t.type === filter);
  const pendingCount = filtered.filter((t) => !sent.has(t.id)).length;
  const channelColor = { WHATSAPP: 'text-success', EMAIL: 'text-info', LINKEDIN: 'text-primary' };
  const channelBg    = { WHATSAPP: 'bg-success/10 border-success/30', EMAIL: 'bg-info/10 border-info/30', LINKEDIN: 'bg-primary/10 border-primary/30' };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-0.5">Em lote</div>
            <h2 className="font-semibold">Mensagens pendentes</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['ALL','WHATSAPP','EMAIL','LINKEDIN'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`h-7 px-3 rounded-md text-xs font-semibold border transition-colors ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2'}`}
              >
                {f === 'ALL' ? 'Todos' : f === 'WHATSAPP' ? 'WhatsApp' : f === 'EMAIL' ? 'E-mail' : 'LinkedIn'}
                {f !== 'ALL' && <span className="ml-1.5 opacity-70">{items.filter((t) => t.type === f && !sent.has(t.id)).length}</span>}
              </button>
            ))}
            {pendingCount > 0 && (
              <button onClick={markAllSent} className="h-7 px-3 rounded-md bg-success/15 border border-success/30 text-success text-xs font-semibold hover:bg-success/25 transition flex items-center gap-1.5">
                <Send size={12} /> Marcar {pendingCount} enviados
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm animate-pulse">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">Nenhuma mensagem pendente.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((task) => {
              const isSent    = sent.has(task.id);
              const isSending = sending.has(task.id);
              const isOpen    = openId === task.id;
              const outcome   = task.type === 'LINKEDIN' ? 'linkedin_done' : 'sent';
              const lead      = isOpen ? detail?.lead  : null;
              const dtask     = isOpen ? detail?.task  : null;
              const decisor   = lead?.contacts?.[0];
              const pain      = lead?.enrichment?.pain_hypothesis || lead?.recentContext?.[0]?.note || '';
              const recentCtx = lead?.recentContext?.slice(0, 3) || [];
              const recordings = lead?.recordings?.slice(0, 3) || [];

              return (
                <div key={task.id} className={isSent ? 'opacity-40' : ''}>
                  {/* ── Row ── */}
                  <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface/40 transition-colors">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${channelBg[task.type]}`}>
                      <span className={channelColor[task.type]}>{task.type === 'WHATSAPP' ? 'WA' : task.type === 'EMAIL' ? 'EM' : 'LI'}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{companyNameFromTask(task)}</div>
                      <div className="text-xs text-muted-foreground truncate">{task.title}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        className={`h-7 px-2.5 rounded-md border text-xs transition ${isOpen ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-surface hover:bg-surface-2 text-muted-foreground'}`}
                        onClick={() => toggleDetail(task)}
                      >
                        {isOpen ? 'Fechar' : 'Ver contexto'}
                      </button>
                      <button
                        disabled={isSent || isSending}
                        onClick={() => markSent(task, outcome)}
                        className={`h-7 px-2.5 rounded-md text-xs font-semibold transition border ${isSent ? 'border-success/30 bg-success/10 text-success cursor-default' : 'border-border bg-surface hover:bg-surface-2 text-muted-foreground'}`}
                      >
                        {isSent ? '✓ Enviado' : isSending ? '...' : 'Marcar enviado'}
                      </button>
                    </div>
                  </div>

                  {/* ── Painel contextual ── */}
                  {isOpen && (
                    <div className="border-t border-primary/20 bg-primary/3 px-5 py-5 flex flex-col gap-5">
                      {detailLoading ? (
                        <div className="text-center text-muted-foreground text-sm animate-pulse py-4">Carregando lead...</div>
                      ) : detail ? (
                        <>
                          {/* Lead header */}
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-primary font-semibold">{TYPE_LABEL[task.type]}</div>
                              <h3 className="text-xl font-bold mt-0.5">{companyNameFromTask(dtask || task)}</h3>
                              {(lead?.city || lead?.cnpj) && (
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{[lead.city, lead.cnpj].filter(Boolean).join(' · ')}</p>
                              )}
                            </div>
                            {lead?.state && (
                              <span className="text-xs rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground">{lead.state}</span>
                            )}
                          </div>

                          {/* Decisor + telefone */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {decisor && (
                              <div className="rounded-xl border border-border bg-card p-3">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Decisor</div>
                                <div className="font-semibold">{decisor.name}</div>
                                {decisor.role && <div className="text-xs text-muted-foreground">{decisor.role}</div>}
                              </div>
                            )}
                            {task.primary_phone && (
                              <div className="rounded-xl border border-border bg-card p-3">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Telefone</div>
                                <div className="font-mono font-semibold">{task.primary_phone}</div>
                              </div>
                            )}
                          </div>

                          {/* Dor / contexto */}
                          {(pain || recentCtx.length > 0) && (
                            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                              {pain && (
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-warning font-semibold mb-1">Hipótese de dor</div>
                                  <p className="text-sm leading-relaxed">{pain}</p>
                                </div>
                              )}
                              {recentCtx.length > 0 && (
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Contexto recente</div>
                                  {recentCtx.map((c, i) => (
                                    <div key={i} className="border-b border-border pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                                      <div className="text-[10px] text-muted-foreground font-mono">{formatDate(c.created_at)} · {c.title}</div>
                                      <div className="text-xs mt-0.5">{c.note}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Gravações */}
                          {recordings.length > 0 && (
                            <div className="rounded-xl border border-border bg-card p-4">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Ligações anteriores</div>
                              <div className="flex flex-col gap-3">
                                {recordings.map((rec) => (
                                  <div key={rec.id} className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-medium">{rec.phone} · {rec.qualification || rec.classification || 'ligação'}</span>
                                      <span className="text-muted-foreground font-mono">{formatDate(rec.created_at)}{rec.duration_seconds ? ` · ${rec.duration_seconds}s` : ''}</span>
                                    </div>
                                    {/^[a-f0-9]{24}$/.test(rec.call_id || '') && (
                                      <audio controls src={`/api/calls/${rec.id}/recording`} preload="none" className="w-full h-8 rounded-lg" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Mensagem editável */}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] uppercase tracking-wider text-info font-semibold">Mensagem</div>
                              <button
                                className="text-[10px] text-muted-foreground hover:text-foreground transition"
                                onClick={async () => {
                                  try { await navigator.clipboard.writeText(editMsg); setToast('Mensagem copiada.'); }
                                  catch { setToast('Não foi possível copiar.'); }
                                }}
                              >
                                Copiar
                              </button>
                            </div>
                            <textarea
                              value={editMsg}
                              onChange={(e) => setEditMsg(e.target.value)}
                              rows={5}
                              className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring transition resize-none"
                            />
                          </div>

                          {/* Ações finais */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {task.type !== 'LINKEDIN' && (
                              <button
                                className={`h-10 px-4 rounded-lg border text-sm font-semibold transition ${channelBg[task.type]} ${channelColor[task.type]} hover:opacity-80`}
                                onClick={() => openChannel(task, editMsg)}
                              >
                                {task.type === 'WHATSAPP' ? 'Abrir WhatsApp' : 'Abrir e-mail'}
                              </button>
                            )}
                            <button
                              disabled={isSending}
                              onClick={() => markSent(task, outcome)}
                              className="h-10 px-5 rounded-lg bg-success/15 border border-success/30 text-success text-sm font-semibold hover:bg-success/25 transition disabled:opacity-50 flex items-center gap-2"
                            >
                              <Send size={14} /> Marcar como enviado
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PLANO DO DIA — time-boxing por blocos
   ───────────────────────────────────────────── */

const DAY_BLOCKS = [
  { start: '08:00', end: '09:00', label: 'Confirmar reuniões + follow WhatsApp', types: ['MEETING_CONFIRMATION', 'WHATSAPP'] },
  { start: '09:00', end: '11:30', label: 'Ligação na discadora 3C+',            types: ['CALL'] },
  { start: '11:30', end: '12:00', label: 'Follow de ligação',                   types: ['FOLLOW_UP', 'CALL'] },
  { start: '12:00', end: '13:00', label: 'Almoço',                              types: [], pause: true },
  { start: '13:00', end: '14:00', label: 'Follow WhatsApp + e-mail',            types: ['WHATSAPP', 'EMAIL'] },
  { start: '14:00', end: '17:00', label: 'Ligação na discadora 3C+',            types: ['CALL'] },
  { start: '17:00', end: '17:30', label: 'Follow de ligação',                   types: ['FOLLOW_UP', 'CALL'] },
  { start: '17:30', end: '18:00', label: 'Reuniões',                            types: ['MEETING_CONFIRMATION'] },
];

const BLOCK_TYPE_ICONS = {
  CALL: '📞', WHATSAPP: '💬', EMAIL: '✉️',
  FOLLOW_UP: '🔁', MEETING_CONFIRMATION: '📅',
  ENRICHMENT: '🔍', LINKEDIN: '🔗', CLOSER_FOLLOW_UP: '🤝',
};

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function useCurrentBlock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const mins = now.getHours() * 60 + now.getMinutes();
  const idx = DAY_BLOCKS.findIndex((b) => mins >= toMinutes(b.start) && mins < toMinutes(b.end));
  const block = idx >= 0 ? DAY_BLOCKS[idx] : null;
  const minsLeft = block ? toMinutes(block.end) - mins : 0;
  const blockMins = block ? toMinutes(block.end) - toMinutes(block.start) : 1;
  const elapsed = block ? mins - toMinutes(block.start) : 0;
  const pct = block ? Math.min(100, Math.round((elapsed / blockMins) * 100)) : 0;
  return { activeIdx: idx, block, minsLeft, pct, mins };
}

function DayPlan({ tasks, onStartFocus }) {
  const { activeIdx, block: activeBlock, minsLeft, pct } = useCurrentBlock();

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="font-semibold text-sm">Plano do dia</div>
        {activeIdx < 0 && (
          <button
            className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
            onClick={() => onStartFocus(tasks[0]?.id, [], '')}
          >
            Focar em tudo
          </button>
        )}
        {activeIdx < 0 && (
          <span className="text-xs text-muted-foreground ml-2">Fora do plano do dia</span>
        )}
      </div>

      <div className="divide-y divide-border">
        {DAY_BLOCKS.map((b, idx) => {
          const isActive = idx === activeIdx;
          const isPast = activeIdx >= 0 ? idx < activeIdx : toMinutes(b.end) < (new Date().getHours() * 60 + new Date().getMinutes());
          const typeIcons = [...new Set(b.types)].map((t) => BLOCK_TYPE_ICONS[t] || '').filter(Boolean);

          return (
            <div
              key={b.start}
              className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                isActive ? 'bg-primary/8' : isPast ? 'opacity-40' : ''
              }`}
            >
              {/* time */}
              <div className="w-20 shrink-0 text-xs font-mono text-muted-foreground">
                {b.start}–{b.end}
              </div>

              {/* label + progress */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {typeIcons.join(' ')} {b.label}
                </div>
                {isActive && !b.pause && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      faltam {minsLeft} min
                    </span>
                  </div>
                )}
                {isActive && b.pause && (
                  <div className="text-xs text-muted-foreground mt-0.5">faltam {minsLeft} min</div>
                )}
              </div>

              {/* focus button */}
              {isActive && !b.pause && (
                <button
                  className="shrink-0 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
                  onClick={() => onStartFocus(tasks.find((t) => b.types.includes(t.type))?.id, b.types, b.label)}
                >
                  Focar neste bloco
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MODO FOCO — tela cheia sem distração
   ───────────────────────────────────────────── */

const FOCUS_CALL_OUTCOMES = ['no_answer', 'callback_requested', 'meeting_scheduled', 'not_interested', 'material_requested'];

const OUTCOMES_NEED_FIELD = {
  callback_requested: 'followup_at',
  not_interested:     'reason',
  out_of_icp:         'reason',
  lost:               'reason',
};

const OUTCOMES_CELEBRATE = new Set(['meeting_scheduled', 'meeting_happened', 'interested']);

function useElapsed() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function FocusMode({ tasks: initialTasks, startTaskId, onExit, onCelebrate, onRefreshShell, setToast, filterTypes, blockLabel }) {
  const [queue, setQueue] = useState(() => {
    let sorted = [...initialTasks];
    if (filterTypes?.length) sorted = sorted.filter((t) => filterTypes.includes(t.type));
    const idx = sorted.findIndex((t) => t.id === startTaskId);
    if (idx > 0) { const [t] = sorted.splice(idx, 1); sorted.unshift(t); }
    return sorted;
  });
  const [cursor, setCursor] = useState(0);
  const [taskData, setTaskData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [callId, setCallId] = useState('');
  const [note, setNote] = useState('');
  const [doneCount, setDoneCount] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  /* Fila vazia na montagem (ex.: filterTypes sem tarefas do tipo) */
  useEffect(() => {
    if (queue.length === 0) setExhausted(true);
  }, []);

  /* mini-form state */
  const [pendingOutcome, setPendingOutcome] = useState(null);
  const [pendingField, setPendingField] = useState('');
  const elapsed = useElapsed();

  const currentTask = queue[cursor] ?? null;
  const task = taskData?.task ?? null;
  const lead = taskData?.lead ?? null;

  /* Load task detail whenever cursor / queue changes */
  useEffect(() => {
    if (!currentTask) { setTaskData(null); return; }
    setLoadingData(true);
    setCallId('');
    setNote('');
    setPendingOutcome(null);
    setPendingField('');
    api(`/api/tasks/${currentTask.id}`)
      .then(setTaskData)
      .catch((e) => setToast(e.message))
      .finally(() => setLoadingData(false));
  }, [currentTask?.id]);

  /* Advance queue */
  async function advance() {
    const next = cursor + 1;
    if (next < queue.length) { setCursor(next); return; }
    /* queue exhausted — reload from server */
    try {
      let fresh = await api('/api/tasks/today');
      if (filterTypes?.length) fresh = fresh.filter((t) => filterTypes.includes(t.type));
      if (!fresh.length) { setExhausted(true); return; }
      setQueue(fresh);
      setCursor(0);
    } catch (e) {
      setToast(e.message);
    }
  }

  /* Skip — rotate cursor, no API call */
  function skip() {
    if (queue.length <= 1) { setToast('Só resta esta tarefa.'); return; }
    setCursor((c) => (c + 1) % queue.length);
  }

  /* Complete task */
  async function complete(outcome, extraFields = {}) {
    if (!task) return;
    setCompleting(true);
    try {
      const fields = {
        ...(lead?.enrichment || {}),
        ...(task.fields || {}),
        phone: task.primary_phone || '',
        conversation_note: note,
        ...(callId ? { call_id: callId } : {}),
        ...extraFields,
      };
      await api(`/api/tasks/${task.id}/complete`, { method: 'POST', body: { outcome, fields } });
      if (OUTCOMES_CELEBRATE.has(outcome)) onCelebrate?.();
      setDoneCount((d) => d + 1);
      await advance();
    } catch (e) {
      setToast(e.message);
    } finally {
      setCompleting(false);
    }
  }

  /* Handle outcome button click */
  function handleOutcome(outcome) {
    if (OUTCOMES_NEED_FIELD[outcome]) {
      setPendingOutcome(outcome);
      setPendingField('');
      return;
    }
    complete(outcome);
  }

  /* Confirm mini-form */
  function confirmPending() {
    if (!pendingOutcome) return;
    const fieldKey = OUTCOMES_NEED_FIELD[pendingOutcome];
    complete(pendingOutcome, { [fieldKey]: pendingField });
    setPendingOutcome(null);
  }

  /* Snooze +1h */
  async function snooze() {
    if (!task) return;
    const due_at = new Date(Date.now() + 3600_000).toISOString();
    try {
      await api(`/api/tasks/${task.id}/snooze`, { method: 'POST', body: { due_at } });
      const next = queue.filter((_, i) => i !== cursor);
      if (!next.length) { setExhausted(true); return; }
      setQueue(next);
      setCursor((c) => Math.min(c, next.length - 1));
    } catch (e) {
      setToast(e.message);
    }
  }

  /* Call via 3C+ */
  async function call3c() {
    if (!task) return;
    const phone = task.primary_phone;
    if (!phone) { setToast('Sem telefone para ligar.'); return; }
    try {
      const res = await api('/api/3c/manual-call/start', {
        method: 'POST',
        body: { taskId: task.id, leadId: task.lead_id, phone },
      });
      setCallId(res.callId || '');
      setToast('Ligação enviada para a 3C+.');
    } catch (e) {
      setToast(`${e.message}. Use o telefone local como fallback.`);
    }
  }

  /* Copy phone */
  async function copyPhone() {
    const phone = task?.primary_phone;
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); setToast('Telefone copiado.'); }
    catch { setToast('Não foi possível copiar.'); }
  }

  /* Keyboard shortcuts */
  useEffect(() => {
    function handler(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (pendingOutcome) { setPendingOutcome(null); return; }
        onExit?.();
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowRight') { skip(); return; }
      if (e.key === 's' || e.key === 'S') { snooze(); return; }
      if (e.key === 'c' || e.key === 'C') { copyPhone(); return; }
      if ((e.key === 'l' || e.key === 'L') && task?.type === 'CALL') { call3c(); return; }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1) {
        const visible = visibleOutcomes();
        const item = visible[num - 1];
        if (item) handleOutcome(item.outcome);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [task, pendingOutcome, queue, cursor]);

  function visibleOutcomes() {
    if (!task) return [];
    const all = outcomesFor(task);
    if (task.type === 'CALL') return all.filter((o) => FOCUS_CALL_OUTCOMES.includes(o.outcome));
    return all.slice(0, 6);
  }

  const outcomes = visibleOutcomes();
  const message = task && lead ? replaceTemplate(task.payload?.messageTemplate, task, lead) : '';
  const decisor = lead?.contacts?.[0];
  const pain = lead?.enrichment?.pain_hypothesis || lead?.recentContext?.[0]?.note || '';

  /* ── Exhausted state ── */
  if (exhausted) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="text-5xl">{doneCount === 0 ? '🕐' : '🎯'}</div>
        <h2 className="text-2xl font-bold">{doneCount === 0 ? 'Nenhuma tarefa para este bloco agora.' : 'Fila zerada!'}</h2>
        <p className="text-muted-foreground">
          {doneCount === 0
            ? 'Não há tarefas deste tipo na fila no momento.'
            : `${doneCount} tarefa${doneCount !== 1 ? 's' : ''} concluída${doneCount !== 1 ? 's' : ''} nesta sessão.`}
        </p>
        <button
          className="mt-4 h-11 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:brightness-110 transition"
          onClick={() => { onRefreshShell?.(); onExit?.(); }}
        >
          Voltar ao cockpit
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="font-semibold text-primary">Modo Foco</span>
          {blockLabel && (
            <span className="hidden sm:inline text-xs rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5">{blockLabel}</span>
          )}
          <span className="text-muted-foreground hidden sm:inline">
            {doneCount} feita{doneCount !== 1 ? 's' : ''} · {queue.length - cursor} na fila
          </span>
        </div>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">{elapsed}</span>
        <div className="flex items-center gap-2">
          <span className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground/60 mr-2">
            <span><kbd className="font-mono">1–9</kbd> resultado</span>
            <span><kbd className="font-mono">P</kbd> pular</span>
            <span><kbd className="font-mono">S</kbd> adiar +1h</span>
            <span><kbd className="font-mono">C</kbd> copiar</span>
            {task?.type === 'CALL' && <span><kbd className="font-mono">L</kbd> ligar</span>}
            <span><kbd className="font-mono">Esc</kbd> sair</span>
          </span>
          <button
            className="h-8 px-3 rounded-md border border-border bg-surface text-sm hover:bg-surface-2 transition-colors"
            onClick={() => { onRefreshShell?.(); onExit?.(); }}
          >
            Sair do foco
          </button>
        </div>
      </header>

      {/* ── Progress bar ── */}
      <div className="shrink-0 h-1 bg-surface-2">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${Math.max(2, (doneCount / (doneCount + queue.length - cursor)) * 100)}%` }}
        />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        {loadingData || !task ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <span className="animate-pulse">Carregando tarefa...</span>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

            {/* Company + context */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-1">
                {TYPE_LABEL[task.type]} · {task.title}
              </div>
              <h1 className="text-3xl font-bold leading-tight">{companyNameFromTask(task)}</h1>
              {(lead?.city || lead?.cnpj) && (
                <p className="text-sm text-muted-foreground mt-1 font-mono">
                  {[lead.city, lead.cnpj].filter(Boolean).join(' · ')}
                </p>
              )}

              {/* Decisor + phone */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {decisor && (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Decisor</div>
                    <div className="font-semibold mt-0.5">{decisor.name}</div>
                    {decisor.role && <div className="text-xs text-muted-foreground">{decisor.role}</div>}
                  </div>
                )}
                {task.primary_phone && (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Telefone</div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="font-mono font-semibold">{task.primary_phone}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          className="h-7 px-2 rounded border border-border bg-surface-2 text-xs hover:bg-card transition-colors"
                          onClick={copyPhone}
                          title="Copiar (C)"
                        >
                          Copiar
                        </button>
                        {task.type === 'CALL' && (
                          <button
                            className="h-7 px-2 rounded bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition"
                            onClick={call3c}
                            title="Ligar pela 3C+ (L)"
                          >
                            Ligar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pain + script */}
            <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
              {pain && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-warning font-semibold mb-1">Hipótese de dor</div>
                  <p className="text-sm leading-relaxed">{pain}</p>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">Roteiro</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{scriptFor(task.type, task)}</p>
              </div>
              {/* Message template for WA/email */}
              {['WHATSAPP', 'EMAIL', 'LINKEDIN'].includes(task.type) && message && (
                <div>
                  <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                    <div className="text-[10px] uppercase tracking-wider text-info font-semibold">Mensagem pronta</div>
                    <div className="flex items-center gap-2">
                      {task.type === 'WHATSAPP' && task.primary_phone && (() => {
                        const raw = String(task.primary_phone).replace(/\D/g, '');
                        const wa = raw.startsWith('55') ? raw : `55${raw}`;
                        const url = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
                        return (
                          <button
                            className="h-6 px-2 rounded bg-success/15 border border-success/30 text-success text-[10px] font-semibold hover:bg-success/25 transition"
                            onClick={() => window.open(url, '_blank')}
                          >
                            Abrir WhatsApp
                          </button>
                        );
                      })()}
                      {task.type === 'EMAIL' && (() => {
                        const email = decisor?.email || lead?.contacts?.[0]?.email || '';
                        const subject = replaceTemplate(task.payload?.subjectTemplate, task, lead) || 'Contato Cloud Marketing';
                        const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
                        return (
                          <button
                            className="h-6 px-2 rounded bg-info/15 border border-info/30 text-info text-[10px] font-semibold hover:bg-info/25 transition"
                            onClick={() => window.open(url, '_blank')}
                          >
                            Abrir e-mail
                          </button>
                        );
                      })()}
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(message); setToast('Mensagem copiada.'); }
                          catch { setToast('Não foi possível copiar.'); }
                        }}
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3 text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-40 overflow-y-auto">
                    {message}
                  </div>
                </div>
              )}
            </div>

            {/* Quick note */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Nota rápida (opcional)</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observação, objeção, combinado..."
                rows={2}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring transition resize-none"
              />
            </div>

            {/* Mini-form for required fields */}
            {pendingOutcome && (
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 flex flex-col gap-3">
                <div className="text-sm font-semibold">
                  {pendingOutcome === 'callback_requested' && 'Quando retornar?'}
                  {(pendingOutcome === 'not_interested' || pendingOutcome === 'out_of_icp' || pendingOutcome === 'lost') && 'Qual o motivo?'}
                </div>
                {OUTCOMES_NEED_FIELD[pendingOutcome] === 'followup_at' ? (
                  <input
                    type="datetime-local"
                    value={toLocalInput(pendingField)}
                    onChange={(e) => setPendingField(fromLocalInput(e.target.value))}
                    className="rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary w-full"
                    autoFocus
                  />
                ) : (
                  <textarea
                    value={pendingField}
                    onChange={(e) => setPendingField(e.target.value)}
                    placeholder="Descreva brevemente..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                    autoFocus
                  />
                )}
                <div className="flex gap-2">
                  <button
                    className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition disabled:opacity-50"
                    disabled={!pendingField}
                    onClick={confirmPending}
                  >
                    Confirmar
                  </button>
                  <button
                    className="h-10 px-4 rounded-lg border border-border bg-surface text-sm hover:bg-surface-2 transition"
                    onClick={() => setPendingOutcome(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Outcome buttons */}
            {!pendingOutcome && (
              <div className="flex flex-col gap-2 pb-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Resultado</div>
                {outcomes.map((item, idx) => {
                  const isPrimary = item.kind === 'primary';
                  const isSuccess = isPrimary;
                  return (
                    <button
                      key={item.outcome}
                      disabled={completing}
                      onClick={() => handleOutcome(item.outcome)}
                      className={`group relative flex items-center gap-3 w-full h-12 px-4 rounded-xl border text-sm font-semibold transition-all disabled:opacity-50
                        ${isSuccess
                          ? 'border-success/40 bg-success/10 text-success hover:bg-success/20'
                          : 'border-border bg-surface text-foreground hover:bg-surface-2'
                        }`}
                    >
                      <span className="flex items-center justify-center h-5 w-5 rounded border border-current/20 text-[10px] font-mono opacity-60">
                        {idx + 1}
                      </span>
                      {item.label}
                      {OUTCOMES_NEED_FIELD[item.outcome] && (
                        <span className="ml-auto text-[10px] text-muted-foreground opacity-60">requer campo →</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Snooze */}
            {!pendingOutcome && (
              <div className="flex items-center justify-center pb-8">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  onClick={snooze}
                >
                  <span>Agora não · +1h</span>
                  <span className="text-[10px] font-mono opacity-50">(S)</span>
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

export default App;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Clock3, Coins, Eye, FileClock,
  GitBranch, Layers3, LockKeyhole, Menu, Plus, RefreshCw, RotateCcw,
  Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Trash2, Users2,
  WandSparkles, X, Zap,
} from 'lucide-react';
import { api, type AdaptiveCompute, type CouncilMode, type CouncilRequest, type CouncilRole, type ExecutionSnapshot, type HistoryEntry, type ModelConfig, type ProviderKeys, type RoleMode, type TokenBudgets } from './api';

type View = 'compose' | 'history' | 'models';
type LooseRecord = Record<string, unknown>;

const TOKEN_DEFAULTS: TokenBudgets = {
  roleGenerator: 250,
  yesNoExpert: 120,
  debateInitial: 220,
  debateRebuttal: 140,
  crossEvaluation: 100,
  judge: 650,
};
const ROLE_COUNT: Record<CouncilMode, number> = { YES_NO: 5, DEBATE: 3 };
const STAGES = {
  YES_NO: ['ANALYZING', 'GENERATING_ROLES', 'RUNNING_EXPERTS', 'JUDGING', 'COMPLETE'],
  DEBATE: ['ANALYZING', 'GENERATING_ROLES', 'ROUND_1', 'CHECK_CONSENSUS', 'ROUND_2', 'ROUND_3', 'CROSS_EVALUATION', 'JUDGING', 'COMPLETE'],
} as const;
const STAGE_NAMES: Record<string, string> = {
  ANALYZING: 'Analyzing question', GENERATING_ROLES: 'Assembling specialists', RUNNING_EXPERTS: 'Experts reasoning in parallel',
  ROUND_1: 'Independent positions', CHECK_CONSENSUS: 'Checking agreement', ROUND_2: 'Targeted rebuttal',
  ROUND_3: 'Final targeted round', CROSS_EVALUATION: 'Cross evaluation', JUDGING: 'Final Judge reviewing',
  COMPLETE: 'Complete', FAILED: 'Failed', CANCELLED: 'Cancelled',
};

function object(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {};
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function get(record: LooseRecord, ...names: string[]): unknown {
  for (const name of names) if (record[name] !== undefined && record[name] !== null) return record[name];
  return undefined;
}
function titleCase(value: string): string { return value.replace(/[_-]/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }
function money(value: number): string { return value < 0.01 && value > 0 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`; }
function date(value: unknown): string {
  if (!value) return 'Recently';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 'Recently' : parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  const record = object(error);
  return string(get(record, 'message', 'error', 'code'), 'Something went wrong. Please try again.');
}
function modeLabel(mode: CouncilMode | null): string { return mode === 'YES_NO' ? 'YES / NO' : mode === 'DEBATE' ? 'DEBATE' : 'SELECT MODE'; }
function modeFrom(value: unknown): CouncilMode { return String(value).toUpperCase().includes('DEBATE') ? 'DEBATE' : 'YES_NO'; }
function normalizedRole(raw: CouncilRole): CouncilRole {
  const item = object(raw);
  return {
    id: string(item.id),
    title: string(get(item, 'title', 'role')),
    domain: string(item.domain), reason: string(item.reason),
    primaryQuestion: string(get(item, 'primaryQuestion', 'primary_question')),
    instructions: string(item.instructions), modelOverride: string(item.modelOverride) || null,
    locked: Boolean(item.locked),
  };
}
function resultData(raw: unknown): LooseRecord {
  const first = object(raw);
  return first.result && typeof first.result === 'object' && !('judge' in first) && !('judgeResult' in first)
    ? object(first.result) : first;
}
function judgeData(raw: LooseRecord): LooseRecord {
  const judge = get(raw, 'judge', 'judgeResult', 'finalAnswer', 'finalResult');
  const judgeRecord = object(judge);
  return Object.keys(object(judgeRecord.result)).length ? object(judgeRecord.result) :
    Object.keys(object(judgeRecord.output)).length ? object(judgeRecord.output) :
    Object.keys(judgeRecord).length ? judgeRecord : raw;
}
function usageData(raw: LooseRecord): { cost: number; costComplete: boolean; tokens: number; calls: number; latency: number; records: LooseRecord[] } {
  const usage = object(get(raw, 'usage', 'metrics', 'totals'));
  const records = list(get(raw, 'calls', 'modelCalls', 'usageRecords', 'usageByCall')).map(object);
  const stageRecords = list(get(usage, 'calls', 'byCall', 'records')).map(object);
  const allRecords = records.length ? records : stageRecords;
  const cost = number(get(raw, 'totalCost', 'estimatedCost'), number(get(usage, 'totalCost', 'cost'), allRecords.reduce((sum, item) => sum + number(get(item, 'estimatedCost', 'cost')), 0)));
  const tokens = number(get(raw, 'totalTokens'), number(get(usage, 'totalTokens', 'tokens'), allRecords.reduce((sum, item) => sum + number(item.inputTokens) + number(item.outputTokens), 0)));
  const calls = number(get(raw, 'totalCalls'), number(get(usage, 'totalCalls', 'calls'), allRecords.length));
  const latency = number(get(raw, 'totalLatency', 'totalLatencyMs'), number(get(usage, 'totalLatency', 'totalLatencyMs', 'latencyMs')));
  return { cost, costComplete: usage.costComplete !== false, tokens, calls, latency, records: allRecords };
}
function historyFields(raw: HistoryEntry): { id: string; question: string; mode: CouncilMode; createdAt: unknown; cost: number; status: string } {
  const item = object(raw);
  const session = object(item.session);
  return {
    id: string(get(item, 'id', 'sessionId'), string(session.id)),
    question: string(get(item, 'question'), string(session.question, 'Untitled council')),
    mode: modeFrom(get(item, 'mode') ?? session.mode),
    createdAt: get(item, 'createdAt') ?? session.createdAt,
    cost: number(get(item, 'cost', 'totalCost'), number(session.totalCost)),
    status: string(get(item, 'status'), 'complete'),
  };
}
function ModelSelect({ value, onChange, models, placeholder = 'Select a model', compact = false, id }: { value: string; onChange: (value: string) => void; models: ModelConfig[]; placeholder?: string; compact?: boolean; id?: string }) {
  return <div className={`select-wrap ${compact ? 'compact' : ''}`}>
    <select id={id} value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {models.filter(model => model.enabled).map(model => <option key={model.id} value={model.id}>{model.displayName} · {titleCase(model.tier)}</option>)}
    </select>
    <ChevronDown size={15} aria-hidden="true" />
  </div>;
}
function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="section-heading">
    <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {action && <div className="section-action">{action}</div>}
  </div>;
}
function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div></div>;
}

export default function App() {
  const [view, setView] = useState<View>('compose');
  const [mobileNav, setMobileNav] = useState(false);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providerKeys, setProviderKeys] = useState<ProviderKeys>({ gateway: false, openai: false, anthropic: false, google: false });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<CouncilMode | null>(null);
  const [roleMode, setRoleMode] = useState<RoleMode>('AUTO');
  const [roles, setRoles] = useState<CouncilRole[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewCost, setPreviewCost] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [roleGeneratorModelId, setRoleGeneratorModelId] = useState('');
  const [defaultExpertModelId, setDefaultExpertModelId] = useState('');
  const [judgeModelId, setJudgeModelId] = useState('');
  const [expertOverrides, setExpertOverrides] = useState<Record<number, string>>({});
  const [adaptiveCompute, setAdaptiveCompute] = useState<AdaptiveCompute>('BALANCED');
  const [maxCostInput, setMaxCostInput] = useState('');
  const [maxDebateRounds, setMaxDebateRounds] = useState(3);
  const [tokenBudgets, setTokenBudgets] = useState<TokenBudgets>(TOKEN_DEFAULTS);
  const [strongConfidence, setStrongConfidence] = useState(75);
  const [weakDissent, setWeakDissent] = useState(60);
  const [runImmediately, setRunImmediately] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [execution, setExecution] = useState<ExecutionSnapshot | null>(null);
  const [executionWarning, setExecutionWarning] = useState('');
  const [selectedResult, setSelectedResult] = useState<unknown>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState('');
  const pollRef = useRef<number | undefined>(undefined);

  const enabledModels = useMemo(() => models.filter(model => model.enabled), [models]);
  const selectedJudge = models.find(model => model.id === judgeModelId);
  const expertCount = mode ? ROLE_COUNT[mode] : 0;
  const hasActiveExecution = execution && ['running', 'pending', 'queued'].includes(execution.status.toLowerCase());

  const reloadBootstrap = useCallback(async () => {
    try {
      const response = await api.bootstrap();
      setModels(Array.isArray(response.models) ? response.models : []);
      setProviderKeys(response.providerKeys ?? { gateway: false, openai: false, anthropic: false, google: false });
      setHistory(Array.isArray(response.history) ? response.history : []);
      setBootError('');
    } catch (error) { setBootError(errorText(error)); }
    finally { setBootLoading(false); }
  }, []);
  useEffect(() => { void reloadBootstrap(); }, [reloadBootstrap]);
  useEffect(() => {
    if (!models.length) return;
    const available = models.filter(model => model.enabled && providerKeys[model.provider as keyof ProviderKeys]);
    const fallback = models.filter(model => model.enabled);
    const selectable = available.length ? available : fallback;
    const cheapest = [...selectable].sort((a, b) => (a.inputCostPerMillion ?? 999) - (b.inputCostPerMillion ?? 999));
    if (!selectable.some(model => model.id === roleGeneratorModelId)) setRoleGeneratorModelId((cheapest.find(model => model.tier === 'economy') ?? cheapest[0])?.id ?? '');
    if (!selectable.some(model => model.id === defaultExpertModelId)) setDefaultExpertModelId((selectable.find(model => model.tier === 'standard') ?? cheapest[0])?.id ?? '');
    if (!selectable.some(model => model.id === judgeModelId)) setJudgeModelId((selectable.find(model => model.tier === 'judge') ?? selectable.find(model => model.tier === 'premium'))?.id ?? '');
  }, [models, providerKeys, roleGeneratorModelId, defaultExpertModelId, judgeModelId]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!execution?.id || !hasActiveExecution) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await api.execution(execution.id);
        if (cancelled) return;
        setExecution(next);
        if (next.status.toLowerCase() === 'complete') {
          setSelectedResult(next.result);
          setExecutionWarning(next.warning ? errorText(next.warning) : '');
          setSelectedHistoryId(null);
          void reloadBootstrap();
        }
        if (next.status.toLowerCase() === 'failed') setFormError(errorText(next.error));
      } catch (error) {
        if (!cancelled) {
          const message = `Execution interrupted: ${errorText(error)} Start a new council to try again.`;
          setExecution(current => current ? { ...current, status: 'failed', stage: 'FAILED', error: { message } } : null);
          setFormError(message);
        }
      }
    };
    pollRef.current = window.setInterval(() => void refresh(), 1400);
    void refresh();
    return () => { cancelled = true; window.clearInterval(pollRef.current); };
  }, [execution?.id, hasActiveExecution, reloadBootstrap]);

  function switchMode(next: CouncilMode) {
    setMode(next); setPreviewReady(false); setPreviewId(null); setPreviewCost(0); setFormError('');
    setRoles(current => roleMode === 'AUTO' ? [] : current.slice(0, ROLE_COUNT[next]));
    setExpertOverrides(current => Object.fromEntries(Object.entries(current).filter(([index]) => Number(index) < ROLE_COUNT[next])));
  }
  function switchRoleMode(next: RoleMode) {
    setRoleMode(next); setPreviewReady(false); setPreviewId(null); setPreviewCost(0); setFormError('');
    if (next === 'AUTO') setRoles([]);
    else if (next === 'MANUAL') setRoles(current => current.length ? current.map(role => ({ ...role, locked: true })) : [{ title: '', instructions: '', locked: true }]);
    else setRoles(current => current.length ? current.map(role => ({ ...role, locked: true })) : [{ title: '', instructions: '', locked: true }]);
  }
  function editRole(index: number, changes: Partial<CouncilRole>) {
    setRoles(current => current.map((role, position) => position === index ? { ...role, ...changes } : role));
  }
  function makeRequest(usePreview = false): CouncilRequest | null {
    setFormError('');
    if (!question.trim()) { setFormError('Write a question for the council.'); return null; }
    if (!mode) { setFormError('Choose YES / NO or Debate before running.'); return null; }
    if (!defaultExpertModelId || !enabledModels.some(model => model.id === defaultExpertModelId)) { setFormError('Select a default expert model.'); return null; }
    if (!judgeModelId || !enabledModels.some(model => model.id === judgeModelId)) { setFormError('A Final Judge model is required.'); return null; }
    for (const [label, id] of [['expert', defaultExpertModelId], ['Final Judge', judgeModelId], ...(roleMode === 'MANUAL' ? [] : [['Role Generator', roleGeneratorModelId]])]) {
      const selected = models.find(model => model.id === id);
      if (selected && !providerKeys[selected.provider as keyof ProviderKeys]) { setFormError(`${titleCase(label)} provider key is not configured. Add it to the server environment before running.`); return null; }
    }
    if ((roleMode === 'AUTO' || roleMode === 'HYBRID') && !roleGeneratorModelId) { setFormError('Select a Role Generator model.'); return null; }
    const explicitRoles = roles.map(normalizedRole);
    if (roleMode === 'MANUAL' && (!previewReady || !usePreview) && (explicitRoles.length !== expertCount || explicitRoles.some(role => !role.title.trim()))) {
      setFormError(`Manual council needs exactly ${expertCount} named experts.`); return null;
    }
    if (roleMode === 'HYBRID' && !previewReady && (explicitRoles.length < 1 || explicitRoles.some(role => !role.title.trim()) || explicitRoles.length > expertCount)) {
      setFormError(`Add between 1 and ${expertCount} named roles for Hybrid mode.`); return null;
    }
    if (previewReady && explicitRoles.length !== expertCount) { setFormError(`Review the ${expertCount} experts before continuing.`); return null; }
    const maxCost = maxCostInput ? Number(maxCostInput) : undefined;
    if (maxCostInput && (!Number.isFinite(maxCost) || !maxCost || maxCost <= 0)) { setFormError('Enter a valid positive budget.'); return null; }
    const selectedRoles = roleMode === 'AUTO' && !previewReady ? [] : explicitRoles;
    const overrides = Object.fromEntries(Object.entries(expertOverrides).filter(([, value]) => value));
    return {
      question: question.trim(), mode, roleMode,
      roles: selectedRoles.map((role, index) => ({ ...role, locked: roleMode === 'MANUAL' ? true : Boolean(role.locked), modelOverride: expertOverrides[index] || role.modelOverride || null })),
      approvedRoles: previewReady && !usePreview ? selectedRoles.map((role, index) => ({ ...role, id: role.id || `expert-${index + 1}`, domain: role.domain || role.title, reason: role.reason || 'Selected by the user.', primaryQuestion: role.primaryQuestion || question.trim(), modelOverride: expertOverrides[index] || role.modelOverride || null })) : undefined,
      previewId: previewId || undefined,
      models: { roleGeneratorModelId: roleGeneratorModelId || undefined, defaultExpertModelId, judgeModelId, expertModelOverrides: overrides },
      settings: { adaptiveCompute, maxCost, maxDebateRounds, tokenBudgets, consensus: { strongConfidence, weakDissent }, runImmediately },
    };
  }
  async function previewRoles() {
    const payload = makeRequest(true);
    if (!payload) return;
    if (roleMode === 'MANUAL') { setPreviewReady(true); setToast('Manual lineup is ready to run.'); return; }
    setPreviewing(true);
    try {
      const locked = previewReady ? roles.filter(role => role.locked) : [];
      const response = await api.previewRoles(locked.length ? { ...payload, roleMode: 'HYBRID', roles: locked } : payload);
      const received = list(response.roles).map(raw => normalizedRole(raw as CouncilRole));
      if (received.length !== expertCount) throw new Error(`Role Generator returned ${received.length} roles; expected ${expertCount}.`);
      setRoles(received.map(role => ({ ...role, locked: locked.some(item => item.title === role.title) })));
      setPreviewReady(true);
      setPreviewId(response.previewId || null);
      setPreviewCost(number(object(response.usage).totalCost));
      setToast('Council lineup is ready. Review or run it.');
    } catch (error) { setFormError(errorText(error)); }
    finally { setPreviewing(false); }
  }
  async function regenerateRole(index: number) {
    if (!mode) return;
    const retained = roles.filter((_, position) => position !== index).map(role => ({ ...role, locked: true }));
    const base = makeRequest(true);
    if (!base) return;
    setPreviewing(true);
    try {
      const response = await api.previewRoles({ ...base, roleMode: 'HYBRID', roles: retained });
      const candidate = list(response.roles).map(raw => normalizedRole(raw as CouncilRole)).find(role => !retained.some(locked => locked.title === role.title));
      if (!candidate) throw new Error('No replacement role was returned.');
      editRole(index, candidate);
      setPreviewId(response.previewId || null);
      setPreviewCost(number(object(response.usage).totalCost));
      setToast('Role regenerated.');
    } catch (error) { setFormError(errorText(error)); }
    finally { setPreviewing(false); }
  }
  async function startCouncil() {
    if (!runImmediately && !previewReady && roleMode !== 'MANUAL') { await previewRoles(); return; }
    const payload = makeRequest();
    if (!payload) return;
    setActionBusy(true); setSelectedResult(null); setSelectedHistoryId(null); setExecutionWarning('');
    try {
      const response = await api.start(payload);
      setExecution({ id: response.id, status: 'running', stage: 'ANALYZING' });
      setToast('Council started.');
    } catch (error) { setFormError(errorText(error)); }
    finally { setActionBusy(false); }
  }
  async function cancelCouncil() {
    if (!execution?.id) return;
    setActionBusy(true);
    try {
      const response = await api.cancel(execution.id);
      setExecution(current => current ? { ...current, ...response, status: 'cancelled' } : null);
      setToast('Execution cancelled.');
      void reloadBootstrap();
    } catch (error) { setFormError(errorText(error)); }
    finally { setActionBusy(false); }
  }
  async function openHistory(id: string) {
    setHistoryLoading(true); setFormError(''); setView('history'); setSelectedHistoryId(id);
    try { setSelectedResult(await api.history(id)); }
    catch (error) { setFormError(errorText(error)); setSelectedResult(null); }
    finally { setHistoryLoading(false); }
  }
  function newCouncil() {
    setView('compose'); setSelectedResult(null); setSelectedHistoryId(null); setExecution(null); setFormError('');
    setQuestion(''); setMode(null); setRoles([]); setRoleMode('AUTO'); setPreviewReady(false); setPreviewId(null); setPreviewCost(0); setExecutionWarning('');
  }

  const estimate = useMemo(() => {
    if (!mode || !judgeModelId || !defaultExpertModelId) return null;
    const roleModel = models.find(item => item.id === roleGeneratorModelId);
    const expertModel = models.find(item => item.id === defaultExpertModelId);
    const judgeModel = models.find(item => item.id === judgeModelId);
    if (!expertModel || !judgeModel) return null;
    const estimateCall = (model: ModelConfig | undefined, input: number, output: number) => model && model.inputCostPerMillion !== undefined && model.outputCostPerMillion !== undefined
      ? (input * model.inputCostPerMillion + output * model.outputCostPerMillion) / 1_000_000 : null;
    const roleCost = previewReady ? previewCost : roleMode === 'MANUAL' ? 0 : estimateCall(roleModel, 350, tokenBudgets.roleGenerator);
    const expertTokens = mode === 'YES_NO' ? tokenBudgets.yesNoExpert : tokenBudgets.debateInitial;
    const expertModels = Array.from({ length: ROLE_COUNT[mode] }, (_, index) => models.find(item => item.id === (expertOverrides[index] || roles[index]?.modelOverride || defaultExpertModelId)) ?? expertModel);
    const expertCosts = expertModels.map(model => estimateCall(model, 500, expertTokens));
    const judgeCost = estimateCall(judgeModel, 1400, tokenBudgets.judge);
    if (roleCost === null || expertCosts.some(cost => cost === null) || judgeCost === null) return null;
    const firstRound = roleCost + expertCosts.reduce((sum, cost) => sum + (cost ?? 0), 0) + judgeCost;
    const extra = mode === 'DEBATE' ? expertModels.reduce((sum, model) => sum + (maxDebateRounds - 1) * (estimateCall(model, 800, tokenBudgets.debateRebuttal) ?? 0) + (estimateCall(model, 650, tokenBudgets.crossEvaluation) ?? 0), 0) : 0;
    return { low: firstRound, high: firstRound + extra };
  }, [mode, models, roleGeneratorModelId, defaultExpertModelId, judgeModelId, roleMode, previewReady, previewCost, tokenBudgets, maxDebateRounds, roles, expertOverrides]);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span className="brand-orbit one" /><span className="brand-orbit two" /><span className="brand-core" /></div><div><strong>COUNCIL</strong><small>Decision intelligence</small></div></div>
      <div className="workspace-label">WORKSPACE <span>PERSONAL</span></div>
      <nav className="nav-list" aria-label="Main navigation">
        <button className={view === 'compose' ? 'active' : ''} onClick={() => { setView('compose'); setMobileNav(false); }}><Sparkles size={18} /> New council <ChevronRight size={16} /></button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => { setView('history'); setMobileNav(false); }}><FileClock size={18} /> History <span className="nav-count">{history.length}</span></button>
        <button className={view === 'models' ? 'active' : ''} onClick={() => { setView('models'); setMobileNav(false); }}><Layers3 size={18} /> Model registry <ChevronRight size={16} /></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="side-note"><div className="side-note-icon"><ShieldCheck size={18} /></div><strong>Deliberate by design</strong><p>Independent specialists. Compact reasoning. One decisive final Judge.</p></div>
        <div className="side-footer"><span className="signal" /> Local workspace <span>v1.0</span></div>
      </div>
    </aside>

    <div className="app-main">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={20} /></button><div className="breadcrumbs">Workspace <ChevronRight size={14} /> <strong>{view === 'compose' ? 'New council' : view === 'history' ? 'History' : 'Model registry'}</strong></div><div className="topbar-actions"><span className="top-status"><span className="signal" /> System ready</span><button className="avatar" title="Personal workspace">CY</button></div></header>

      {bootError && <div className="global-error"><CircleHelp size={17} /> {bootError} <button onClick={() => void reloadBootstrap()}>Retry</button></div>}
      {view === 'compose' && <main className="content-grid">
        <div className="content-primary">
          {selectedResult ? <ResultView raw={selectedResult} mode={mode ?? undefined} warning={executionWarning} onNew={newCouncil} onHistory={() => setView('history')} /> : <>
            <div className="page-intro"><div className="intro-kicker"><span className="spark-dot" /> INTELLIGENT DELIBERATION <span className="intro-line" /></div><h1>Ask the right minds.<br /><em>Get a better answer.</em></h1><p>Bring distinct expert perspectives together, then let a capable Judge make the final call.</p></div>
            <section className="panel compose-panel"><SectionHeading eyebrow="01 / THE BRIEF" title="What are you deciding?" description="Give the council a specific question and any context it needs." />
              <label className="visually-hidden" htmlFor="question">Question</label><textarea id="question" className="question-input" value={question} onChange={event => { setQuestion(event.target.value); setPreviewReady(false); setPreviewId(null); setPreviewCost(0); if (roleMode === 'AUTO') setRoles([]); }} placeholder="e.g. Should we build a native mobile app before improving our web experience?" rows={4} maxLength={5000} disabled={Boolean(hasActiveExecution)} />
              <div className="input-footer"><span><ShieldCheck size={14} /> Private to this workspace</span><span>{question.length} / 5,000</span></div>
            </section>

            <section className="panel mode-panel"><SectionHeading eyebrow="02 / DECISION FORMAT" title="Choose a council mode" description="The format determines how your experts deliberate." />
              <div className="mode-grid"><button className={`mode-card ${mode === 'YES_NO' ? 'selected' : ''}`} onClick={() => switchMode('YES_NO')} disabled={Boolean(hasActiveExecution)}><span className="mode-icon binary">Y<span>/</span>N</span><span className="mode-card-copy"><strong>YES / NO</strong><small>A clear decision on a binary proposition. Five independent experts, one final verdict.</small></span><span className="radio-mark">{mode === 'YES_NO' && <Check size={13} />}</span></button><button className={`mode-card ${mode === 'DEBATE' ? 'selected' : ''}`} onClick={() => switchMode('DEBATE')} disabled={Boolean(hasActiveExecution)}><span className="mode-icon"><GitBranch size={22} /></span><span className="mode-card-copy"><strong>DEBATE</strong><small>Test competing strategies with three specialists and targeted rebuttals.</small></span><span className="radio-mark">{mode === 'DEBATE' && <Check size={13} />}</span></button></div>
              {!mode && <div className="inline-hint"><ArrowRight size={14} /> Select a mode before submitting your question.</div>}
            </section>

            <section className="panel roles-panel"><SectionHeading eyebrow="03 / EXPERT PERSPECTIVES" title="Assemble your council" description={mode ? `${expertCount} distinct experts will analyze the question.` : 'Choose a mode to set the council size.'} action={previewReady ? <span className="ready-badge"><CheckCircle2 size={14} /> Lineup ready</span> : undefined} />
              <div className="segmented" role="group" aria-label="Role assignment mode"><button className={roleMode === 'AUTO' ? 'active' : ''} onClick={() => switchRoleMode('AUTO')} disabled={Boolean(hasActiveExecution)}><WandSparkles size={15} /> Auto</button><button className={roleMode === 'MANUAL' ? 'active' : ''} onClick={() => switchRoleMode('MANUAL')} disabled={Boolean(hasActiveExecution)}><Users2 size={15} /> Manual</button><button className={roleMode === 'HYBRID' ? 'active' : ''} onClick={() => switchRoleMode('HYBRID')} disabled={Boolean(hasActiveExecution)}><LockKeyhole size={15} /> Hybrid</button></div>
              <p className="role-explainer">{roleMode === 'AUTO' ? 'The Role Architect selects complementary specialists for this question.' : roleMode === 'MANUAL' ? `Name all ${expertCount || 'required'} specialists yourself. Their roles are preserved exactly.` : 'Lock the specialists you want; the Role Architect fills the remaining seats.'}</p>
              {roles.length > 0 && <div className="role-list">{roles.map((role, index) => <RoleEditor key={index} index={index} role={role} mode={roleMode} models={enabledModels} modelValue={expertOverrides[index] || role.modelOverride || ''} onModelChange={value => setExpertOverrides(current => ({ ...current, [index]: value }))} onChange={changes => editRole(index, changes)} onRemove={() => { setRoles(current => current.filter((_, position) => position !== index)); setPreviewReady(false); }} onRegenerate={previewReady && roleMode !== 'MANUAL' ? () => void regenerateRole(index) : undefined} disabled={Boolean(hasActiveExecution) || previewing} />)}</div>}
              {!roles.length && <div className="empty-roles"><div className="empty-orbit"><Users2 size={22} /></div><strong>{roleMode === 'AUTO' ? 'Your specialists will appear here' : 'Start with a specialist'}</strong><span>{roleMode === 'AUTO' ? 'Preview the council or run immediately to assemble the lineup.' : 'Add roles with distinct responsibilities and expertise.'}</span></div>}
              <div className="role-actions">{roleMode !== 'AUTO' && !previewReady && mode && roles.length < expertCount && <button className="text-button" onClick={() => setRoles(current => [...current, { title: '', instructions: '', locked: true }])}><Plus size={16} /> Add specialist <span>{roles.length}/{expertCount}</span></button>}{roleMode !== 'MANUAL' && <button className="text-button muted" onClick={() => void previewRoles()} disabled={!mode || previewing || Boolean(hasActiveExecution)}><Eye size={16} /> {previewing ? 'Assembling…' : previewReady ? 'Regenerate lineup' : 'Preview roles'}</button>}</div>
            </section>

            <section className="panel model-panel"><SectionHeading eyebrow="04 / MODEL ASSIGNMENT" title="Assign the right models" description="Use efficient models for exploration and a stronger model for the final answer." action={<button className="plain-link" onClick={() => setView('models')}>Manage registry <ArrowRight size={15} /></button>} />
              <div className="model-row"><div className="model-row-icon"><WandSparkles size={18} /></div><div className="model-row-copy"><strong>Role Generator</strong><span>Builds the expert lineup</span></div><ModelSelect value={roleGeneratorModelId} onChange={setRoleGeneratorModelId} models={models} placeholder="Select role model" /></div>
              <div className="model-row"><div className="model-row-icon"><Users2 size={18} /></div><div className="model-row-copy"><strong>Default Expert</strong><span>Independent specialist analysis</span></div><ModelSelect value={defaultExpertModelId} onChange={setDefaultExpertModelId} models={models} placeholder="Select expert model" /></div>
              <div className="model-row judge-row"><div className="model-row-icon"><ShieldCheck size={18} /></div><div className="model-row-copy"><strong>Final Judge <span className="required-pill">REQUIRED</span></strong><span>Adjudicates the final answer</span></div><ModelSelect value={judgeModelId} onChange={setJudgeModelId} models={models} placeholder="Select Judge model" /></div>
              {selectedJudge && !['premium', 'judge'].includes(selectedJudge.tier) && <div className="inline-hint warning"><CircleHelp size={15} /> A premium Judge is recommended for stronger final decisions.</div>}
              {models.length === 0 && !bootLoading && <div className="inline-hint warning"><CircleHelp size={15} /> No models configured. Add a provider model in the registry before running.</div>}
              {!Object.values(providerKeys).some(Boolean) && !bootLoading && <div className="inline-hint warning"><CircleHelp size={15} /> Add a provider API key to the server environment and restart the app before running.</div>}
            </section>

            <section className={`panel advanced-panel ${advancedOpen ? 'open' : ''}`}><button className="advanced-toggle" onClick={() => setAdvancedOpen(!advancedOpen)} aria-expanded={advancedOpen}><div className="advanced-title"><div className="advanced-icon"><SlidersHorizontal size={18} /></div><div><strong>Advanced settings</strong><span>Budgets, adaptive compute and execution controls</span></div></div><ChevronDown size={19} /></button>{advancedOpen && <AdvancedSettings mode={mode} count={expertCount} adaptiveCompute={adaptiveCompute} setAdaptiveCompute={setAdaptiveCompute} maxCostInput={maxCostInput} setMaxCostInput={setMaxCostInput} maxDebateRounds={maxDebateRounds} setMaxDebateRounds={setMaxDebateRounds} tokenBudgets={tokenBudgets} setTokenBudgets={setTokenBudgets} strongConfidence={strongConfidence} setStrongConfidence={setStrongConfidence} weakDissent={weakDissent} setWeakDissent={setWeakDissent} runImmediately={runImmediately} setRunImmediately={setRunImmediately} overrides={expertOverrides} setOverrides={setExpertOverrides} models={enabledModels} />}</section>

            {formError && <div className="form-error"><CircleHelp size={17} /><span>{formError}</span><button onClick={() => setFormError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
            <div className="submit-bar"><div className="submit-caption"><span className="submit-symbol"><Zap size={17} /></span><div><strong>Ready when you are</strong><span>{mode ? `${expertCount} experts · 1 final Judge` : 'Choose a mode to begin'}</span></div></div><button className="primary-button" onClick={() => void startCouncil()} disabled={actionBusy || Boolean(hasActiveExecution)}>{actionBusy ? 'Starting council…' : !runImmediately && !previewReady && roleMode !== 'MANUAL' ? 'Preview council' : 'Run council'} <ArrowRight size={18} /></button></div>
          </>}
        </div>

        <aside className="content-rail"><div className="rail-sticky">
          {hasActiveExecution && <ExecutionCard execution={execution!} mode={mode} onCancel={() => void cancelCouncil()} cancelling={actionBusy} />}
          <div className="rail-card estimate-card"><div className="rail-card-heading"><span>EXECUTION ESTIMATE</span><Coins size={18} /></div><div className="estimate-value">{estimate ? `${money(estimate.low)} – ${money(estimate.high)}` : '—'}</div><p>{estimate ? 'Approximate provider cost based on configured model pricing and token caps.' : 'Select a mode and priced models to see an estimate.'}</p><div className="rail-divider" /><div className="rail-data"><span>Expert seats</span><strong>{mode ? String(expertCount).padStart(2, '0') : '—'}</strong></div><div className="rail-data"><span>Debate rounds</span><strong>{mode === 'DEBATE' ? `Up to ${maxDebateRounds}` : mode ? '1' : '—'}</strong></div><div className="rail-data"><span>Final Judge</span><strong>{selectedJudge ? selectedJudge.displayName : 'Required'}</strong></div></div>
          <div className="rail-card process-card"><div className="rail-card-heading"><span>HOW IT WORKS</span><Activity size={17} /></div><div className="process-line"><div><span>01</span><strong>Distinct experts</strong><small>Independent first perspectives</small></div><div><span>02</span><strong>Focused synthesis</strong><small>Only useful rounds continue</small></div><div><span>03</span><strong>Final Judge</strong><small>One clear, reasoned answer</small></div></div></div>
          <div className="rail-tip"><span className="tip-mark">✦</span><p><strong>Better prompts, better decisions.</strong> Include your constraints, priorities and what a good outcome looks like.</p></div>
        </div></aside>
      </main>}

      {view === 'history' && <main className="single-page"><div className="single-page-header"><div><span className="eyebrow">PAST DELIBERATIONS</span><h1>Decision history</h1><p>Revisit previous conclusions and inspect their cost and expert perspectives.</p></div><button className="secondary-button" onClick={newCouncil}><Plus size={17} /> New council</button></div>{selectedHistoryId ? <div className="history-detail"><button className="back-link" onClick={() => { setSelectedHistoryId(null); setSelectedResult(null); }}><ArrowLeft size={17} /> All decisions</button>{historyLoading ? <div className="loading-state"><RefreshCw className="spin" size={22} /> Loading decision…</div> : selectedResult ? <ResultView raw={selectedResult} onNew={newCouncil} compact /> : <div className="empty-state">Could not load this decision.</div>}</div> : history.length ? <div className="history-list">{history.map((entry, index) => { const item = historyFields(entry); return <button key={item.id || index} className="history-item" onClick={() => void openHistory(item.id)}><div className={`history-icon ${item.mode === 'DEBATE' ? 'debate' : ''}`}>{item.mode === 'DEBATE' ? <GitBranch size={19} /> : <span>Y/N</span>}</div><div className="history-main"><strong>{item.question}</strong><span>{date(item.createdAt)} <span className="history-dot">·</span> {modeLabel(item.mode)} <span className="history-dot">·</span> {titleCase(item.status)}</span></div><div className="history-cost">{item.cost ? money(item.cost) : '—'}</div><ChevronRight size={18} /></button>; })}</div> : <div className="empty-state"><FileClock size={25} /><strong>No decisions yet</strong><span>Your completed council runs will appear here.</span><button className="primary-button" onClick={newCouncil}>Start a council <ArrowRight size={17} /></button></div>}</main>}

      {view === 'models' && <ModelRegistry models={models} providerKeys={providerKeys} onSaved={async () => { await reloadBootstrap(); setToast('Model registry saved.'); }} onBack={() => setView('compose')} />}
      {toast && <div className="toast"><CheckCircle2 size={18} /> {toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  </div>;
}

function RoleEditor({ index, role, mode, models, modelValue, onModelChange, onChange, onRemove, onRegenerate, disabled }: {
  index: number; role: CouncilRole; mode: RoleMode; models: ModelConfig[]; modelValue: string;
  onModelChange: (value: string) => void; onChange: (changes: Partial<CouncilRole>) => void;
  onRemove: () => void; onRegenerate?: () => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <div className={`role-editor ${role.locked ? 'locked' : ''}`}>
    <div className="role-editor-top"><span className="role-number">{String(index + 1).padStart(2, '0')}</span><div className="role-fields"><label className="visually-hidden" htmlFor={`role-title-${index}`}>Specialist {index + 1} title</label><input id={`role-title-${index}`} value={role.title} onChange={event => onChange({ title: event.target.value })} placeholder="e.g. Marketplace Product Manager" maxLength={120} disabled={disabled} /><span>{role.domain || (mode === 'AUTO' ? 'Generated specialist' : 'Custom specialist')}</span></div><div className="role-tools">{mode !== 'MANUAL' && <button className={`icon-button lock-button ${role.locked ? 'active' : ''}`} onClick={() => onChange({ locked: !role.locked })} disabled={disabled} title={role.locked ? 'Unlock role' : 'Lock role'} aria-label={role.locked ? 'Unlock role' : 'Lock role'}><LockKeyhole size={15} /></button>}{onRegenerate && !role.locked && <button className="icon-button" onClick={onRegenerate} disabled={disabled} title="Regenerate this role" aria-label="Regenerate role"><RotateCcw size={15} /></button>}{mode !== 'AUTO' && <button className="icon-button" onClick={onRemove} disabled={disabled} title="Remove specialist" aria-label="Remove specialist"><X size={16} /></button>}<button className="icon-button expand-role" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse role details' : 'Expand role details'} aria-expanded={open}><ChevronDown size={16} /></button></div></div>
    {open && <div className="role-detail"><div className="field-grid"><label>Domain<input value={role.domain || ''} onChange={event => onChange({ domain: event.target.value })} placeholder="Area of expertise" disabled={disabled} /></label><label>Model override<ModelSelect value={modelValue} onChange={onModelChange} models={models} placeholder="Use default expert model" compact /></label></div><label>Primary question<input value={role.primaryQuestion || ''} onChange={event => onChange({ primaryQuestion: event.target.value })} placeholder="What should this expert focus on?" disabled={disabled} /></label><label>Custom instructions<textarea value={role.instructions || ''} onChange={event => onChange({ instructions: event.target.value })} placeholder="Optional guidance for this specialist" rows={2} disabled={disabled} /></label>{role.reason && <p className="role-reason"><Sparkles size={13} /> {role.reason}</p>}</div>}
  </div>;
}

function AdvancedSettings({ mode, count, adaptiveCompute, setAdaptiveCompute, maxCostInput, setMaxCostInput, maxDebateRounds, setMaxDebateRounds, tokenBudgets, setTokenBudgets, strongConfidence, setStrongConfidence, weakDissent, setWeakDissent, runImmediately, setRunImmediately, overrides, setOverrides, models }: {
  mode: CouncilMode | null; count: number; adaptiveCompute: AdaptiveCompute; setAdaptiveCompute: (value: AdaptiveCompute) => void;
  maxCostInput: string; setMaxCostInput: (value: string) => void; maxDebateRounds: number; setMaxDebateRounds: (value: number) => void;
  tokenBudgets: TokenBudgets; setTokenBudgets: (value: TokenBudgets) => void;
  strongConfidence: number; setStrongConfidence: (value: number) => void; weakDissent: number; setWeakDissent: (value: number) => void;
  runImmediately: boolean; setRunImmediately: (value: boolean) => void; overrides: Record<number, string>; setOverrides: React.Dispatch<React.SetStateAction<Record<number, string>>>; models: ModelConfig[];
}) {
  const tokenFields: { key: keyof TokenBudgets; label: string }[] = [
    { key: 'roleGenerator', label: 'Role Generator' }, { key: 'yesNoExpert', label: 'YES / NO Expert' },
    { key: 'debateInitial', label: 'Debate position' }, { key: 'debateRebuttal', label: 'Debate rebuttal' },
    { key: 'crossEvaluation', label: 'Cross evaluation' }, { key: 'judge', label: 'Final Judge' },
  ];
  return <div className="advanced-body">
    <div className="advanced-block"><div className="advanced-block-head"><strong>Adaptive compute</strong><span>How much reasoning to spend</span></div><div className="compute-options">{(['LOW', 'BALANCED', 'HIGH'] as const).map(option => <button key={option} className={adaptiveCompute === option ? 'active' : ''} onClick={() => setAdaptiveCompute(option)}><strong>{titleCase(option)}</strong><small>{option === 'LOW' ? 'Lower cost' : option === 'BALANCED' ? 'Recommended' : 'More depth'}</small></button>)}</div></div>
    <div className="advanced-block"><div className="advanced-block-head"><strong>Maximum cost per request</strong><span>Optional budget guard in US dollars</span></div><div className="budget-options">{['', '0.05', '0.10', '0.25', '0.50'].map(value => <button key={value || 'none'} className={maxCostInput === value ? 'active' : ''} onClick={() => setMaxCostInput(value)}>{value ? `$${value}` : 'No cap'}</button>)}<label className="budget-custom">Custom $<input aria-label="Custom maximum cost" type="number" min="0.001" step="0.01" value={maxCostInput} onChange={event => setMaxCostInput(event.target.value)} placeholder="0.00" /></label></div></div>
    {mode === 'DEBATE' && <div className="advanced-block"><div className="advanced-block-head"><strong>Debate rounds</strong><span>Stops early if experts agree or stop adding information</span></div><div className="round-options">{[1, 2, 3].map(value => <button key={value} className={maxDebateRounds === value ? 'active' : ''} onClick={() => setMaxDebateRounds(value)}>{value} {value === 1 ? 'round' : 'rounds'}</button>)}</div><div className="threshold-grid"><label>Strong confidence <span>{strongConfidence}%</span><input type="range" min="50" max="100" value={strongConfidence} onChange={event => setStrongConfidence(Number(event.target.value))} /></label><label>Weak dissent <span>{weakDissent}%</span><input type="range" min="0" max="90" value={weakDissent} onChange={event => setWeakDissent(Number(event.target.value))} /></label></div></div>}
    <div className="advanced-block"><div className="advanced-block-head"><strong>Output token caps</strong><span>50–2,000 tokens per model call</span></div><div className="token-grid">{tokenFields.filter(field => mode !== 'YES_NO' || !['debateInitial', 'debateRebuttal', 'crossEvaluation'].includes(field.key)).map(field => <label key={field.key}>{field.label}<input type="number" min="50" max="2000" step="10" value={tokenBudgets[field.key]} onChange={event => setTokenBudgets({ ...tokenBudgets, [field.key]: Math.min(2000, Math.max(50, Number(event.target.value) || 50)) })} /></label>)}</div></div>
    {count > 0 && <div className="advanced-block"><div className="advanced-block-head"><strong>Per expert model overrides</strong><span>Leave blank to use the default expert model</span></div><div className="override-grid">{Array.from({ length: count }, (_, index) => <div key={index}><label htmlFor={`override-${index}`}>Expert {String(index + 1).padStart(2, '0')}</label><ModelSelect id={`override-${index}`} compact value={overrides[index] || ''} onChange={value => setOverrides(current => ({ ...current, [index]: value }))} models={models} placeholder="Default model" /></div>)}</div></div>}
    <div className="advanced-block last"><label className="setting-toggle"><div><strong>Run immediately</strong><span>Skip role preview when you start a council</span></div><input type="checkbox" checked={runImmediately} onChange={event => setRunImmediately(event.target.checked)} /><span className="switch-track" /></label></div>
  </div>;
}

function ExecutionCard({ execution, mode, onCancel, cancelling }: { execution: ExecutionSnapshot; mode: CouncilMode | null; onCancel: () => void; cancelling: boolean }) {
  const stages: readonly string[] = STAGES[mode ?? 'YES_NO'];
  const current = String(execution.stage ?? 'ANALYZING').toUpperCase();
  const stageIndex = stages.findIndex(stage => stage === current);
  const visibleStages: readonly string[] = mode === 'DEBATE' ? stages : STAGES.YES_NO;
  const events = list(execution.events).slice(-3).map(object);
  return <div className="rail-card execution-card"><div className="execution-head"><div className="running-pulse" /><div><span>COUNCIL IN PROGRESS</span><strong>{STAGE_NAMES[current] || titleCase(current)}</strong></div></div><div className="execution-progress"><div style={{ width: `${Math.max(5, Math.round(((stageIndex + 1) / stages.length) * 100))}%` }} /></div><div className="execution-steps">{visibleStages.filter(stage => stage !== 'CHECK_CONSENSUS' && stage !== 'COMPLETE').map(stage => { const reached = stages.indexOf(stage) <= stageIndex; return <div key={stage} className={reached ? 'reached' : ''}><span>{reached ? <Check size={11} /> : null}</span>{STAGE_NAMES[stage]}</div>; })}</div>{events.length > 0 && <div className="execution-event">{string(get(events[events.length - 1], 'message'), 'Reasoning in progress…')}</div>}<button className="cancel-button" onClick={onCancel} disabled={cancelling}><Square size={13} /> {cancelling ? 'Cancelling…' : 'Cancel execution'}</button></div>;
}

function ResultView({ raw, mode, warning, onNew, onHistory, compact = false }: { raw: unknown; mode?: CouncilMode; warning?: string; onNew: () => void; onHistory?: () => void; compact?: boolean }) {
  const data = resultData(raw);
  const judge = judgeData(data);
  const resultMode = modeFrom(get(data, 'mode') ?? mode);
  const usage = usageData(data);
  const expertRuns = list(get(data, 'experts', 'expertRuns')).map(object);
  const rounds = list(data.rounds).map(object);
  const consensus = object(get(judge, 'expert_consensus', 'expertConsensus'));
  const decision = string(judge.decision, '—').toUpperCase();
  const confidence = number(judge.confidence);
  const degraded = Boolean(data.degraded);
  const terminationReason = string(data.terminationReason);
  const roleName = (run: LooseRecord, index: number) => string(get(object(run.role), 'title', 'role'), string(run.role, `Expert ${index + 1}`));
  const runAnswer = (run: LooseRecord) => object(get(run, 'answer', 'result', 'structuredResult'));
  const resultTitle = resultMode === 'YES_NO' ? 'The decision is in.' : 'A clear way forward.';
  return <div className={`result-view ${compact ? 'compact-result' : ''}`}><div className="result-intro"><div><span className="eyebrow"><CheckCircle2 size={15} /> COUNCIL COMPLETE</span><h1>{resultTitle}</h1><p>{string(data.question)}</p></div><button className="secondary-button" onClick={onNew}><Plus size={17} /> New council</button></div>
    {warning && <div className="result-notice"><CircleHelp size={17} /> {warning}</div>}
    {degraded && <div className="result-notice"><CircleHelp size={17} /> The council completed with fewer experts because a model call failed. The Judge was informed.</div>}
    {resultMode === 'YES_NO' ? <section className={`verdict-card ${decision === 'NO' ? 'no' : ''}`}><div className="verdict-top"><span>FINAL VERDICT</span><span><ShieldCheck size={16} /> FINAL JUDGE</span></div><div className="verdict-main"><strong>{decision}</strong><div><span>CONFIDENCE</span><b>{confidence}%</b><div className="confidence-track"><i style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }} /></div></div></div><p className="verdict-summary">{string(judge.summary)}</p><div className="verdict-columns"><div><span>MAIN REASON</span><p>{string(get(judge, 'main_reason', 'mainReason'), 'No reason provided.')}</p></div><div><span>KEY RISK</span><p>{string(get(judge, 'key_risk', 'keyRisk'), 'No risk provided.')}</p></div></div></section> : <section className="debate-verdict"><div className="verdict-top"><span>FINAL CONCLUSION</span><span><ShieldCheck size={16} /> FINAL JUDGE</span></div><h2>{string(judge.conclusion, 'No conclusion returned.')}</h2><div className="debate-confidence"><span>Judge confidence</span><strong>{confidence}%</strong><div className="confidence-track"><i style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }} /></div></div><div className="debate-answer-grid"><div><span>STRONGEST REASON</span><p>{string(get(judge, 'strongest_reason', 'strongestReason'))}</p></div><div><span>STRONGEST COUNTERARGUMENT</span><p>{string(get(judge, 'strongest_counterargument', 'strongestCounterargument'))}</p></div><div><span>WHY THIS WINS</span><p>{string(get(judge, 'why_this_wins', 'whyThisWins'))}</p></div><div><span>RECOMMENDATION</span><p>{string(judge.recommendation)}</p></div></div></section>}
    {string(data.binaryProposition) && <div className="binary-note"><strong>Evaluated proposition</strong><span>{string(data.binaryProposition)}</span></div>}
    {resultMode === 'YES_NO' && <div className="consensus-card"><div><span className="eyebrow">EXPERT DISTRIBUTION</span><strong>{number(consensus.yes)} YES <span>·</span> {number(consensus.no)} NO</strong></div><div className="vote-bar"><i style={{ width: `${(number(consensus.yes) / Math.max(1, number(consensus.yes) + number(consensus.no))) * 100}%` }} /></div><small>The Judge weighs relevance and evidence, not just the vote count.</small></div>}
    <div className="result-metrics"><Stat icon={<Coins size={19} />} label={usage.costComplete ? 'ESTIMATED COST' : 'KNOWN COST ONLY'} value={usage.costComplete ? money(usage.cost) : usage.cost ? `${money(usage.cost)}+` : 'Unknown'} sub={usage.costComplete ? undefined : 'Some pricing or usage is missing'} /><Stat icon={<BarChart3 size={19} />} label="TOKENS" value={usage.tokens.toLocaleString()} /><Stat icon={<Layers3 size={19} />} label="MODEL CALLS" value={String(usage.calls)} /><Stat icon={<Clock3 size={19} />} label="WALL TIME" value={usage.latency ? `${(usage.latency / 1000).toFixed(1)}s` : '—'} /></div>
    <div className="result-details"><details><summary><span><Users2 size={18} /> Expert perspectives</span><span>{expertRuns.length} specialists <ChevronDown size={18} /></span></summary><div className="detail-content expert-opinions">{expertRuns.map((run, index) => { const answer = runAnswer(run); return <div className="expert-opinion" key={string(run.expertId, String(index))}><div className="expert-opinion-head"><span className="role-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{roleName(run, index)}</strong><small>{string(object(run.role).domain)}</small></div><span className={`opinion-tag ${string(answer.vote).toLowerCase()}`}>{resultMode === 'YES_NO' ? string(answer.vote, '—') : `${number(answer.confidence)}% confident`}</span></div>{resultMode === 'YES_NO' ? <><p>{string(answer.reason)}</p><small className="caveat">Caveat: {string(get(answer, 'critical_caveat', 'criticalCaveat'), '—')}</small><div className="score-line">Relevance {number(answer.relevance)} · Evidence {number(get(answer, 'evidence_strength', 'evidenceStrength'))} · Confidence {number(answer.confidence)}</div></> : <><p>{string(answer.stance)}</p><ul>{list(answer.core_claims).slice(0, 3).map((claim, claimIndex) => <li key={claimIndex}>{String(claim)}</li>)}</ul><small className="caveat">Uncertainty: {string(get(answer, 'remaining_uncertainty', 'remainingUncertainty'), '—')}</small></>}</div>; })}</div></details>
      {resultMode === 'DEBATE' && <details><summary><span><GitBranch size={18} /> Debate progression</span><span>{rounds.length} {rounds.length === 1 ? 'round' : 'rounds'} <ChevronDown size={18} /></span></summary><div className="detail-content rounds-content">{rounds.map((round, index) => <div className="round-card" key={index}><div className="round-head"><strong>Round {number(round.round, index + 1)}</strong><span className={round.consensus ? 'round-consensus' : ''}>{round.consensus ? 'Consensus reached' : 'Disagreement remains'}</span></div>{list(round.disagreements).length > 0 && <ul>{list(round.disagreements).map((point, pointIndex) => <li key={pointIndex}>{String(point)}</li>)}</ul>}{list(round.experts).map((rawRun, runIndex) => { const run = object(rawRun); const answer = runAnswer(run); return <div className="round-expert" key={runIndex}><strong>{roleName(run, runIndex)}</strong><span>{string(answer.stance)}</span>{Boolean(answer.changed_mind) && <small>Changed position this round</small>}</div>; })}</div>)}{terminationReason && <p className="termination-note"><CheckCircle2 size={15} /> Stopped: {titleCase(terminationReason)}</p>}{Object.keys(object(data.crossEvaluation)).length > 0 && <CrossEvaluation raw={object(data.crossEvaluation)} roles={list(data.roles).map(object)} />}</div></details>}
      <details><summary><span><BarChart3 size={18} /> Usage and cost</span><span>By model call <ChevronDown size={18} /></span></summary><div className="detail-content">{usage.records.length > 0 ? <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Stage</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Latency</th></tr></thead><tbody>{usage.records.map((item, index) => <tr key={index}><td>{titleCase(string(item.stage))}{number(item.attempt) > 1 ? ` · retry ${number(item.attempt)}` : ''}</td><td>{string(get(item, 'model', 'modelId'))}</td><td>{(number(item.inputTokens) + number(item.outputTokens)).toLocaleString()}</td><td>{item.costKnown === false ? 'Unknown' : money(number(get(item, 'estimatedCost', 'cost')))}</td><td>{number(item.latencyMs) ? `${(number(item.latencyMs) / 1000).toFixed(1)}s` : '—'}</td></tr>)}</tbody></table></div> : <p className="muted-copy">No per-call records were stored for this execution.</p>}</div></details></div>
    {onHistory && <button className="back-link result-history-link" onClick={onHistory}>View decision history <ArrowRight size={16} /></button>}
  </div>;
}

function CrossEvaluation({ raw, roles }: { raw: LooseRecord; roles: LooseRecord[] }) {
  const scores = list(raw.scores).map(object).sort((a, b) => number(b.score) - number(a.score));
  if (!scores.length) return null;
  const leadingId = string(raw.leadingCandidateId);
  return <div className="cross-eval"><span className="eyebrow">CROSS EVALUATION</span><p>Peer scoring was advisory; the Judge reviewed every position.</p>{scores.map((score, index) => { const candidate = roles.find(role => string(role.id) === string(score.candidateId)); return <div key={index}><span>{string(candidate?.title, `Candidate ${index + 1}`)} {string(score.candidateId) === leadingId && <b>LEADING</b>}</span><strong>{number(score.score).toFixed(1)}</strong></div>; })}</div>;
}

function ModelRegistry({ models, providerKeys, onSaved, onBack }: { models: ModelConfig[]; providerKeys: ProviderKeys; onSaved: () => Promise<void>; onBack: () => void }) {
  const [draft, setDraft] = useState<ModelConfig[]>(models);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(models); }, [models]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(models);
  const providers: { id: keyof ProviderKeys; label: string; env: string }[] = [
    { id: 'gateway', label: 'AI Gateway', env: 'AI_GATEWAY_API_KEY' },
    { id: 'openai', label: 'OpenAI', env: 'OPENAI_API_KEY' },
    { id: 'anthropic', label: 'Anthropic', env: 'ANTHROPIC_API_KEY' },
    { id: 'google', label: 'Google', env: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  ];
  function update(index: number, change: Partial<ModelConfig>) { setDraft(current => current.map((model, position) => position === index ? { ...model, ...change } : model)); }
  function addModel() {
    const id = `new-model-${Date.now()}`;
    setDraft(current => [...current, { id, provider: 'openai', model: '', displayName: '', tier: 'standard', enabled: true }]);
    setEditing(id);
  }
  async function save() {
    setError('');
    if (draft.some(item => !item.id.trim() || !item.provider.trim() || !item.model.trim() || !item.displayName.trim())) { setError('Every model needs an ID, provider, model name and display name.'); return; }
    if (new Set(draft.map(item => item.id)).size !== draft.length) { setError('Each model ID must be unique.'); return; }
    setSaving(true);
    try { await api.saveModels(draft); await onSaved(); setEditing(null); }
    catch (saveError) { setError(errorText(saveError)); }
    finally { setSaving(false); }
  }
  return <main className="single-page model-page"><div className="single-page-header"><div><span className="eyebrow">CONFIGURATION</span><h1>Model registry</h1><p>Choose provider models and pricing metadata. API keys stay on the server.</p></div><button className="secondary-button" onClick={onBack}><ArrowLeft size={17} /> Back to council</button></div>
    <div className="provider-panel"><div className="provider-panel-head"><div><span className="eyebrow">SERVER CONNECTIONS</span><h2>Provider readiness</h2></div><ShieldCheck size={19} /></div><div className="provider-grid">{providers.map(provider => <div key={provider.id} className={`provider-status ${providerKeys[provider.id] ? 'connected' : ''}`}><span className="provider-dot" /><div><strong>{provider.label}</strong><small>{providerKeys[provider.id] ? 'Key configured' : provider.env + ' missing'}</small></div></div>)}</div><p className="provider-help">Add provider keys in your server environment, then restart the app. Keys are never sent to this page.</p></div>
    <div className="registry-panel"><div className="registry-head"><div><span className="eyebrow">AVAILABLE MODELS</span><h2>{draft.length} registered models</h2></div><button className="secondary-button" onClick={addModel}><Plus size={17} /> Add model</button></div>{draft.length ? <div className="registry-list">{draft.map((model, index) => <div className={`registry-item ${editing === model.id ? 'editing' : ''}`} key={`${model.id}-${index}`}><div className="registry-item-head"><div className={`tier-icon ${model.tier}`}><Layers3 size={19} /></div><div className="registry-item-name"><strong>{model.displayName || 'New model'}</strong><span>{model.provider} / {model.model || 'model identifier'}</span></div><span className={`tier-badge ${model.tier}`}>{titleCase(model.tier)}</span><label className="registry-enabled"><input type="checkbox" checked={model.enabled} onChange={event => update(index, { enabled: event.target.checked })} /><span>{model.enabled ? 'Enabled' : 'Disabled'}</span></label><button className="icon-button" onClick={() => setEditing(editing === model.id ? null : model.id)} aria-label="Edit model"><Settings2 size={17} /></button></div>{editing === model.id && <div className="registry-edit"><div className="field-grid"><label>Display name<input value={model.displayName} onChange={event => update(index, { displayName: event.target.value })} placeholder="e.g. Claude Sonnet" /></label><label>Registry ID<input value={model.id} onChange={event => { update(index, { id: event.target.value }); setEditing(event.target.value); }} placeholder="e.g. anthropic-sonnet" /></label><label>Provider<select value={model.provider} onChange={event => update(index, { provider: event.target.value })}>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label><label>Provider model ID<input value={model.model} onChange={event => update(index, { model: event.target.value })} placeholder="e.g. claude-sonnet-4-5" /></label><label>Tier<select value={model.tier} onChange={event => update(index, { tier: event.target.value as ModelConfig['tier'] })}><option value="economy">Economy</option><option value="standard">Standard</option><option value="premium">Premium</option><option value="judge">Judge</option></select></label><label>Max context tokens<input type="number" min="1" value={model.maxContextTokens ?? ''} onChange={event => update(index, { maxContextTokens: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" /></label><label>Input $ / 1M tokens<input type="number" min="0" step="0.01" value={model.inputCostPerMillion ?? ''} onChange={event => update(index, { inputCostPerMillion: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" /></label><label>Output $ / 1M tokens<input type="number" min="0" step="0.01" value={model.outputCostPerMillion ?? ''} onChange={event => update(index, { outputCostPerMillion: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" /></label></div><button className="danger-link" onClick={() => { setDraft(current => current.filter((_, position) => position !== index)); setEditing(null); }}><Trash2 size={15} /> Remove model</button></div>}</div>)}</div> : <div className="empty-state"><Layers3 size={25} /><strong>No models registered</strong><span>Add at least one expert model and one Judge model.</span></div>}{error && <div className="form-error"><CircleHelp size={17} /> {error}</div>}<div className="registry-footer"><span>{dirty ? 'Unsaved changes' : 'Registry up to date'}</span><button className="primary-button" onClick={() => void save()} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save registry'} <Check size={17} /></button></div></div>
  </main>;
}

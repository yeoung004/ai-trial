import { Gavel, History, Settings2, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { CouncilMode, CouncilRole, ExecutionSnapshot } from '../api';

type Props = {
  question: string; onQuestionChange: (value: string) => void; mode: CouncilMode | null;
  onModeChange: (value: CouncilMode) => void; roles: CouncilRole[]; roleCount: number;
  busy: boolean; running: boolean; execution: ExecutionSnapshot | null; error: string;
  onRun: () => void; onSettings: () => void; onHistory: () => void; onNew: () => void;
  ruling?: { decision?: string; conclusion?: string; rationale?: string; recommendation?: string };
};

const colors = ['#d9a18b', '#a8bd9b', '#91afc1', '#d8bd78', '#b7a0c5'];
function category(role: CouncilRole | undefined) {
  const text = `${role?.title ?? ''} ${role?.domain ?? ''}`.toLowerCase();
  if (/law|legal|judge|policy/.test(text)) return 'legal';
  if (/doctor|medical|health|nurse/.test(text)) return 'medical';
  if (/chef|food|cook|nutrition/.test(text)) return 'food';
  if (/design|creative|artist|brand/.test(text)) return 'creative';
  if (/science|research|chemist|scientist/.test(text)) return 'science';
  if (/finance|econom|account|investment/.test(text)) return 'business';
  if (/security|privacy|risk/.test(text)) return 'security';
  if (/engineer|developer|software|technical|data/.test(text)) return 'engineering';
  return 'general';
}

function Mascot({ role, index = 0, judge = false, thinking = false }: { role?: CouncilRole; index?: number; judge?: boolean; thinking?: boolean }) {
  const seed = Math.abs((role?.title ?? `seat-${index}`).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const skin = ['#f2c7a4', '#d99c77', '#edb78d', '#c98768'][seed % 4];
  const hair = ['#553e35', '#493a38', '#725443', '#372e31'][seed % 4];
  const outfit = judge ? '#725746' : ({ engineering: '#7192a1', medical: '#f4f0e8', food: '#d9987f', creative: '#a88fbb', science: '#8ea99b', business: '#7f879d', security: '#485362', legal: '#6e5a4d' } as Record<string, string>)[category(role)] ?? colors[index % colors.length];
  return <div className={`mascot ${judge ? 'mascot-judge' : ''} ${thinking ? 'mascot-thinking' : ''}`} style={{ animationDelay: `${(seed % 17) / 10}s` }} aria-hidden="true">
    <svg viewBox="0 0 120 138" role="presentation">
      {judge && <><path d="M35 24h50l-5-17-9 9-10-13-10 13-11-9z" fill="#d7b56d" stroke="#5d4635" strokeWidth="3" strokeLinejoin="round"/><circle cx="60" cy="17" r="3" fill="#fff1b8"/></>}
      <ellipse cx="60" cy="126" rx="30" ry="6" fill="#73543e" opacity=".16"/>
      <path d="M35 86q-3 19-5 33 2 7 13 7h34q11 0 13-7l-5-33z" fill={outfit} stroke="#5d4635" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M41 91q-10 5-15 18m53-18q10 5 15 18" fill="none" stroke="#5d4635" strokeWidth="7" strokeLinecap="round"/>
      <ellipse cx="60" cy="53" rx="33" ry="35" fill={skin} stroke="#5d4635" strokeWidth="3"/>
      <path d="M28 50q1-34 32-34 30 0 32 31-7-10-16-13-13 13-45 10z" fill={hair} stroke="#5d4635" strokeWidth="3" strokeLinejoin="round"/>
      <ellipse cx="48" cy="57" rx="2.5" ry="3.5" fill="#493a35"/><ellipse cx="71" cy="57" rx="2.5" ry="3.5" fill="#493a35"/>
      <path d="M56 68q4 4 8 0" fill="none" stroke="#9b6158" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M40 75q20 10 40 0l5 20q-24 16-50 0z" fill={judge ? '#624b42' : outfit} stroke="#5d4635" strokeWidth="3"/>
      {judge ? <><path d="M86 78h10v24H86z" fill="#b88a62" stroke="#5d4635" strokeWidth="2.5"/><path d="M81 75h20v6H81z" fill="#d7b56d" stroke="#5d4635" strokeWidth="2"/></> : category(role) === 'medical' ? <><path d="M58 80v18m-7-9h14" stroke="#d79983" strokeWidth="3" strokeLinecap="round"/><path d="M48 88q-6 24 8 24h8" fill="none" stroke="#9fb8c8" strokeWidth="2.5"/></> : category(role) === 'engineering' ? <><rect x="78" y="82" width="20" height="15" rx="2" fill="#d7b56d" stroke="#5d4635" strokeWidth="2"/><path d="M84 86h8m-8 4h5" stroke="#5d4635" strokeWidth="1.5"/></> : category(role) === 'food' ? <><path d="M82 82v18" stroke="#5d4635" strokeWidth="2.5"/><path d="M77 80q5-8 10 0m-10 4q5-7 10 0" fill="#d7b56d" stroke="#5d4635" strokeWidth="2"/></> : <path d="M54 83l6 7 6-7" fill="none" stroke="#fff8ed" strokeWidth="2.5"/>}
      {category(role) === 'food' && <path d="M42 22q-2-16 9-17 8-7 16 0 12-1 11 17z" fill="#fff8ed" stroke="#5d4635" strokeWidth="3"/>}
      {category(role) === 'creative' && <path d="M28 39q26-20 61-4l-3 7q-31-10-56 4z" fill="#a88fbb" stroke="#5d4635" strokeWidth="3"/>}
      {category(role) === 'science' && <><circle cx="47" cy="56" r="9" fill="none" stroke="#9fb8c8" strokeWidth="2.5"/><circle cx="73" cy="56" r="9" fill="none" stroke="#9fb8c8" strokeWidth="2.5"/><path d="M56 56h8" stroke="#9fb8c8" strokeWidth="2.5"/></>}
    </svg>
    {thinking && <span className="thought-dots"><i>·</i><i>·</i><i>·</i></span>}
  </div>;
}

export default function Courtroom({ question, onQuestionChange, mode, onModeChange, roles, roleCount, busy, running, execution, error, onRun, onSettings, onHistory, onNew, ruling }: Props) {
  const count = roleCount || (mode === 'YES_NO' ? 5 : 3);
  const judgeThinking = running && String(execution?.stage).toUpperCase() === 'JUDGING';
  return <main className="courtroom-page">
    <header className="toy-header"><div className="toy-logo"><span>⚖</span><b>Tiny Council</b><small>your little court</small></div><div className="toy-actions"><button onClick={onHistory} aria-label="History" title="Past rulings"><History size={19}/></button><button onClick={onSettings} aria-label="Settings" title="Council settings"><Settings2 size={19}/></button></div></header>
    <section className="courtroom-scene" aria-label="AI courtroom">
      <div className="window-sun"/><div className="scene-label"><Sparkles size={14}/> {ruling ? 'THE RULING IS IN' : running ? 'THE COURT IS IN SESSION' : 'THE COURT IS WAITING'}</div>
      <div className="judge-dais"><div className="judge-nameplate">THE HONORABLE JUDGE</div><div className="judge-seat"><Mascot judge thinking={judgeThinking}/><span className="judge-caption"><Gavel size={14}/> {ruling ? 'Ruling ready' : 'Judge'}</span></div><div className="bench-top"/><div className="bench-body"><span>★</span><b>COURT OF GOOD IDEAS</b><span>★</span></div></div>
      <div className="expert-row" style={{'--expert-count': count} as CSSProperties}>{Array.from({length:count}, (_, i) => { const role = roles[i]; return <div className={`expert-seat ${role ? 'occupied' : ''}`} key={role?.id ?? `seat-${i}`}>
        <div className="speech-note">{running ? 'Thinking…' : role?.reason ? role.reason.slice(0, 78) : role?.title ? 'Ready to weigh in!' : 'A seat for an expert'}</div>
        <Mascot role={role} index={i} thinking={running}/><span className="expert-label">{role?.title || `Seat ${i + 1}`}</span><span className="expert-domain">{role?.domain || (role ? category(role) : 'waiting')}</span>
      </div>; })}</div>
      <div className="podium"><span>✦</span><b>THE COUNCIL</b><span>✦</span></div>
    </section>
    <section className={`dialogue-box ${ruling ? 'dialogue-ruling' : ''}`} aria-label={ruling ? 'Judge ruling' : 'Ask the council'}>
      {ruling ? <><div className="dialogue-top"><span className="dialogue-avatar">⚖</span><label>The Judge has spoken{ruling.decision ? ` · ${ruling.decision}` : ''}</label></div><div className="ruling-copy">{ruling.conclusion || ruling.rationale || 'The council has completed its deliberation.'}</div>{ruling.recommendation && <div className="ruling-recommendation"><b>Next step</b> {ruling.recommendation}</div>}<div className="dialogue-bottom"><span className="court-ruling-caption">The council heard: “{question}”</span><button className="send-ruling" onClick={onNew}>Ask another <span>➤</span></button></div></> : <>
      <div className="dialogue-top"><span className="dialogue-avatar">YOU</span><label htmlFor="court-question">What shall we decide today?</label><span className="dialogue-count">{question.length}/5,000</span></div>
      <textarea id="court-question" value={question} onChange={event=>onQuestionChange(event.target.value)} placeholder="Type your question…" rows={2} maxLength={5000} disabled={running}/>
      <div className="dialogue-bottom"><div className="court-options"><button className={mode==='YES_NO'?'selected':''} onClick={()=>onModeChange('YES_NO')} disabled={running}>⚖ Yes / No</button><button className={mode==='DEBATE'?'selected':''} onClick={()=>onModeChange('DEBATE')} disabled={running}>💬 Debate</button></div><button className="send-ruling" onClick={onRun} disabled={busy || running || !question.trim()}>{running ? 'In session…' : busy ? 'Summoning…' : 'Summon council'} <span>➤</span></button></div>
      {error && <div className="court-error" role="alert">{error}</div>}
      </>}
    </section>
    <p className="courtroom-footnote">A tiny council, saved on this device · model requests go to your selected provider</p>
  </main>;
}

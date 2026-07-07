import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Archive, Bot, CheckCircle2, FileText, Gauge, Network, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Wand2, WifiOff } from 'lucide-react';
import './styles.css';

type Tab = 'showcase' | 'capabilities' | 'command' | 'voice' | 'attachments' | 'missionhub' | 'studio' | 'lens' | 'vault' | 'memory' | 'automation' | 'trust' | 'settings' | 'help' | 'skills';
type Msg = { role: 'user' | 'assistant'; content: string; meta?: string };

function Badge({ children, tone='neutral' }: { children: React.ReactNode; tone?: 'neutral'|'good'|'warn'|'bad'|'purple' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function pickLunaVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferredNames = ['jenny','aria','zira','samantha','victoria','karen','susan','moira','tessa','veena','google uk english female','google us english','microsoft zira','microsoft jenny'];
  const english = voices.filter(v => /^en[-_]/i.test(v.lang) || /english/i.test(v.name));
  const pool = english.length ? english : voices;
  for (const name of preferredNames) {
    const found = pool.find(v => v.name.toLowerCase().includes(name));
    if (found) return found;
  }
  const femaleHint = pool.find(v => /female|woman|girl/i.test(v.name));
  return femaleHint || pool[0] || null;
}
function speakAsLuna(text: string, enabled = true): Promise<void> {
  if (!enabled || !('speechSynthesis' in window)) return Promise.resolve();
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(clean.slice(0, 420));
    const voice = pickLunaVoice();
    if (voice) { utter.voice = voice; utter.lang = voice.lang; }
    else utter.lang = 'en-US';
    utter.rate = 1.02;
    utter.pitch = 1.08;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}


function Card({ title, icon, children, className='' }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}><div className="card-title">{icon}{title}</div>{children}</section>;
}

function Header({ health, onReset, settings }: any) {
  const external = health?.network?.externalRequests ?? 0;
  const ollama = health?.ollama?.ok;
  return <header className="topbar">
    <div className="brand"><div className="orb"><Sparkles size={18}/></div><div><h1>{settings?.assistantName || 'Luna'}</h1><p>{settings?.userName ? `Private local AI layer for ${settings.userName}` : 'Private local AI operating layer'}</p></div></div>
    <div className="proof-strip">
      <Badge tone={ollama ? 'good' : 'warn'}>{ollama ? 'Ollama connected' : 'Fallback ready'}</Badge>
      <Badge tone={external === 0 ? 'good' : 'bad'}><Network size={13}/> External requests: {external}</Badge>
      <Badge tone="purple"><Gauge size={13}/> CPU {health?.resources?.cpuLoad ?? 0}% · RAM {health?.resources?.memoryUsedGb ?? '-'}GB</Badge>
      <button className="ghost" onClick={onReset}><RefreshCw size={14}/> Reset demo</button>
    </div>
  </header>;
}


function JudgeShowcase({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<any[]>([
    { id: 'health', title: 'Privacy and system proof', status: 'ready', detail: 'Check local model, resource meter and external request counter.' },
    { id: 'job', title: 'Job Application Mission', status: 'ready', detail: 'Generate report, cover letter, interview prep and ZIP.' },
    { id: 'studio', title: 'Research-to-Presentation', status: 'ready', detail: 'Generate PPTX, PDF, HTML, speaker notes and ZIP.' },
    { id: 'vault', title: 'Knowledge Vault Q&A', status: 'ready', detail: 'Index local documents and answer with evidence.' },
    { id: 'automation', title: 'Safe automation with undo', status: 'ready', detail: 'Preview file cleanup, execute, then undo entire mission.' },
    { id: 'skills', title: 'Luna Skill Creator', status: 'ready', detail: 'Generate and run reusable local skills.' },
    { id: 'memory', title: 'Personal memory and adaptive context', status: 'ready', detail: 'Show remembered goals/preferences and context construction.' }
  ]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [proof, setProof] = useState<any>(null);
  const update = (id: string, patch: any) => setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const addArtifacts = (arr: any[] = []) => setArtifacts(prev => [...prev, ...arr]);
  const run = async () => {
    setRunning(true); setArtifacts([]); setProof(null);
    try {
      update('health', { status: 'running', detail: 'Reading health status…' });
      const health = await window.luna.health(); setProof(health);
      update('health', { status: 'done', detail: `${health.ollama.ok ? 'Ollama connected' : 'Fallback ready'} · external requests ${health.network.externalRequests} · RAM ${health.resources.memoryUsedGb}/${health.resources.memoryTotalGb}GB` });
      pushLog('Showcase: health proof captured');

      update('job', { status: 'running', detail: 'Running job application mission…' });
      const job = await window.luna.runJobMission(); addArtifacts(job.artifacts);
      update('job', { status: 'done', detail: `Created ${job.artifacts.length} artifacts including PDF, DOCX and ZIP.` });
      pushLog('Showcase: job mission complete');

      update('studio', { status: 'running', detail: 'Generating research presentation package…' });
      const studio = await window.luna.runResearchMission(); addArtifacts(studio.artifacts);
      update('studio', { status: 'done', detail: `Created ${studio.artifacts.length} artifacts including PPTX and PDF.` });
      pushLog('Showcase: artifact studio complete');

      update('vault', { status: 'running', detail: 'Indexing local documents and asking with evidence…' });
      await window.luna.vaultIndexDemo();
      const vault = await window.luna.vaultAsk('What does Luna prove about privacy and safe automation?');
      update('vault', { status: 'done', detail: `Answered using ${vault.results.length} evidence chunks via ${vault.mode}.` });
      pushLog('Showcase: vault evidence answer complete');

      update('automation', { status: 'running', detail: 'Planning cleanup, executing, then undoing…' });
      const plan = await window.luna.planCleanup();
      const exec = await window.luna.executeCleanup(plan);
      const undo = await window.luna.undoMission(exec.missionId);
      update('automation', { status: 'done', detail: `Moved ${exec.moved} files, saved manifest, then restored ${undo.restored} files.` });
      pushLog('Showcase: reversible automation proven');

      update('skills', { status: 'running', detail: 'Generating and running a study skill…' });
      const skill = await window.luna.generateSkill('Create a skill that turns a research PDF into flashcards, quiz questions, and a PDF study report.');
      const saved = await window.luna.saveSkill(skill);
      const runSkill = await window.luna.runSkill(saved.skills[0].id); addArtifacts(runSkill.artifacts);
      update('skills', { status: 'done', detail: `Generated/saved skill and created ${runSkill.artifacts.length} artifacts.` });
      pushLog('Showcase: Luna Skill Creator complete');

      update('memory', { status: 'running', detail: 'Building adaptive context from memory and vault…' });
      const ctx = await window.luna.contextBuild('What is Luna trying to become for this hackathon?');
      update('memory', { status: 'done', detail: `Selected ${ctx.memories.length} memories and ${ctx.vault.length} vault evidence chunks.` });
      pushLog('Showcase: adaptive context complete');
    } catch (e: any) {
      const msg = e?.message || String(e);
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s));
      pushLog(`Showcase error: ${msg}`);
    }
    setRunning(false);
  };
  const resetSteps = async () => {
    await window.luna.resetDemo();
    setArtifacts([]); setProof(null);
    setSteps(prev => prev.map(s => ({ ...s, status: 'ready', detail: s.id === 'health' ? 'Check local model, resource meter and external request counter.' : s.detail.replace(/^Created .*|^Answered .*|^Moved .*|^Generated\/saved .*|^Selected .*/, 'Ready for demo.')})));
    pushLog('Showcase reset to clean demo state');
  };
  return <div className="grid two">
    <Card title="5-Minute Guided Demo" icon={<Sparkles size={18}/>}> 
      <p className="bigcopy">One click runs {assistantName}’s strongest proof path: privacy proof, local missions, artifact generation, evidence Q&A, reversible automation, skill creation and adaptive memory.</p>
      <div className="row-actions"><button className="primary" onClick={run} disabled={running}>{running ? 'Running showcase…' : 'Run full showcase'}</button><button onClick={resetSteps} disabled={running}>Reset showcase</button></div>
      {proof && <div className="proof-cards"><div><b>{proof.network.externalRequests}</b><span>external requests</span></div><div><b>{proof.ollama.ok ? 'Ollama' : 'Fallback'}</b><span>AI mode</span></div><div><b>{proof.resources.cpuLoad}%</b><span>CPU</span></div><div><b>{proof.resources.memoryUsedGb}GB</b><span>RAM used</span></div></div>}
    </Card>
    <Card title="Showcase Timeline" icon={<Activity size={18}/>}> 
      <div className="showcase-steps">{steps.map(step => <div key={step.id} className={`showcase-step ${step.status}`}><div><b>{step.title}</b><span>{step.detail}</span></div><Badge tone={step.status==='done'?'good':step.status==='running'?'purple':step.status==='error'?'bad':'neutral'}>{step.status}</Badge></div>)}</div>
    </Card>
    <Card title="Generated Artifacts" icon={<FileText size={18}/>} className="wide"> 
      {!artifacts.length && <p className="hint">Run the showcase to generate real files.</p>}
      <div className="artifact-grid">{artifacts.map((a:any, i:number)=><div className="artifact" key={a.path + i}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}</div>
    </Card>
  </div>;
}


function CapabilityCenter({ setTab, assistantName }: { setTab: (t: Tab)=>void; assistantName: string }) {
  const groups = [
    { title: 'Local AI Core', tab: 'command' as Tab, items: ['Ollama chat', 'transparent fallback mode', 'Chat+ adaptive context', 'model preference', 'response style control', 'conversation compression foundation'] },
    { title: 'Desktop Companion Layer', tab: 'command' as Tab, items: [`always-on-top ${assistantName} Orb`, 'global command palette', 'Ctrl/Cmd + Shift + L shortcut', 'natural-language command router', 'voice/transcript commands'] },
    { title: 'Knowledge & Memory', tab: 'vault' as Tab, items: ['Knowledge Vault', 'PDF/DOCX/TXT/MD/CSV/JSON import', 'embedding retrieval when available', 'keyword fallback', 'evidence cards', 'reviewable personal memory', 'adaptive context builder'] },
    { title: 'Artifacts & Attachments', tab: 'attachments' as Tab, items: ['unified attachments', 'local OCR for images', 'PDF export', 'DOCX export', 'PPTX export', 'HTML export', 'Markdown export', 'CSV/JSON/ICS/ZIP export'] },
    { title: 'Missions', tab: 'missionhub' as Tab, items: ['Job Application Mission', 'Research-to-Presentation', 'Meeting Notes', 'Invoice / Expense', 'Study Pack', 'Codebase Explainer', 'Attachment Summary'] },
    { title: 'Safe Automation', tab: 'automation' as Tab, items: ['file cleanup planner', 'before/after preview', 'permission approval', 'manifest logging', 'full undo', 'mission replay'] },
    { title: 'Privacy & Reliability', tab: 'trust' as Tab, items: ['external network counter', 'resource meter', 'audit log', 'SQLite database status', 'trust export', 'delete/reset data', 'fallback drill', 'preflight + IPC checks'] },
    { title: 'Extensibility', tab: 'skills' as Tab, items: ['Luna Skill Creator', 'plain-English skill generation', 'safe schema-based tools', 'saved local skills', 'executable built-in skills', 'mission templates'] }
  ];
  return <div className="grid two">
    <Card title="Luna Capability Center" icon={<Sparkles size={18}/>}> 
      <p className="bigcopy">A single view of what {assistantName} can do. This is useful during judging if someone wants to quickly understand the product surface area.</p>
      <div className="capability-score"><div><b>8</b><span>product pillars</span></div><div><b>50+</b><span>visible capabilities</span></div><div><b>0</b><span>paid APIs required</span></div></div>
      <p className="hint">Each section links to the relevant working {assistantName} area.</p>
    </Card>
    <Card title="Positioning" icon={<ShieldCheck size={18}/>}> 
      <h3>Private local AI operating layer</h3>
      <p className="bigcopy">{assistantName} combines conversation, local context, artifact generation, safe automation, memory, reusable skills, and privacy forensics into one desktop companion.</p>
      <div className="showcase-list"><div><b>Observe</b><span>Attachments, Lens, Vault and desktop context.</span></div><div><b>Act</b><span>Missions, artifacts, file automation and skills.</span></div><div><b>Explain</b><span>Trace, replay, evidence and audit logs.</span></div><div><b>Control</b><span>Settings, memory toggle, reset, export and undo.</span></div></div>
    </Card>
    {groups.map(g => <Card key={g.title} title={g.title} icon={<CheckCircle2 size={18}/>}>
      <div className="cap-list">{g.items.map(item => <div key={item}><Badge tone="good">ready</Badge><span>{item}</span></div>)}</div>
      <button className="primary" onClick={()=>setTab(g.tab)}>Open related section</button>
    </Card>)}
  </div>;
}

function CommandCenter({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: `Hi, I’m ${assistantName}. I can run with local Ollama or fallback demo mode, analyze local documents, generate artifacts, and organize files with undo.` }]);
  const [input, setInput] = useState(`What can ${assistantName} do while staying local?`);
  const [busy, setBusy] = useState(false);
  const [actionCommand, setActionCommand] = useState('Create a presentation from my local research notes');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<any>(null);
  const send = async () => {
    if (!input.trim()) return;
    const next = [...messages, { role: 'user' as const, content: input }];
    setMessages(next); setInput(''); setBusy(true);
    const started = performance.now();
    const res = await window.luna.chatPlus(next.map(m => ({ role: m.role, content: m.content })));
    const ms = Math.round(performance.now() - started);
    setMessages([...next, { role: 'assistant', content: res.text, meta: `${res.mode} · ${res.model} · ${res.tokensPerSecond ?? '?'} tok/s · ${ms}ms · memories ${res.context?.memories?.length ?? 0} · evidence ${res.context?.vault?.length ?? 0}` }]);
    setBusy(false); pushLog(`Chat response via ${res.mode}`);
  };
  return <div className="grid two">
    <Card title={`Ask ${assistantName}`} icon={<Bot size={18}/>}> 
      <div className="chatbox">
        {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}><div>{m.content}</div>{m.meta && <small>{m.meta}</small>}</div>)}
        {busy && <div className="msg assistant typing">Thinking locally…</div>}
      </div>
      <div className="composer"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') send(); }} /><button onClick={send} disabled={busy}>Send</button></div>
    </Card>
    <Card title="Judge-proof showcase" icon={<Sparkles size={18}/>}> 
      <div className="showcase-list">
        <div><b>1. Privacy proof</b><span>Network counter and resource meter stay visible.</span></div>
        <div><b>2. Job mission</b><span>Resume + JD → report, cover letter, ZIP.</span></div>
        <div><b>3. Safe automation</b><span>Preview file moves, approve, then full undo.</span></div>
        <div><b>4. Luna Skill Creator</b><span>Create new local skills from controlled templates.</span></div>
      </div>
      <p className="hint">All demo data is seeded locally and resettable, so repeated judging starts clean.</p>
    </Card>
  </div>;
}



function VoiceMode({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [modelStatus, setModelStatus] = useState<{ ready: boolean; downloaded: boolean } | null>(null);
  const [micError, setMicError] = useState('');
  const [transcript, setTranscript] = useState('Prepare my job application package');
  const [result, setResult] = useState<any>(null);
  const [speakBack, setSpeakBack] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [routing, setRouting] = useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  useEffect(() => {
    setSupported(!!navigator.mediaDevices?.getUserMedia);
    window.luna.voiceStatus().then(setModelStatus).catch(() => {});
  }, []);
  const speak = (text: string) => speakAsLuna(text, speakBack);
  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);
  const resampleTo16kMono = async (blob: Blob): Promise<Float32Array> => {
    const arrayBuffer = await blob.arrayBuffer();
    const decodeCtx = new AudioContext();
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
    decodeCtx.close();
    const targetLength = Math.ceil(decoded.duration * 16000);
    const offline = new OfflineAudioContext(1, targetLength, 16000);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  };
  const start = async () => {
    setMicError(''); setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const samples = await resampleTo16kMono(blob);
          const { text } = await window.luna.transcribeAudio(samples);
          setTranscript(text || '');
          setModelStatus(await window.luna.voiceStatus());
          if (text && text.trim()) { await run(text); } else { setMicError('Didn\u2019t catch that — try again or edit the transcript below.'); }
        } catch (e: any) {
          setMicError(`Transcription failed: ${e?.message || String(e)}`);
        }
        setTranscribing(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e: any) {
      setMicError(`Microphone access failed: ${e?.message || String(e)}`);
      setRecording(false);
    }
  };
  const stop = () => { try { mediaRecorderRef.current?.stop(); } catch {} };
  const run = async (cmd = transcript) => {
    if (!cmd.trim()) return;
    setRouting(true);
    const res = await window.luna.routeCommand(cmd);
    setResult(res); pushLog(`Voice routed: ${res.intent}`);
    setRouting(false);
    setSpeaking(true);
    await speak(res.summary);
    setSpeaking(false);
  };
  const examples = ['Prepare my job application package', 'Create a presentation from my local research notes', `Ask the vault what ${assistantName} proves about privacy`, 'Create an invoice extractor skill', 'Benchmark my local AI models'];
  const statusLabel = recording ? 'Listening…' : transcribing ? (modelStatus?.ready ? 'Transcribing locally…' : 'Downloading local speech model (one-time, ~75MB)…') : routing ? 'Thinking…' : speaking ? 'Speaking…' : 'Ready';
  const orbState = recording ? 'listening' : (transcribing || routing) ? 'thinking' : speaking ? 'speaking' : '';
  return <div className="grid two">
    <Card title="Luna Voice" icon={<Sparkles size={18}/>}> 
      <p className="bigcopy">Push-to-talk records locally and transcribes fully on-device with an open Whisper model — audio never leaves this machine.</p><p className="hint">{assistantName} prefers a feminine system voice when available, with safe fallback to the default system voice.</p>
      <div className="voice-orb"><div className={`voice-core ${orbState}`}><Sparkles size={42}/></div><span>{statusLabel}</span></div>
      <div className="row-actions"><button className="primary" onClick={start} disabled={!supported || recording || transcribing}>Push to talk</button><button onClick={stop} disabled={!recording}>Stop</button><button onClick={()=>run()} disabled={!transcript.trim() || routing || speaking}>Submit typed text</button><label className="toggle"><input type="checkbox" checked={speakBack} onChange={e=>setSpeakBack(e.target.checked)}/> Speak response</label></div>
      <p className="hint">Speaking already submits automatically. Use "Submit typed text" only if you type or edit the box below instead of using your voice.</p>
      {!supported && <p className="hint">Microphone access is not available in this runtime. Use transcript mode below; the demo still works.</p>}
      {micError && <p className="hint">{micError}</p>}
      {!modelStatus?.downloaded && <p className="hint">First use downloads a small open speech model (~75MB) once; every use after that is fully offline.</p>}
      <textarea value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Voice transcript appears here…" />
      <div className="suggestion-list">{examples.map(x=><button key={x} onClick={()=>{setTranscript(x); run(x);}}>{x}</button>)}</div>
    </Card>
    <Card title="Voice Action Result" icon={<Activity size={18}/>}> 
      {!result && <p className="hint">Say or type a command, then {assistantName} routes it to missions, skills, vault, Lens, automation or model inspector.</p>}
      {result && <div className="action-result"><div className="route-head"><Badge tone="purple">{result.intent}</Badge><Badge tone="good">confidence {Math.round(result.confidence*100)}%</Badge></div><h3>{result.actionTaken}</h3><p>{result.summary}</p>{result.artifacts?.length>0 && <div className="artifact-list">{result.artifacts.map((a:any)=><div className="artifact" key={a.path}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}</div>}</div>}
    </Card>
  </div>;
}

function AttachmentsCenter({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [state, setState] = useState<any>({ items: [] });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const refresh = async () => setState(await window.luna.attachmentsList());
  useEffect(() => { refresh(); }, []);
  const importFiles = async () => { setBusy('Importing and extracting files…'); const s = await window.luna.attachmentsImport(); setState(s); setBusy(''); pushLog('Imported attachments'); };
  const clear = async () => { setBusy('Clearing attachments…'); const s = await window.luna.attachmentsClear(); setState(s); setResult(null); setBusy(''); pushLog('Cleared attachments'); };
  const toVault = async () => { setBusy('Indexing attachments into Knowledge Vault…'); await window.luna.attachmentsToVault(); setBusy(''); pushLog('Attachments indexed into vault'); };
  const summarize = async () => { setBusy('Summarizing attachments locally…'); const r = await window.luna.attachmentsSummarize(); setResult(r); setBusy(''); pushLog('Attachment summary generated'); };
  return <div className="grid two">
    <Card title="Unified Attachments" icon={<FileText size={18}/>}> 
      <p className="bigcopy">Import files once, then use them across {assistantName}: summarize, add to Knowledge Vault, route through commands, or feed future missions and skills.</p>
      <div className="row-actions"><button className="primary" onClick={importFiles} disabled={!!busy}>Import files</button><button onClick={summarize} disabled={!!busy || !state.items?.length}>Summarize attachments</button><button onClick={toVault} disabled={!!busy || !state.items?.length}>Add to Vault</button><button className="danger" onClick={clear} disabled={!!busy}>Clear</button></div>
      {busy && <p className="hint">{busy}</p>}
      <div className="vault-stats"><div><b>{state.items?.length || 0}</b><span>files</span></div><div><b>{state.items?.reduce((n:number,i:any)=>n+i.chars,0) || 0}</b><span>chars</span></div><div><b>{state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : '-'}</b><span>updated</span></div></div>
      <div className="doc-list">{state.items?.map((a:any)=><div key={a.id}><b>{a.name}</b><span>{a.type} · {a.chars} chars</span><small>{a.originalPath}</small></div>)}</div>
    </Card>
    <Card title="Attachment Preview" icon={<Sparkles size={18}/>}> 
      {!state.items?.length && <p className="hint">Import PDF, DOCX, TXT/MD, CSV/JSON or images. Images use local OCR.</p>}
      {state.items?.slice(0,3).map((a:any)=><div className="preview-card" key={a.id}><b>{a.name}</b><pre>{a.textPreview || 'No text extracted.'}</pre></div>)}
    </Card>
    {result && <Card title="Attachment Summary Artifacts" icon={<Archive size={18}/>} className="wide"> 
      <p>{result.summary}</p>
      <div className="artifact-list">{result.artifacts.map((a:any)=><div className="artifact" key={a.path}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}</div>
      <div className="split-panels"><div><h4>Trace</h4>{result.trace.map((t:any,i:number)=><div className="timeline" key={i}><b>{t.time} — {t.title}</b><span>{t.detail}</span></div>)}</div><div><h4>Privacy</h4>{result.privacy.map((p:any,i:number)=><div className="privacy-row compact" key={i}><Badge tone="good">{p.action}</Badge><span>{p.target}</span><small>{p.detail}</small></div>)}</div></div>
    </Card>}
  </div>;
}


function MissionHub({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [running, setRunning] = useState('');
  const [result, setResult] = useState<any>(null);
  const missions = [
    { id: 'job-application', title: 'Job Application Mission', desc: `Seeded local docs: resume, job description and portfolio notes. ${assistantName} analyzes fit, generates artifacts, and logs privacy trace.`, outputs: 'PDF + DOCX + ZIP' },
    { id: 'meeting', title: 'Meeting Notes Mission', desc: 'Transcript → summary, decisions, action items, follow-up email and ICS reminder.', outputs: 'MD + ICS' },
    { id: 'invoice', title: 'Invoice / Expense Mission', desc: 'Invoice → structured JSON, CSV line items and local PDF report.', outputs: 'JSON + CSV + PDF' },
    { id: 'study', title: 'Study Pack Mission', desc: 'Research note → summary, flashcards, quiz questions and study PDF.', outputs: 'MD + CSV + PDF' },
    { id: 'codebase', title: 'Codebase Explainer Mission', desc: 'Local project → static dependency graph, architecture report and ZIP package.', outputs: 'MD + JSON + PDF + ZIP' }
  ];
  const run = async (id: string) => { setRunning(id); setResult(null); const r = id === 'job-application' ? await window.luna.runJobMission() : await window.luna.runMissionTemplate(id); setResult({ id, ...r }); setRunning(''); pushLog(`Mission Hub completed: ${id}`); };
  return <div className="grid two">
    <Card title="Mission Hub" icon={<Wand2 size={18}/>}> 
      <p className="bigcopy">Full mission flows for common competitor-style features. Each mission produces real local artifacts, trace and privacy events.</p>
      <div className="mission-card-grid">{missions.map(m=><div className="mission-card" key={m.id}><div><b>{m.title}</b><p>{m.desc}</p><Badge tone="purple">{m.outputs}</Badge></div><button className="primary" onClick={()=>run(m.id)} disabled={!!running}>{running===m.id?'Running…':'Run'}</button></div>)}</div>
    </Card>
    <Card title="Mission Result" icon={<Activity size={18}/>}> 
      {!result && <p className="hint">Run a mission to see generated artifacts and replay.</p>}
      {result && <><h3>{result.summary}</h3><div className="artifact-list">{result.artifacts.map((a:any)=><div className="artifact" key={a.path}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}</div></>}
    </Card>
    {result && <Card title="Mission Replay & Privacy" icon={<ShieldCheck size={18}/>} className="wide"> 
      <div className="split-panels"><div><h4>Replay</h4>{result.trace.map((t:any,i:number)=><div className="timeline" key={i}><b>{t.time} — {t.title}</b><span>{t.detail}</span></div>)}</div><div><h4>Privacy</h4>{result.privacy.map((p:any,i:number)=><div className="privacy-row compact" key={i}><Badge tone="good">{p.action}</Badge><span>{p.target}</span><small>{p.detail}</small></div>)}</div></div>
    </Card>}
  </div>;
}

function ArtifactStudio({ pushLog }: { pushLog: (s: string)=>void }) {
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); const r = await window.luna.runResearchMission(); setResult(r); setBusy(false); pushLog('Research-to-Presentation package generated'); };
  return <div className="grid two">
    <Card title="Artifact Studio" icon={<FileText size={18}/>}> 
      <p className="bigcopy">Turn local research sources into polished outputs: PPTX deck, PDF brief, HTML page, speaker notes and ZIP package.</p>
      <div className="studio-preview">
        <div><b>PPTX</b><span>Presentation deck</span></div>
        <div><b>PDF</b><span>Executive brief</span></div>
        <div><b>HTML</b><span>Shareable local page</span></div>
        <div><b>MD</b><span>Speaker notes</span></div>
        <div><b>ZIP</b><span>Complete package</span></div>
      </div>
      <button className="primary" onClick={run} disabled={busy}>{busy ? 'Generating package…' : 'Run Research-to-Presentation'}</button>
      {result && <div className="artifact-list">{result.artifacts.map((a:any)=><div className="artifact" key={a.path}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}</div>}
    </Card>
    <Card title="Studio Mission Replay" icon={<Activity size={18}/>}> 
      {!result && <p className="hint">Run the mission to see the local artifact pipeline.</p>}
      {result?.trace?.map((t:any,i:number)=><div className="timeline" key={i}><b>{t.time} — {t.title}</b><span>{t.detail}</span></div>)}
    </Card>
    {result && <Card title="Studio Privacy Trace" icon={<ShieldCheck size={18}/>} className="wide"> 
      {result.privacy.map((p:any,i:number)=><div className="privacy-row" key={i}><Badge tone="good">{p.action}</Badge><span>{p.target}</span><small>{p.detail}</small></div>)}
    </Card>}
  </div>;
}


function LunaLens({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const capture = async () => { setBusy('Capturing desktop context…'); const s = await window.luna.lensContext(); setSnapshot(s); setBusy(''); pushLog('Luna Lens captured desktop context'); };
  const importImage = async () => { setBusy('Importing screenshot/image and running OCR…'); const s = await window.luna.lensImportImage(); if (s) setSnapshot(s); setBusy(''); pushLog('Luna Lens imported selected visual context'); };
  const explain = async () => { if (!snapshot) return; setBusy('Explaining local context…'); const s = await window.luna.lensExplain(snapshot); setSnapshot(s); setBusy(''); pushLog('Luna Lens generated context explanation'); };
  return <div className="grid two">
    <Card title="Luna Lens" icon={<Sparkles size={18}/>}> 
      <p className="bigcopy">Permission-bounded desktop understanding. Capture app/window context, import a screenshot manually, run OCR, then ask {assistantName} what you are looking at.</p>
      <div className="row-actions"><button className="primary" onClick={capture} disabled={!!busy}>Capture desktop context</button><button onClick={importImage} disabled={!!busy}>Import screenshot/image</button><button onClick={explain} disabled={!snapshot || !!busy}>Explain this</button></div>
      {busy && <p className="hint">{busy}</p>}
      {snapshot && <div className="lens-snapshot">
        <Badge tone="purple">{snapshot.mode}</Badge>
        <div className="metric"><span>Captured</span><b>{new Date(snapshot.capturedAt).toLocaleString()}</b></div>
        <div className="metric"><span>Active window</span><b>{snapshot.activeWindow?.title || 'Unknown'}</b></div>
        <div className="metric"><span>Owner/App</span><b>{snapshot.activeWindow?.owner || snapshot.activeWindow?.app || 'Unknown'}</b></div>
        <div className="metric"><span>Source</span><b className="path">{snapshot.sourcePath || 'Metadata only'}</b></div>
      </div>}
    </Card>
    <Card title="Detected Context" icon={<Activity size={18}/>}> 
      {!snapshot && <p className="hint">Capture context or import a screenshot to begin.</p>}
      {snapshot && <><h4>Running apps</h4><div className="app-chip-list">{snapshot.runningApps?.map((app:string)=><Badge key={app}>{app}</Badge>)}</div>{snapshot.ocrText && <><h4>OCR / Selected Text</h4><pre className="ocr-box">{snapshot.ocrText.slice(0, 2200)}</pre></>}{snapshot.summary && <><h4>{assistantName} Explanation</h4><div className="answer-box"><p>{snapshot.summary}</p></div></>}</>}
    </Card>
    {snapshot && <Card title="Lens Privacy Trace" icon={<ShieldCheck size={18}/>} className="wide"> 
      {snapshot.privacy.map((p:any,i:number)=><div className="privacy-row" key={i}><Badge tone="good">{p.action}</Badge><span>{p.target}</span><small>{p.detail}</small></div>)}
    </Card>}
  </div>;
}

function KnowledgeVault({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [state, setState] = useState<any>({ docs: [], chunks: [] });
  const [query, setQuery] = useState(`What does ${assistantName} prove about privacy?`);
  const [results, setResults] = useState<any[]>([]);
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const refresh = async () => setState(await window.luna.vaultState());
  useEffect(() => { refresh(); }, []);
  const indexDemo = async () => { setBusy('Indexing demo documents…'); const v = await window.luna.vaultIndexDemo(); setState(v); setBusy(''); pushLog('Knowledge Vault indexed demo documents'); };
  const importFiles = async () => { setBusy('Importing selected files…'); const v = await window.luna.vaultImportFiles(); setState(v); setBusy(''); pushLog('Knowledge Vault imported files'); };
  const search = async () => { setBusy('Searching local vault…'); const r = await window.luna.vaultSearch(query); setResults(r); setAnswer(null); setBusy(''); pushLog('Vault search completed'); };
  const ask = async () => { setBusy('Answering with local vault evidence…'); const r = await window.luna.vaultAsk(query); setAnswer(r); setResults(r.results); setBusy(''); pushLog('Vault answer generated'); };
  return <div className="grid two">
    <Card title="Knowledge Vault" icon={<FileText size={18}/>}> 
      <p className="bigcopy">Index local documents, search across them, and ask questions with evidence. This is {assistantName}’s local RAG layer: Ollama embeddings when available, keyword fallback when not.</p>
      <div className="row-actions"><button className="primary" onClick={indexDemo} disabled={!!busy}>Index demo docs</button><button onClick={importFiles} disabled={!!busy}>Import files</button></div>
      {busy && <p className="hint">{busy}</p>}
      <div className="vault-stats"><div><b>{state.docs?.length || 0}</b><span>documents</span></div><div><b>{state.chunks?.length || 0}</b><span>chunks</span></div><div><b>{state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : '-'}</b><span>updated</span></div></div>
      <div className="doc-list">{state.docs?.map((d:any)=><div key={d.id}><b>{d.name}</b><span>{d.type} · {d.chars} chars</span><small>{d.path}</small></div>)}</div>
    </Card>
    <Card title="Ask the Vault" icon={<Sparkles size={18}/>}> 
      <textarea value={query} onChange={e=>setQuery(e.target.value)} />
      <div className="row-actions"><button onClick={search} disabled={!!busy}>Search</button><button className="primary" onClick={ask} disabled={!!busy}>Ask with evidence</button></div>
      {answer && <div className="answer-box"><Badge tone={answer.mode==='ollama'?'good':'warn'}>{answer.mode} · {answer.model}</Badge><p>{answer.answer}</p></div>}
    </Card>
    <Card title="Evidence Results" icon={<ShieldCheck size={18}/>} className="wide"> 
      {!results.length && <p className="hint">Search or ask a question to see ranked local evidence.</p>}
      <div className="evidence-list">{results.map((r:any,i:number)=><div key={r.chunk.id} className="evidence-card"><div><Badge tone="purple">#{i+1} score {r.score}</Badge><b>{r.chunk.docName}</b><span>{r.reasons?.join(', ') || 'semantic match'}</span></div><p>{r.chunk.text.slice(0, 550)}{r.chunk.text.length>550?'…':''}</p></div>)}</div>
    </Card>
  </div>;
}


function MemoryCenter({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [state, setState] = useState<any>({ items: [] });
  const [text, setText] = useState(`User prefers ${assistantName} to avoid assumptions and cover competitor surprise features through native support or skill creation.`);
  const [type, setType] = useState('preference');
  const [query, setQuery] = useState(`What does the user want ${assistantName} to be?`);
  const [results, setResults] = useState<any[]>([]);
  const [context, setContext] = useState<any>(null);
  const refresh = async () => setState(await window.luna.memoryList());
  useEffect(() => { refresh(); }, []);
  const add = async () => { await window.luna.memoryAdd(text, type, 'manual'); await refresh(); pushLog('Memory added'); };
  const seed = async () => { setState(await window.luna.memorySeed()); setResults([]); pushLog('Memory reset to seeded profile'); };
  const del = async (id: string) => { setState(await window.luna.memoryDelete(id)); pushLog('Memory deleted'); };
  const search = async () => { const r = await window.luna.memorySearch(query); setResults(r); setContext(null); pushLog('Memory search completed'); };
  const build = async () => { const c = await window.luna.contextBuild(query); setContext(c); setResults(c.memories); pushLog('Adaptive context built'); };
  return <div className="grid two">
    <Card title="Personal Memory" icon={<Bot size={18}/>}> 
      <p className="bigcopy">{assistantName} stores reviewable local memories and retrieves only relevant ones into the prompt using embeddings when available and keyword fallback when not.</p>
      <textarea value={text} onChange={e=>setText(e.target.value)} />
      <div className="row-actions"><select value={type} onChange={e=>setType(e.target.value)}><option>preference</option><option>goal</option><option>project</option><option>fact</option><option>workflow</option><option>conversation</option></select><button className="primary" onClick={add}>Remember this</button><button onClick={seed}>Reset seed memory</button></div>
      <div className="memory-list">{state.items?.map((m:any)=><div key={m.id}><Badge tone="purple">{m.type}</Badge><p>{m.text}</p><small>{m.source} · {new Date(m.createdAt).toLocaleString()}</small><button className="tiny" onClick={()=>del(m.id)}>Delete</button></div>)}</div>
    </Card>
    <Card title="Adaptive Context Builder" icon={<Sparkles size={18}/>}> 
      <textarea value={query} onChange={e=>setQuery(e.target.value)} />
      <div className="row-actions"><button onClick={search}>Search memory</button><button className="primary" onClick={build}>Build prompt context</button></div>
      {context && <div className="answer-box"><Badge tone="good">Context built</Badge><p><b>Desktop context</b>\n{context.desktopContext}</p><p><b>Prompt preview</b>\n{context.prompt.slice(0, 1200)}{context.prompt.length>1200?'…':''}</p></div>}
      <div className="evidence-list">{results.map((r:any)=><div className="evidence-card" key={r.memory.id}><div><Badge tone="purple">{r.memory.type}</Badge><b>score {r.score}</b><span>{r.reasons?.join(', ')}</span></div><p>{r.memory.text}</p></div>)}</div>
    </Card>
  </div>;
}

function Automation({ pushLog, assistantName }: { pushLog: (s: string)=>void; assistantName: string }) {
  const [plan, setPlan] = useState<any>(null); const [done, setDone] = useState<any>(null); const [undo, setUndo] = useState<any>(null);
  const makePlan = async () => { setDone(null); setUndo(null); setPlan(await window.luna.planCleanup()); pushLog('Cleanup plan generated'); };
  const execute = async () => { const r = await window.luna.executeCleanup(plan); setDone(r); pushLog('Cleanup executed with manifest'); };
  const undoIt = async () => { const r = await window.luna.undoMission(done.missionId); setUndo(r); pushLog('Cleanup undone'); };
  return <div className="grid two">
    <Card title="Computer Cleanup with Preview" icon={<Archive size={18}/>}> 
      <button className="primary" onClick={makePlan}>Analyze demo Downloads</button>
      {plan && <><div className="risk"><Badge tone="good">Risk: {plan.risk}</Badge><Badge tone="purple">Undo manifest will be created</Badge></div><div className="moves">{plan.moves.map((m:any,i:number)=><div key={i}><b>{m.from.split(/[\\/]/).pop()}</b><span>→ {m.to.split(/[\\/]/).slice(-2).join('/')}</span><small>{m.reason}</small></div>)}</div><button onClick={execute} disabled={!!done}>Approve and run</button></>}
    </Card>
    <Card title="Undo proof" icon={<RotateCcw size={18}/>}> 
      {!done && <p className="hint">After execution, {assistantName} can revert the entire mission in one click.</p>}
      {done && <div className="success"><CheckCircle2/> Moved {done.moved} files. Manifest saved.<button onClick={()=>window.luna.revealPath(done.manifestPath)}>Reveal manifest</button><button className="danger" onClick={undoIt} disabled={!!undo}>Undo entire mission</button></div>}
      {undo && <div className="success"><RotateCcw/> Restored {undo.restored} files to original paths.</div>}
    </Card>
  </div>;
}


function Trust({ health, assistantName }: any) {
  const [audit, setAudit] = useState<any[]>([]);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [exported, setExported] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [recommendation, setRecommendation] = useState<any>(null);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [drill, setDrill] = useState<any>(null);
  const [modelBusy, setModelBusy] = useState('');
  const loadAudit = async () => { setAudit(await window.luna.auditList()); setDbStatus(await window.luna.databaseStatus()); };
  const loadRecommendation = async () => { setModelBusy('Inspecting hardware and model availability…'); const r = await window.luna.modelRecommend(); setRecommendation(r); setModelBusy(''); };
  const bench = async () => { setModelBusy('Benchmarking local model path…'); const r = await window.luna.modelBenchmark(); setBenchmarks(r); setModelBusy(''); };
  const fallback = async () => { setModelBusy('Running fallback drill…'); const r = await window.luna.fallbackDrill(); setDrill(r); setModelBusy(''); };
  useEffect(() => { loadAudit(); loadRecommendation(); }, []);
  const exportData = async () => { setBusy('Exporting trust package…'); const r = await window.luna.trustExport(); setExported(r); setBusy(''); await loadAudit(); };
  const resetAll = async () => { setBusy('Resetting all Luna demo data…'); await window.luna.dataResetAll(); setExported(null); setBusy(''); await loadAudit(); };
  const counts = audit.reduce((acc:any, e:any) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {});
  return <div className="grid two">
    <Card title="Privacy Proof" icon={<ShieldCheck size={18}/>}> 
      <div className="metric"><span>Tracked external requests</span><b>{health?.network?.externalRequests ?? 0}</b></div>
      <div className="metric"><span>Recent external hosts</span><b>{health?.network?.recentHosts?.join(', ') || 'None'}</b></div>
      <div className="metric"><span>Demo workspace</span><b className="path">{health?.demoRoot}</b></div>
      <p className="hint"><WifiOff size={14}/> Demo can be shown offline; localhost Ollama is treated as local.</p>
      <div className="row-actions"><button className="primary" onClick={exportData} disabled={!!busy}>Export trust data</button><button className="danger" onClick={resetAll} disabled={!!busy}>Delete/reset local data</button></div>
      {busy && <p className="hint">{busy}</p>}
      {exported && <div className="answer-box"><Badge tone="good">exported</Badge><p>{exported.path}</p><button onClick={()=>window.luna.revealPath(exported.path)}>Reveal export</button></div>}
    </Card>
    <Card title="Audit Summary" icon={<Activity size={18}/>}> 
      <div className="audit-counts">{['ai','file','artifact','automation','memory','skill','vault','lens','model','network','system'].map(k=><div key={k}><b>{counts[k] || 0}</b><span>{k}</span></div>)}</div>
      <button onClick={loadAudit}>Refresh audit log</button>
    </Card>
    <Card title="Local AI Inspector" icon={<Gauge size={18}/>} className="wide"> 
      <div className="metric"><span>Ollama</span><b>{health?.ollama?.ok ? 'Connected' : 'Not detected'}</b></div>
      <div className="metric"><span>Installed models</span><b>{health?.ollama?.models?.slice(0,4).join(', ') || 'None'}</b></div>
      <div className="metric"><span>CPU load</span><b>{health?.resources?.cpuLoad}%</b></div>
      <div className="metric"><span>Memory</span><b>{health?.resources?.memoryUsedGb} / {health?.resources?.memoryTotalGb} GB</b></div>
      <div className="metric"><span>GPU</span><b>{health?.resources?.gpu || 'Unavailable/unknown'}</b></div>
    </Card>
    <Card title="Local AI Recommendation" icon={<Gauge size={18}/>} className="wide"> 
      <p className="bigcopy">{assistantName} explains which local model path is safest for the machine instead of blindly calling one model for every task.</p>
      <div className="row-actions"><button onClick={loadRecommendation} disabled={!!modelBusy}>Refresh recommendation</button><button className="primary" onClick={bench} disabled={!!modelBusy}>Benchmark models</button><button onClick={fallback} disabled={!!modelBusy}>Run fallback drill</button></div>
      {modelBusy && <p className="hint">{modelBusy}</p>}
      {recommendation && <div className="model-rec">
        <Badge tone={recommendation.systemClass === 'high' ? 'good' : recommendation.systemClass === 'balanced' ? 'purple' : 'warn'}>{recommendation.systemClass} system</Badge>
        <h3>{recommendation.recommended}</h3>
        <p>{recommendation.reason}</p>
        <div className="skill-section"><b>Installed usable models</b>{(recommendation.installedUsable.length ? recommendation.installedUsable : ['None detected']).map((m:string)=><span key={m}>{m}</span>)}</div>
        <div className="skill-section"><b>Suggested missing models</b>{recommendation.missingSuggested.map((m:string)=><span key={m}>ollama pull {m}</span>)}</div>
      </div>}
    </Card>
    <Card title="Fallback Reliability Drill" icon={<ShieldCheck size={18}/>} className="wide"> 
      {!drill && <p className="hint">This intentionally exercises the fallback path so {assistantName} can prove it does not collapse when the primary model is unavailable.</p>}
      {drill && <div className="answer-box"><Badge tone="good">{drill.ok ? 'fallback ok' : 'fallback failed'}</Badge><p><b>Primary:</b> {drill.primaryStatus}</p><p><b>Fallback:</b> {drill.fallbackStatus}</p><p><b>Response:</b> {drill.response.text}</p><small>{drill.response.model} · {drill.response.tokensPerSecond} tok/s</small></div>}
    </Card>
    {benchmarks.length > 0 && <Card title="Benchmark Results" icon={<Activity size={18}/>} className="wide"> 
      <div className="benchmark-grid">{benchmarks.map((b:any)=><div className={`benchmark-card ${b.ok?'':'error'}`} key={b.model}><div><b>{b.model}</b><Badge tone={b.ok?'good':'bad'}>{b.ok?'ok':'error'}</Badge></div><div className="metric"><span>Mode</span><b>{b.mode}</b></div><div className="metric"><span>Latency</span><b>{b.latencyMs}ms</b></div><div className="metric"><span>Speed</span><b>{b.tokensPerSecond ?? '-'} tok/s</b></div><p>{b.error || b.outputPreview}</p></div>)}</div>
    </Card>}
    <Card title="SQLite Data Layer" icon={<Archive size={18}/>} className="wide"> 
      {!dbStatus && <p className="hint">Loading database status…</p>}
      {dbStatus && <><div className="metric"><span>Database path</span><b className="path">{dbStatus.path}</b></div><div className="metric"><span>Database size</span><b>{dbStatus.sizeBytes} bytes</b></div><div className="db-table-grid">{dbStatus.tables.map((t:any)=><div key={t.name}><b>{t.rows}</b><span>{t.name}</span></div>)}</div></>}
    </Card>
    <Card title="Forensics Event Log" icon={<ShieldCheck size={18}/>} className="wide"> 
      {!audit.length && <p className="hint">No audit events yet. Run a mission or refresh after actions.</p>}
      <div className="audit-log">{audit.slice(0,80).map(e=><div className={`audit-event ${e.risk}`} key={e.id}><div><Badge tone={e.risk==='high'?'bad':e.risk==='medium'?'warn':'good'}>{e.category}</Badge><b>{e.action}</b><span>{new Date(e.time).toLocaleString()}</span></div><p>{e.detail}</p><small>{e.target}</small></div>)}</div>
    </Card>
  </div>;
}



function HelpCenter({ setTab, assistantName }: { setTab: (t: Tab)=>void; assistantName: string }) {
  const shortcuts = [
    ['Ctrl/Cmd + Shift + L', `Open ${assistantName} command palette`],
    [`Click ${assistantName} Orb`, `Open/focus ${assistantName} and command palette`],
    ['Escape', 'Close command palette / voice recognition stop in supported areas'],
    ['Enter in command input', 'Run command']
  ];
  const troubleshooting = [
    ['Ollama not detected', `${assistantName} still works in transparent fallback mode. For local model mode, install Ollama and run: ollama pull qwen2.5:3b`],
    ['Embeddings unavailable', 'Knowledge Vault falls back to keyword retrieval. For semantic retrieval, run: ollama pull nomic-embed-text'],
    ['Windows SmartScreen warning', 'This is an unsigned hackathon build. Click More info → Run anyway.'],
    ['Voice unavailable', 'Use transcript mode. Voice is optional and command routing still works.'],
    ['OCR slow', 'Use the provided demo image or text attachments for a faster walkthrough.'],
    ['Demo state messy', 'Use Reset demo in the header or Delete/reset local data in Trust Center.']
  ];
  const demoPaths = [
    { title: 'Fastest proof', tab: 'showcase' as Tab, text: 'Open Guided Demo and run the one-click end-to-end proof path.' },
    { title: 'Real-file demo', tab: 'attachments' as Tab, text: 'Import files from demo-assets, summarize, add to Vault, then run a mission from Mission Hub or Artifact Studio.' },
    { title: 'Trust demo', tab: 'trust' as Tab, text: 'Show audit log, SQLite status, external request counter, trust export and reset controls.' }
  ];
  return <div className="grid two">
    <Card title="Help & Demo Guide" icon={<Sparkles size={18}/>}> 
      <p className="bigcopy">Use this page during final recording or judging if you need to quickly explain how to operate {assistantName}.</p>
      <div className="help-paths">{demoPaths.map(p => <div key={p.title}><b>{p.title}</b><span>{p.text}</span><button onClick={()=>setTab(p.tab)}>Open</button></div>)}</div>
    </Card>
    <Card title="Keyboard & Access" icon={<Activity size={18}/>}> 
      <div className="help-table">{shortcuts.map(([k,v]) => <div key={k}><b>{k}</b><span>{v}</span></div>)}</div>
    </Card>
    <Card title="Troubleshooting" icon={<ShieldCheck size={18}/>} className="wide"> 
      <div className="trouble-list">{troubleshooting.map(([k,v]) => <div key={k}><b>{k}</b><span>{v}</span></div>)}</div>
    </Card>
    <Card title="Recommended local setup" icon={<Gauge size={18}/>} className="wide"> 
      <pre className="code-block">{`ollama serve\nollama pull qwen2.5:3b\nollama pull nomic-embed-text\n\n# Then in ${assistantName}:\n1. Reset demo\n2. Open Guided Demo and run it (with or without narration)\n3. Export Trust data`}</pre>
    </Card>
  </div>;
}

function SkillCreator({ assistantName }: { assistantName: string }) {
  const [desc, setDesc] = useState('Create a skill that turns a research PDF into flashcards, quiz questions, and a PDF study report.');
  const [generated, setGenerated] = useState<any>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [runResult, setRunResult] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const refresh = async () => setSkills(await window.luna.listSkills());
  useEffect(() => { refresh(); }, []);
  const generate = async () => { setBusy('Generating skill…'); const skill = await window.luna.generateSkill(desc); setGenerated(skill); setBusy(''); };
  const save = async () => { if (!generated) return; setBusy('Saving skill…'); const res = await window.luna.saveSkill(generated); setSkills(res.skills); setBusy(''); };
  const run = async (id: string) => { setBusy('Running skill locally…'); const res = await window.luna.runSkill(id); setRunResult(res); setBusy(''); };
  return <div className="grid two">
    <Card title="Luna Skill Creator" icon={<Wand2 size={18}/>}> 
      <p className="hint">Create reusable {assistantName} skills from plain English. Skills use safe built-in tools, permissions and export formats — not arbitrary unsafe code.</p>
      <textarea value={desc} onChange={e=>setDesc(e.target.value)} />
      <div className="row-actions"><button className="primary" onClick={generate} disabled={!!busy}>Generate skill</button>{generated && <button onClick={save} disabled={!!busy}>Save reusable skill</button>}</div>
      {busy && <p className="hint">{busy}</p>}
      {generated && <div className="generated-box">
        <h3>{generated.name}</h3>
        <p>{generated.description}</p>
        <div className="skill-section"><b>Inputs</b>{generated.inputs.map((x:any)=><span key={x.name}>{x.name}: {x.description}</span>)}</div>
        <div className="skill-section"><b>Steps</b>{generated.steps.map((x:any,i:number)=><span key={x.label}>{i+1}. {x.label} — {x.detail}</span>)}</div>
        <div className="skill-section"><b>Permissions</b>{generated.permissions.map((x:string)=><span key={x}>{x}</span>)}</div>
        <div className="skill-section"><b>Outputs</b>{generated.outputs.map((x:any)=><span key={x.name}>{x.name}</span>)}</div>
      </div>}
    </Card>
    <Card title="Saved Skills" icon={<Sparkles size={18}/>}> 
      <div className="skills-list">
        {skills.map(skill => <div className="skill-card" key={skill.id}>
          <div><b>{skill.name}</b><span>{skill.description}</span><small>{skill.category} · {skill.outputs.length} outputs · {skill.permissions.length} permissions</small></div>
          <button onClick={()=>run(skill.id)} disabled={!!busy}>Run</button>
        </div>)}
      </div>
      {!skills.length && <p className="hint">No saved skills yet. Generate and save one.</p>}
    </Card>
    {runResult && <Card title="Skill Run Artifacts" icon={<FileText size={18}/>} className="wide"> 
      <h3>{runResult.skill.name}</h3>
      <div className="artifact-list">
        {runResult.artifacts.map((a:any) => <div className="artifact" key={a.path}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}
      </div>
      <div className="split-panels">
        <div><h4>Run trace</h4>{runResult.trace.map((t:any,i:number)=><div className="timeline" key={i}><b>{t.time} — {t.title}</b><span>{t.detail}</span></div>)}</div>
        <div><h4>Privacy trace</h4>{runResult.privacy.map((p:any,i:number)=><div className="privacy-row compact" key={i}><Badge tone="good">{p.action}</Badge><span>{p.target}</span><small>{p.detail}</small></div>)}</div>
      </div>
    </Card>}
  </div>;
}


function CommandPalette({ open, onClose, pushLog, assistantName }: { open: boolean; onClose: () => void; pushLog: (s: string)=>void; assistantName: string }) {
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setTimeout(()=>inputRef.current?.focus(), 50); setResult(null); } }, [open]);
  if (!open) return null;
  const run = async (value = cmd) => {
    if (!value.trim()) return;
    setBusy(true); setResult(null);
    const res = await window.luna.routeCommand(value);
    setResult(res); setBusy(false); pushLog(`Palette routed: ${res.intent}`);
  };
  const suggestions = ['Summarize my attachments', 'Prepare my job application package', 'Create a presentation from my local research notes', `Ask the vault what ${assistantName} proves about privacy`, 'Organize my demo Downloads safely', 'Run the codebase explainer mission', 'Process meeting notes', 'Extract an invoice', 'Create a study pack', 'What am I doing right now?', 'Benchmark my local AI models'];
  return <div className="palette-backdrop" onMouseDown={onClose}>
    <div className="palette" onMouseDown={e=>e.stopPropagation()}>
      <div className="palette-head"><div><b>Luna Command Palette</b><span>Ctrl/Cmd + Shift + L</span></div><button className="ghost" onClick={onClose}>Close</button></div>
      <div className="palette-input"><Sparkles size={18}/><input ref={inputRef} value={cmd} onChange={e=>setCmd(e.target.value)} placeholder={`Tell ${assistantName} what to do…`} onKeyDown={e=>{ if(e.key==='Enter') run(); if(e.key==='Escape') onClose(); }}/><button onClick={()=>run()} disabled={busy}>{busy?'Running…':'Run'}</button></div>
      <div className="palette-suggestions">{suggestions.map(s=><button key={s} onClick={()=>{setCmd(s); run(s);}} disabled={busy}>{s}</button>)}</div>
      {result && <div className="palette-result"><div className="route-head"><Badge tone="purple">{result.intent}</Badge><Badge tone="good">{Math.round(result.confidence*100)}% confidence</Badge></div><h3>{result.actionTaken}</h3><p>{result.summary}</p>{result.artifacts?.length>0 && <div className="artifact-list">{result.artifacts.map((a:any)=><div className="artifact" key={a.path}><FileText size={16}/><span>{a.name}</span><button onClick={()=>window.luna.revealPath(a.path)}>Reveal</button></div>)}</div>}</div>}
    </div>
  </div>;
}

function Onboarding({ settings, onSave }: { settings: any; onSave: (s: any)=>void }) {
  const [form, setForm] = useState<any>(settings || {});
  useEffect(() => setForm(settings || {}), [settings]);
  if (!settings || settings.onboardingComplete) return null;
  const update = (k: string, v: any) => setForm((f:any)=>({ ...f, [k]: v }));
  const finish = () => onSave({ ...form, onboardingComplete: true });
  return <div className="onboarding-backdrop">
    <div className="onboarding-panel">
      <div className="onboarding-hero"><div className="orb big"><Sparkles size={32}/></div><div><h1>Welcome to {form.assistantName || 'Luna'}</h1><p>Your private local AI operating layer for desktop work.</p></div></div>
      <div className="onboarding-grid">
        <div><b>Runs locally</b><span>Ollama/fallback support, resource meters and zero external-request tracking.</span></div>
        <div><b>Acts safely</b><span>Preview, permission traces, full undo and audit logs.</span></div>
        <div><b>Creates outputs</b><span>PDF, DOCX, PPTX, HTML, CSV, JSON, ICS and ZIP artifacts.</span></div>
        <div><b>Learns with control</b><span>Reviewable memory, Knowledge Vault and delete/export controls.</span></div>
      </div>
      <div className="settings-form compact-form">
        <label>User name<input value={form.userName || ''} onChange={e=>update('userName', e.target.value)} /></label>
        <label>Assistant name<input value={form.assistantName || 'Luna'} onChange={e=>update('assistantName', e.target.value)} /></label>
        <label>Preferred model<select value={form.preferredModel || 'auto'} onChange={e=>update('preferredModel', e.target.value)}><option>auto</option><option>qwen2.5:3b</option><option>llama3.2:3b</option><option>phi3:mini</option></select></label>
        <label>Privacy mode<select value={form.privacyMode || 'strict'} onChange={e=>update('privacyMode', e.target.value)}><option>strict</option><option>balanced</option></select></label>
      </div>
      <div className="row-actions"><button className="primary" onClick={finish}>Start using {form.assistantName || 'Luna'}</button><button onClick={()=>onSave({ ...form, onboardingComplete: true })}>Skip setup</button></div>
    </div>
  </div>;
}

function SettingsPage({ settings, setSettings, pushLog }: { settings: any; setSettings: (s:any)=>void; pushLog: (s:string)=>void }) {
  const [form, setForm] = useState<any>(settings || {});
  const [saved, setSaved] = useState(false);
  useEffect(()=>setForm(settings || {}), [settings]);
  const update = (k: string, v: any) => setForm((f:any)=>({ ...f, [k]: v }));
  const save = async () => { const next = await window.luna.settingsSave(form); setSettings(next); setSaved(true); setTimeout(()=>setSaved(false), 1600); pushLog('Settings saved'); };
  const rerun = async () => { const next = await window.luna.settingsSave({ ...form, onboardingComplete: false }); setSettings(next); pushLog('Onboarding reopened'); };
  return <div className="grid two">
    <Card title="Personalization" icon={<Bot size={18}/>}> 
      <div className="settings-form">
        <label>User name<input value={form.userName || ''} onChange={e=>update('userName', e.target.value)} /></label>
        <label>Assistant name<input value={form.assistantName || 'Luna'} onChange={e=>update('assistantName', e.target.value)} /></label>
        <label>Response style<select value={form.responseStyle || 'balanced'} onChange={e=>update('responseStyle', e.target.value)}><option>concise</option><option>balanced</option><option>detailed</option></select></label>
        <label>Preferred model<select value={form.preferredModel || 'auto'} onChange={e=>update('preferredModel', e.target.value)}><option>auto</option><option>qwen2.5:3b</option><option>llama3.2:3b</option><option>phi3:mini</option><option>mistral:7b</option></select></label>
      </div>
      <div className="row-actions"><button className="primary" onClick={save}>Save settings</button><button onClick={rerun}>Run onboarding again</button>{saved && <Badge tone="good">saved</Badge>}</div>
    </Card>
    <Card title="Privacy & Experience" icon={<ShieldCheck size={18}/>}> 
      <div className="settings-form">
        <label>Theme<select value={form.theme || 'midnight'} onChange={e=>update('theme', e.target.value)}><option>midnight</option><option>aurora</option><option>light</option></select></label>
        <label>Accent<select value={form.accent || 'purple'} onChange={e=>update('accent', e.target.value)}><option>purple</option><option>cyan</option><option>green</option></select></label>
        <label>Privacy mode<select value={form.privacyMode || 'strict'} onChange={e=>update('privacyMode', e.target.value)}><option>strict</option><option>balanced</option></select></label>
        <label className="check-row"><input type="checkbox" checked={!!form.memoryEnabled} onChange={e=>update('memoryEnabled', e.target.checked)} /> Memory enabled</label>
        <label className="check-row"><input type="checkbox" checked={!!form.voiceEnabled} onChange={e=>update('voiceEnabled', e.target.checked)} /> Voice enabled</label><p className="hint">Voice output prefers feminine voices such as Jenny, Aria, Zira, Samantha or Victoria when installed.</p>
      </div>
      <p className="hint">Strict privacy keeps permission prompts, audit logs and local-only proof visible throughout {form.assistantName || 'Luna'}.</p>
    </Card>
  </div>;
}


function App() {
  const [tab, setTab] = useState<Tab>('showcase'); const [health, setHealth] = useState<any>(); const [settings, setSettings] = useState<any>(); const [log, setLog] = useState<string[]>([]); const [paletteOpen, setPaletteOpen] = useState(false);
  const assistantName = settings?.assistantName || 'Luna';
  const refresh = async () => setHealth(await window.luna.health());
  const loadSettings = async () => setSettings(await window.luna.settingsGet());
  useEffect(() => { refresh(); loadSettings(); const id = setInterval(refresh, 2500); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!window.luna?.onCommandPalette) {
      console.warn('Luna bridge unavailable: command palette shortcut disabled');
      return;
    }
    const cleanup = window.luna.onCommandPalette(() => setPaletteOpen(true));
    return cleanup;
  }, []);
  const reset = async () => { await window.luna.resetDemo(); setLog([]); await refresh(); };
  const pushLog = (s: string) => setLog(l => [`${new Date().toLocaleTimeString()} — ${s}`, ...l].slice(0, 8));
  const saveSettings = async (next: any) => { const saved = await window.luna.settingsSave(next); setSettings(saved); pushLog('Settings saved'); };
  return <div className={`app theme-${settings?.theme || 'midnight'} accent-${settings?.accent || 'purple'}`}><Header health={health} onReset={reset} settings={settings}/><aside className="sidebar">
    <button className={tab==='showcase'?'active':''} onClick={()=>setTab('showcase')}>Guided Demo</button>
    <button className={tab==='capabilities'?'active':''} onClick={()=>setTab('capabilities')}>Capabilities</button>
    <button className={tab==='command'?'active':''} onClick={()=>setTab('command')}>Command</button>
    <button className={tab==='voice'?'active':''} onClick={()=>setTab('voice')}>Voice</button>
    <button className={tab==='attachments'?'active':''} onClick={()=>setTab('attachments')}>Attachments</button>
    <button className={tab==='missionhub'?'active':''} onClick={()=>setTab('missionhub')}>Mission Hub</button>
    <button className={tab==='studio'?'active':''} onClick={()=>setTab('studio')}>Artifact Studio</button>
    <button className={tab==='lens'?'active':''} onClick={()=>setTab('lens')}>Luna Lens</button>
    <button className={tab==='vault'?'active':''} onClick={()=>setTab('vault')}>Knowledge Vault</button>
    <button className={tab==='memory'?'active':''} onClick={()=>setTab('memory')}>Memory</button>
    <button className={tab==='automation'?'active':''} onClick={()=>setTab('automation')}>Automation</button>
    <button className={tab==='trust'?'active':''} onClick={()=>setTab('trust')}>Trust Center</button>
    <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}>Settings</button>
    <button className={tab==='help'?'active':''} onClick={()=>setTab('help')}>Help</button>
    <button className={tab==='skills'?'active':''} onClick={()=>setTab('skills')}>Luna Skill Creator</button>
    <div className="mini-log"><b>Activity</b>{log.map(x=><span key={x}>{x}</span>)}</div>
  </aside><main>
    {tab==='showcase' && <JudgeShowcase pushLog={pushLog} assistantName={assistantName}/>} {tab==='capabilities' && <CapabilityCenter setTab={setTab} assistantName={assistantName}/>} {tab==='command' && <CommandCenter pushLog={pushLog} assistantName={assistantName}/>} {tab==='voice' && <VoiceMode pushLog={pushLog} assistantName={assistantName}/>} {tab==='attachments' && <AttachmentsCenter pushLog={pushLog} assistantName={assistantName}/>} {tab==='missionhub' && <MissionHub pushLog={pushLog} assistantName={assistantName}/>} {tab==='studio' && <ArtifactStudio pushLog={pushLog}/>} {tab==='lens' && <LunaLens pushLog={pushLog} assistantName={assistantName}/>} {tab==='vault' && <KnowledgeVault pushLog={pushLog} assistantName={assistantName}/>} {tab==='memory' && <MemoryCenter pushLog={pushLog} assistantName={assistantName}/>} {tab==='automation' && <Automation pushLog={pushLog} assistantName={assistantName}/>} {tab==='trust' && <Trust health={health} assistantName={assistantName}/>} {tab==='settings' && <SettingsPage settings={settings} setSettings={setSettings} pushLog={pushLog}/>} {tab==='help' && <HelpCenter setTab={setTab} assistantName={assistantName}/>} {tab==='skills' && <SkillCreator assistantName={assistantName}/>}
  </main><CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} pushLog={pushLog} assistantName={assistantName}/><Onboarding settings={settings} onSave={saveSettings}/></div>;
}


class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error('Luna UI error boundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return <div className="fatal-screen">
        <div className="fatal-card">
          <div className="orb big"><Sparkles size={32}/></div>
          <h1>Luna recovered from a UI error</h1>
          <p>The app did not crash completely. You can reload Luna and continue the demo.</p>
          <pre>{this.state.error}</pre>
          <div className="row-actions"><button className="primary" onClick={() => location.reload()}>Reload Luna</button></div>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
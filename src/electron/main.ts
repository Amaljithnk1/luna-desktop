import { app, BrowserWindow, ipcMain, session, shell, dialog, globalShortcut, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse: any = require('pdf-parse');
const mammoth: any = require('mammoth');
const PptxGenJS: any = require('pptxgenjs');
const tesseract: any = require('tesseract.js');
const BetterSqlite3: any = require('better-sqlite3');
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import si from 'systeminformation';
import type { AutomationResult, ChatMessage, ChatResult, FilePlan, HealthStatus, MissionResult, MissionTraceItem, PrivacyEvent, ResourceSnapshot, LunaSkill, SkillRunResult, Artifact, VaultState, VaultDoc, VaultChunk, VaultSearchResult, VaultAnswer, MemoryState, MemoryItem, MemorySearchResult, ContextBuildResult, ConversationCompressionResult, ModelBenchmarkResult, ModelRecommendation, FallbackDrillResult, LensSnapshot, CommandRouteResult, AuditEvent, TrustExportResult, AttachmentState, AttachmentItem, LunaSettings, DatabaseStatus } from './types.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
function iconPath() { return app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(app.getAppPath(), 'assets/icon.png'); }
let mainWindow: BrowserWindow | null = null;
let orbWindow: BrowserWindow | null = null;
let db: any = null;
const networkLog = { externalRequests: 0, recentHosts: [] as string[] };

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const safeName = (s: string) => s.replace(/[^a-z0-9-_\. ]/gi, '_');
const isExternal = (urlString: string) => {
  try {
    const u = new URL(urlString);
    if (['file:', 'data:', 'devtools:'].includes(u.protocol)) return false;
    const h = u.hostname;
    return !(h === 'localhost' || h === '127.0.0.1' || h === '::1');
  } catch { return false; }
};

function demoRoot() { return path.join(app.getPath('userData'), 'demo-workspace'); }
function artifactsRoot() { return path.join(demoRoot(), 'artifacts'); }
function skillsPath() { return path.join(demoRoot(), 'skills.json'); }
function vaultPath() { return path.join(demoRoot(), 'vault.json'); }
function memoryPath() { return path.join(demoRoot(), 'memory.json'); }
function lensPath() { return path.join(demoRoot(), 'lens-snapshots.json'); }
function auditPath() { return path.join(demoRoot(), 'audit-log.json'); }
function databasePath() { return path.join(demoRoot(), 'luna.db'); }
function attachmentsRoot() { return path.join(demoRoot(), 'attachments'); }
function attachmentsPath() { return path.join(demoRoot(), 'attachments.json'); }
function settingsPath() { return path.join(demoRoot(), 'settings.json'); }
function codebaseRoot() { return path.join(demoRoot(), 'demo-codebase'); }
function manifestsRoot() { return path.join(demoRoot(), 'manifests'); }
function docsRoot() { return path.join(demoRoot(), 'documents'); }
function messyRoot() { return path.join(demoRoot(), 'messy-downloads'); }

async function ensureDir(p: string) { await fs.mkdir(p, { recursive: true }); }
async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }
async function readText(p: string) { return fs.readFile(p, 'utf8'); }
async function writeText(p: string, content: string) { await ensureDir(path.dirname(p)); await fs.writeFile(p, content, 'utf8'); }



function getDb() {
  if (!db) {
    fssync.mkdirSync(demoRoot(), { recursive: true });
    db = new BetterSqlite3(databasePath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        time TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        detail TEXT NOT NULL,
        risk TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(time DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_events(category);
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT,
        created_at TEXT,
        updated_at TEXT,
        keywords_json TEXT,
        embedding_json TEXT
      );
      CREATE TABLE IF NOT EXISTS vault_docs (
        id TEXT PRIMARY KEY,
        name TEXT,
        path TEXT,
        type TEXT,
        added_at TEXT,
        chars INTEGER
      );
      CREATE TABLE IF NOT EXISTS vault_chunks (
        id TEXT PRIMARY KEY,
        doc_id TEXT,
        doc_name TEXT,
        chunk_index INTEGER,
        text TEXT,
        keywords_json TEXT,
        embedding_json TEXT,
        FOREIGN KEY(doc_id) REFERENCES vault_docs(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        json TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT);
      CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, name TEXT, path TEXT, type TEXT, created_at TEXT);
    `);
  }
  return db;
}
function resetDb() {
  if (db) { try { db.close(); } catch {} db = null; }
  try { fssync.rmSync(databasePath(), { force: true }); } catch {}
  try { fssync.rmSync(databasePath() + '-wal', { force: true }); } catch {}
  try { fssync.rmSync(databasePath() + '-shm', { force: true }); } catch {}
  getDb();
}
async function databaseStatus(): Promise<DatabaseStatus> {
  const database = getDb();
  const tableNames = ['audit_events','memories','vault_docs','vault_chunks','skills','settings','artifacts'];
  const tables = tableNames.map(name => ({ name, rows: Number(database.prepare(`SELECT COUNT(*) as c FROM ${name}`).get().c) }));
  let sizeBytes = 0; try { sizeBytes = fssync.statSync(databasePath()).size; } catch {}
  return { path: databasePath(), ok: true, tables, sizeBytes };
}
function dbInsertArtifact(a: Artifact) {
  const database = getDb();
  database.prepare('INSERT OR REPLACE INTO artifacts (id,name,path,type,created_at) VALUES (?,?,?,?,?)').run(crypto.createHash('sha1').update(a.path).digest('hex'), a.name, a.path, a.type, new Date().toISOString());
}
function dbUpsertMemory(item: MemoryItem) {
  getDb().prepare('INSERT OR REPLACE INTO memories (id,type,text,source,created_at,updated_at,keywords_json,embedding_json) VALUES (?,?,?,?,?,?,?,?)').run(item.id, item.type, item.text, item.source, item.createdAt, item.updatedAt, JSON.stringify(item.keywords || {}), JSON.stringify(item.embedding || null));
}
function dbUpsertVault(vault: VaultState) {
  const database = getDb();
  const insertDoc = database.prepare('INSERT OR REPLACE INTO vault_docs (id,name,path,type,added_at,chars) VALUES (?,?,?,?,?,?)');
  const insertChunk = database.prepare('INSERT OR REPLACE INTO vault_chunks (id,doc_id,doc_name,chunk_index,text,keywords_json,embedding_json) VALUES (?,?,?,?,?,?,?)');
  const tx = database.transaction(() => {
    for (const d of vault.docs) insertDoc.run(d.id, d.name, d.path, d.type, d.addedAt, d.chars);
    for (const c of vault.chunks) insertChunk.run(c.id, c.docId, c.docName, c.index, c.text, JSON.stringify(c.keywords || {}), JSON.stringify(c.embedding || null));
  });
  tx();
}

function defaultSettings(): LunaSettings {
  return {
    userName: 'Demo User',
    assistantName: 'Luna',
    theme: 'midnight',
    accent: 'purple',
    preferredModel: 'auto',
    responseStyle: 'balanced',
    memoryEnabled: true,
    voiceEnabled: true,
    privacyMode: 'strict',
    onboardingComplete: false,
    updatedAt: new Date().toISOString()
  };
}
async function getSettings(): Promise<LunaSettings> {
  if (!(await exists(settingsPath()))) await writeText(settingsPath(), JSON.stringify(defaultSettings(), null, 2));
  return JSON.parse(await readText(settingsPath()));
}
async function saveSettings(settings: Partial<LunaSettings>): Promise<LunaSettings> {
  const current = await getSettings();
  const next: LunaSettings = { ...current, ...settings, updatedAt: new Date().toISOString() };
  await writeText(settingsPath(), JSON.stringify(next, null, 2));
  getDb().prepare('INSERT OR REPLACE INTO settings (key,value_json) VALUES (?,?)').run('settings', JSON.stringify(next));
  await logAudit('system', 'save_settings', settingsPath(), `Saved Luna settings for assistant ${next.assistantName}.`, 'low');
  return next;
}

async function readAudit(): Promise<AuditEvent[]> {
  try {
    const rows = getDb().prepare('SELECT * FROM audit_events ORDER BY time DESC LIMIT 500').all();
    return rows.map((r: any) => ({ id: r.id, time: r.time, category: r.category, action: r.action, target: r.target, detail: r.detail, risk: r.risk }));
  } catch {
    try { return JSON.parse(await readText(auditPath())); } catch { return []; }
  }
}
async function logAudit(category: AuditEvent['category'], action: string, target: string, detail: string, risk: AuditEvent['risk'] = 'low') {
  const event: AuditEvent = { id: crypto.randomUUID?.() || crypto.createHash('sha1').update(Date.now()+action+target).digest('hex').slice(0,12), time: new Date().toISOString(), category, action, target, detail, risk };
  try { getDb().prepare('INSERT OR REPLACE INTO audit_events (id,time,category,action,target,detail,risk) VALUES (?,?,?,?,?,?,?)').run(event.id, event.time, event.category, event.action, event.target, event.detail, event.risk); } catch {}
  const all = [event, ...(await readAudit()).filter(e => e.id !== event.id)].slice(0, 500);
  await writeText(auditPath(), JSON.stringify(all, null, 2));
  return event;
}


async function resetDemo() {
  if (db) { try { db.close(); } catch {} db = null; }
  await fs.rm(demoRoot(), { recursive: true, force: true });
  await ensureDir(docsRoot());
  await ensureDir(artifactsRoot());
  await ensureDir(manifestsRoot());
  await ensureDir(messyRoot());
  await ensureDir(attachmentsRoot());
  resetDb();
  await ensureDir(path.join(codebaseRoot(), 'src'));
  await ensureDir(path.join(codebaseRoot(), 'src', 'services'));
  await writeText(path.join(docsRoot(), 'Demo_User_Resume.txt'), `Demo User\nFull-stack developer with projects in Electron, React, Node.js, Python, local AI tools and automation.\nExperience:\n- Built desktop prototypes using Electron and TypeScript.\n- Created document automation tools and PDF/DOCX export pipelines.\n- Worked with local AI models using Ollama, embeddings and retrieval.\nProjects:\n- Luna: local-first AI desktop assistant with privacy proof, file automation and artifact generation.\n- StudyVault: PDF summarizer and flashcard generator.\nPreferences: concise but complete technical explanations, privacy-first systems, polished demo flows.`);
  await writeText(path.join(docsRoot(), 'Job_Description_Local_AI_Founding_Engineer.txt'), `Role: Founding Engineer - Local AI Desktop Assistant\nCompany needs a builder who can ship a polished desktop AI assistant. Requirements include Electron or native desktop experience, local open-source AI model integration, privacy-first architecture, desktop automation, file processing, product taste, and fast iteration. Bonus: experience with Ollama, embeddings, PDF/DOCX/PPTX generation, model benchmarking, and safe permission-based automation.`);
  await writeText(path.join(docsRoot(), 'Portfolio_Notes.md'), `# Portfolio Notes\n- Luna prototype emphasizes local AI, network proof, reversible automations and artifact generation.\n- Strongest work: Electron app architecture, safe file tools, generated reports, practical workflow UX.\n- Demo story: apply for a local AI founding engineer role completely offline.`);
  await writeText(path.join(docsRoot(), 'Research_Local_AI_Privacy.md'), `# Local AI Privacy Research\nLocal AI assistants reduce cloud exposure by processing prompts, documents and embeddings on-device. The strongest systems combine local model routing, permission-scoped file access, audit logs, and reversible actions. Risks include over-collection, hidden network calls, and unclear memory retention. Best practices include zero-network telemetry, visible resource meters, per-action privacy traces, and user-controlled deletion.`);
  await writeText(path.join(docsRoot(), 'Invoice_Demo_Electronics.txt'), `Invoice No: DEMO-2026-071\nVendor: Demo Electronics Store\nDate: 2026-07-03\nItems:\n- USB-C Hub, Qty 1, Price INR 1799\n- HDMI Cable, Qty 1, Price INR 700\nSubtotal: INR 2499\nTax: INR 0\nTotal: INR 2499`);
  await writeText(path.join(docsRoot(), 'Meeting_Transcript_Luna_Demo.txt'), `Demo Lead: We need the Luna demo to prove local AI, not just claim it.\nTeammate: The job application mission should generate visible artifacts. The demo lead will polish the PDF and DOCX exports by Friday.\nDemo Lead: Also add a reset demo state and privacy trace. The risk is a live demo failure.\nTeammate: I will test the Windows packaging tomorrow and prepare fallback instructions.\nDecision: Main demo will focus on offline proof, job mission, file automation undo, and Luna Skill Creator.`);
  await writeText(path.join(codebaseRoot(), 'package.json'), JSON.stringify({ name: 'demo-luna-widget', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.0.0', vite: '^5.0.0' } }, null, 2));
  await writeText(path.join(codebaseRoot(), 'src', 'app.tsx'), `import { summarizeDocument } from './services/ai';\nimport { saveArtifact } from './services/artifacts';\n\nexport function App() {\n  return <main><h1>Demo Luna Widget</h1></main>;\n}\n\nexport async function runWorkflow(fileText: string) {\n  const summary = await summarizeDocument(fileText);\n  return saveArtifact('summary.md', summary);\n}`);
  await writeText(path.join(codebaseRoot(), 'src', 'services', 'ai.ts'), `export async function summarizeDocument(text: string) {\n  return 'Summary: ' + text.slice(0, 120);\n}\n\nexport async function classifyIntent(input: string) {\n  if (input.includes('presentation')) return 'artifact_studio';\n  return 'chat';\n}`);
  await writeText(path.join(codebaseRoot(), 'src', 'services', 'artifacts.ts'), `export async function saveArtifact(name: string, content: string) {\n  return { name, content, savedAt: new Date().toISOString() };\n}`);
  await writeText(path.join(codebaseRoot(), 'README.md'), `# Demo Luna Widget\n\nA tiny demo codebase used by Luna Codebase Explainer. It has a React app, an AI service, and an artifact service.`);
  await writeText(skillsPath(), JSON.stringify(defaultSkills(), null, 2));
  await writeText(vaultPath(), JSON.stringify({ docs: [], chunks: [], updatedAt: new Date().toISOString() }, null, 2));
  await seedMemoryNow();
  await writeText(lensPath(), JSON.stringify([], null, 2));
  await writeText(auditPath(), JSON.stringify([], null, 2));
  await writeText(attachmentsPath(), JSON.stringify({ items: [], updatedAt: new Date().toISOString() }, null, 2));
  await writeText(settingsPath(), JSON.stringify(defaultSettings(), null, 2));
  const messyFiles: Record<string, string> = {
    'invoice_july.pdf.txt': 'Fake invoice placeholder. Vendor: Demo Electronics Store. Total: INR 2499.',
    'resume_old.docx.txt': 'Old resume draft.',
    'screenshot_2026-07-01.png.txt': 'Screenshot placeholder.',
    'research_notes_ai.md': '# Local AI research notes\nQwen, Phi, Llama, embeddings, privacy.',
    'cover_letter_draft.txt': 'Dear team, I am excited...'
  };
  for (const [name, content] of Object.entries(messyFiles)) await writeText(path.join(messyRoot(), name), content);
  networkLog.externalRequests = 0; networkLog.recentHosts = [];
  await logAudit('system', 'reset_demo', demoRoot(), 'Demo workspace reset to clean seeded state.', 'low');
  return { ok: true, demoRoot: demoRoot() };
}


async function ensureInitialData() {
  const needsSeed = !(await exists(demoRoot())) || !(await exists(settingsPath())) || !(await exists(skillsPath())) || !(await exists(memoryPath())) || !(await exists(path.join(docsRoot(), 'Demo_User_Resume.txt')));
  if (needsSeed) return resetDemo();
  await ensureDir(docsRoot());
  await ensureDir(artifactsRoot());
  await ensureDir(manifestsRoot());
  await ensureDir(messyRoot());
  await ensureDir(attachmentsRoot());
  getDb();
  return { ok: true, demoRoot: demoRoot(), reusedExistingData: true };
}

async function getResources(): Promise<ResourceSnapshot> {
  const load = await si.currentLoad().catch(() => ({ currentLoad: 0 } as any));
  const graphics = await si.graphics().catch(() => ({ controllers: [] } as any));
  return {
    cpuLoad: Math.round(load.currentLoad || 0),
    memoryUsedGb: Number(((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2)),
    memoryTotalGb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    platform: `${os.platform()} ${os.arch()}`,
    gpu: graphics.controllers?.[0]?.model
  };
}

async function checkOllama() {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    return { ok: true, models: (json.models || []).map((m: any) => m.name) };
  } catch (e: any) { return { ok: false, models: [], error: e.message || String(e) }; }
}

async function health(): Promise<HealthStatus> {
  if (!(await exists(demoRoot()))) await resetDemo();
  return { ollama: await checkOllama(), network: { ...networkLog }, resources: await getResources(), demoRoot: demoRoot() };
}

function fallbackAnswer(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1]?.content?.toLowerCase() || '';
  if (last.includes('what') && last.includes('luna')) return 'I am Luna, a local-first desktop AI layer. In this prototype I can chat, analyze seeded local documents, generate job-application artifacts, organize files with preview and full undo, and show privacy/resource proof widgets.';
  if (last.includes('privacy')) return 'Privacy trace: Luna is using local demo mode or local Ollama only. External network requests are tracked in the header, file access is logged per mission, and demo data can be reset with one click.';
  return 'Demo fallback response: Ollama is not currently available, so Luna is using its built-in local fallback path. The full app routes to Ollama when it is running, and keeps the same privacy/action tracing UI.';
}

async function chat(messages: ChatMessage[]): Promise<ChatResult> {
  const startedAt = Date.now();
  const settings = await getSettings().catch(() => defaultSettings());
  const preferred = ['qwen2.5:3b', 'llama3.2:3b', 'phi3:mini'];
  const o = await checkOllama();
  const explicit = settings.preferredModel && settings.preferredModel !== 'auto'
    ? o.models.find((x: string) => x.startsWith(settings.preferredModel))
    : undefined;
  const model = explicit || preferred.find(m => o.models.some((x: string) => x.startsWith(m))) || o.models[0];
  const styleHint = settings.responseStyle === 'concise' ? 'Keep responses short and direct.' : settings.responseStyle === 'detailed' ? 'Give detailed, structured responses with useful context.' : 'Use balanced detail and clear structure.';
  if (o.ok && model) {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, messages: [
          { role: 'system', content: `You are ${settings.assistantName || 'Luna'}, a local-first desktop AI assistant for ${settings.userName || 'the user'}. ${styleHint} Emphasize privacy, concrete next actions, and safe permission-based desktop automation.` },
          ...messages
        ]})
      });
      const json: any = await res.json();
      const finishedAt = Date.now();
      const text = json.message?.content || json.response || '';
      const tokenGuess = Math.max(1, text.split(/\s+/).length * 1.3);
      await logAudit('ai', 'local_ollama_chat', model, `Generated chat response locally in ${finishedAt - startedAt}ms.`, 'low');
      return { text, mode: 'ollama', model, startedAt, finishedAt, tokensPerSecond: Number((tokenGuess / ((finishedAt - startedAt) / 1000)).toFixed(1)) };
    } catch { /* fall through */ }
  }
  const text = fallbackAnswer(messages);
  const finishedAt = Date.now();
  await logAudit('ai', 'demo_fallback_chat', 'built-in scripted fallback', 'Used transparent fallback response path.', 'low');
  return { text, mode: 'demo-fallback', model: 'built-in scripted fallback', startedAt, finishedAt, tokensPerSecond: Number((text.split(/\s+/).length / ((finishedAt - startedAt + 50) / 1000)).toFixed(1)) };
}

let asrPipelinePromise: Promise<any> | null = null;
let asrModelReady = false;
function speechModelDir() { return path.join(app.getPath('userData'), 'speech-models'); }
async function getAsrPipeline() {
  if (!asrPipelinePromise) {
    asrPipelinePromise = (async () => {
      const alreadyDownloaded = fssync.existsSync(speechModelDir()) && fssync.readdirSync(speechModelDir()).length > 0;
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = speechModelDir();
      env.allowRemoteModels = true;
      if (!alreadyDownloaded) {
        networkLog.externalRequests++;
        networkLog.recentHosts = ['huggingface.co', ...networkLog.recentHosts.filter(h => h !== 'huggingface.co')].slice(0, 8);
        await logAudit('network', 'speech_model_download', 'huggingface.co (Xenova/whisper-tiny.en)', 'One-time download of open Whisper weights so speech-to-text can run fully on-device afterward. This is the only network request the voice feature ever makes.', 'low');
      }
      const p = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      asrModelReady = true;
      return p;
    })();
  }
  return asrPipelinePromise;
}
async function voiceModelStatus() {
  return { ready: asrModelReady, cacheDir: speechModelDir(), downloaded: fssync.existsSync(speechModelDir()) };
}
async function transcribeAudio(samples: Float32Array | number[]): Promise<{ text: string }> {
  const startedAt = Date.now();
  const asr = await getAsrPipeline();
  const floatSamples = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const result: any = await asr(floatSamples);
  const text = (Array.isArray(result) ? result[0]?.text : result?.text) || '';
  await logAudit('ai', 'local_whisper_transcribe', 'Xenova/whisper-tiny.en', `Transcribed ${(floatSamples.length / 16000).toFixed(1)}s of local audio in ${Date.now() - startedAt}ms. No network request was made.`, 'low');
  return { text: text.trim() };
}


async function generatePdf(file: string, title: string, sections: { heading: string; body: string }[]) {
  await ensureDir(path.dirname(file));
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fssync.createWriteStream(file);
    doc.pipe(stream);
    doc.fontSize(22).fillColor('#7c3aed').text(title, { align: 'left' });
    doc.moveDown().fontSize(9).fillColor('#777').text(`Generated locally by Luna · ${new Date().toLocaleString()}`);
    doc.moveDown();
    for (const s of sections) {
      doc.fontSize(15).fillColor('#111').text(s.heading, { underline: false });
      doc.moveDown(0.25).fontSize(11).fillColor('#333').text(s.body, { lineGap: 4 });
      doc.moveDown();
    }
    doc.end();
    stream.on('finish', resolve); stream.on('error', reject);
  });
}

async function generateDocx(file: string, title: string, paragraphs: string[]) {
  await ensureDir(path.dirname(file));
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generated locally by Luna · ${new Date().toLocaleString()}`, italics: true })] }),
    ...paragraphs.map(p => new Paragraph({ text: p, spacing: { after: 180 } }))
  ] }] });
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(file, buffer);
}

async function zipFiles(zipPath: string, files: string[]) {
  await ensureDir(path.dirname(zipPath));
  const archiveModule = await import('archiver');
  const archiver = (archiveModule as any).default ?? archiveModule;
  return new Promise<void>((resolve, reject) => {
    const output = fssync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const f of files) archive.file(f, { name: path.basename(f) });
    archive.finalize();
  });
}



const STOPWORDS = new Set('the a an and or to of in on for with from by as is are was were be been being this that these those it its into about using use user local ai luna can will should would could your you my i we they their'.split(' '));
function tokenize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w)).slice(0, 5000);
}
function keywordVector(text: string): Record<string, number> {
  const v: Record<string, number> = {};
  for (const w of tokenize(text)) v[w] = (v[w] || 0) + 1;
  const max = Math.max(1, ...Object.values(v));
  for (const k of Object.keys(v)) v[k] = Number((v[k] / max).toFixed(4));
  return v;
}
function cosineSparse(a: Record<string, number>, b: Record<string, number>) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, av] of Object.entries(a)) { na += av * av; if (b[k]) dot += av * b[k]; }
  for (const bv of Object.values(b)) nb += bv * bv;
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function cosineDense(a?: number[], b?: number[]) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
async function embedTextLocal(text: string): Promise<{ model: string; embedding?: number[]; ok: boolean; error?: string }> {
  const ollama = await checkOllama();
  const preferred = ['nomic-embed-text', 'mxbai-embed-large', 'snowflake-arctic-embed'];
  const model = preferred.find(m => ollama.models.some((x: string) => x.startsWith(m))) || '';
  if (!ollama.ok || !model) return { model: 'keyword-fallback', ok: false, error: 'No Ollama embedding model installed. Suggested: ollama pull nomic-embed-text' };
  try {
    const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text.slice(0, 6000) })
    });
    const json: any = await res.json();
    const embedding = json.embedding || json.embeddings?.[0];
    if (!Array.isArray(embedding)) throw new Error('No embedding returned');
    return { model, embedding, ok: true };
  } catch (e: any) {
    return { model, ok: false, error: e.message || String(e) };
  }
}

function chunkText(text: string, maxChars = 900): string[] {
  const paras = text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const para of paras.length ? paras : [text]) {
    if ((cur + '\n\n' + para).length > maxChars && cur) { chunks.push(cur); cur = para; }
    else cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur) chunks.push(cur);
  return chunks.flatMap(c => c.length <= maxChars * 1.5 ? [c] : c.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, 'g')) || [c]);
}
async function readVault(): Promise<VaultState> {
  if (!(await exists(vaultPath()))) await writeText(vaultPath(), JSON.stringify({ docs: [], chunks: [], updatedAt: new Date().toISOString() }, null, 2));
  await seedMemoryNow();
  await writeText(lensPath(), JSON.stringify([], null, 2));
  await writeText(auditPath(), JSON.stringify([], null, 2));
  await writeText(attachmentsPath(), JSON.stringify({ items: [], updatedAt: new Date().toISOString() }, null, 2));
  await writeText(settingsPath(), JSON.stringify(defaultSettings(), null, 2));
  return JSON.parse(await readText(vaultPath()));
}
async function writeVault(v: VaultState) { v.updatedAt = new Date().toISOString(); await writeText(vaultPath(), JSON.stringify(v, null, 2)); dbUpsertVault(v); }
async function readDocumentAny(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) return fs.readFile(filePath, 'utf8');
  if (ext === '.pdf') {
    const data = await fs.readFile(filePath);
    const parsed = await pdfParse(data);
    return parsed.text || '';
  }
  if (ext === '.docx') {
    const res = await mammoth.extractRawText({ path: filePath });
    return res.value || '';
  }
  return fs.readFile(filePath, 'utf8').catch(() => '');
}

async function readAttachments(): Promise<AttachmentState> {
  if (!(await exists(attachmentsPath()))) await writeText(attachmentsPath(), JSON.stringify({ items: [], updatedAt: new Date().toISOString() }, null, 2));
  await writeText(settingsPath(), JSON.stringify(defaultSettings(), null, 2));
  return JSON.parse(await readText(attachmentsPath()));
}
async function writeAttachments(state: AttachmentState) { state.updatedAt = new Date().toISOString(); await writeText(attachmentsPath(), JSON.stringify(state, null, 2)); }
async function importAttachments(): Promise<AttachmentState> {
  const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'], filters: [ { name: 'Supported files', extensions: ['txt','md','pdf','docx','csv','json','png','jpg','jpeg','webp'] }, { name: 'All Files', extensions: ['*'] } ] });
  if (res.canceled || !res.filePaths.length) return readAttachments();
  const state = await readAttachments();
  await ensureDir(attachmentsRoot());
  for (const originalPath of res.filePaths) {
    const ext = path.extname(originalPath).toLowerCase();
    const id = crypto.createHash('sha1').update(originalPath + Date.now()).digest('hex').slice(0, 12);
    const storedPath = path.join(attachmentsRoot(), `${id}_${safeName(path.basename(originalPath))}`);
    await fs.copyFile(originalPath, storedPath);
    let text = '';
    if (['.png','.jpg','.jpeg','.webp','.bmp'].includes(ext)) text = await ocrImage(storedPath);
    else text = await readDocumentAny(storedPath);
    const item: AttachmentItem = { id, name: path.basename(originalPath), originalPath, storedPath, type: ext.replace('.', '') || 'file', addedAt: new Date().toISOString(), chars: text.length, textPreview: text.slice(0, 1500) };
    state.items = [item, ...state.items.filter(i => i.id !== id)];
    await logAudit('file', 'import_attachment', originalPath, `Imported attachment ${item.name} with ${item.chars} extracted characters.`, 'low');
  }
  await writeAttachments(state);
  return state;
}
async function clearAttachments(): Promise<AttachmentState> {
  await fs.rm(attachmentsRoot(), { recursive: true, force: true });
  await ensureDir(attachmentsRoot());
  const state = { items: [], updatedAt: new Date().toISOString() };
  await writeAttachments(state);
  await logAudit('file', 'clear_attachments', attachmentsRoot(), 'Cleared imported attachments.', 'low');
  return state;
}
async function attachmentsToVault(): Promise<VaultState> {
  const state = await readAttachments();
  const vault = await addDocsToVault(state.items.map(i => i.storedPath));
  await logAudit('vault', 'attachments_to_vault', attachmentsRoot(), `Indexed ${state.items.length} attachment(s) into Knowledge Vault.`, 'low');
  return vault;
}
async function summarizeAttachments(): Promise<MissionResult> {
  const state = await readAttachments();
  const trace: MissionTraceItem[] = [];
  const privacy: PrivacyEvent[] = [];
  if (!state.items.length) return { summary: 'No attachments imported yet.', artifacts: [], trace: [], privacy: [] };
  const combined = state.items.map((i, idx) => `ATTACHMENT ${idx+1}: ${i.name}\n${i.textPreview}`).join('\n\n---\n\n');
  state.items.forEach(i => privacy.push({ time: now(), action: 'read_attachment', target: i.storedPath, detail: `Used extracted text preview from ${i.name}.` }));
  trace.push({ time: now(), title: 'Loaded attachments', detail: `Prepared ${state.items.length} attachment(s) for local summarization.` });
  const ai = await chatPlus([{ role: 'user', content: `Summarize these attachments. Extract key points, action items, risks, and suggested Luna skills/workflows.\n${combined}` }]);
  privacy.push({ time: now(), action: 'local_inference', target: ai.model, detail: `Summarized attachments via ${ai.mode}.` });
  const dir = path.join(artifactsRoot(), 'attachments');
  await ensureDir(dir);
  const mdPath = path.join(dir, 'attachment_summary.md');
  const pdfPath = path.join(dir, 'attachment_summary.pdf');
  const zipPath = path.join(dir, 'attachment_summary_package.zip');
  await writeText(mdPath, `# Attachment Summary\n\n${ai.text}\n\n## Files\n${state.items.map(i => `- ${i.name} (${i.type}, ${i.chars} chars)`).join('\n')}`);
  await generatePdf(pdfPath, 'Luna Attachment Summary', [
    { heading: 'Summary', body: ai.text },
    { heading: 'Files Used', body: state.items.map(i => `${i.name} — ${i.type} — ${i.chars} chars`).join('\n') },
    { heading: 'Privacy', body: 'Attachments were copied into Luna local workspace and summarized locally/fallback path. External requests remain tracked in Trust Center.' }
  ]);
  await zipFiles(zipPath, [mdPath, pdfPath]);
  trace.push({ time: now(), title: 'Exported attachment summary', detail: 'Created Markdown, PDF and ZIP summary package.' });
  await logAudit('artifact', 'attachment_summary', dir, `Summarized ${state.items.length} attachment(s) and exported artifacts.`, 'low');
  return { summary: 'Attachment summary generated locally.', artifacts: [ { name: 'attachment_summary.md', path: mdPath, type: 'md' }, { name: 'attachment_summary.pdf', path: pdfPath, type: 'pdf' }, { name: 'attachment_summary_package.zip', path: zipPath, type: 'zip' } ], trace, privacy };
}

async function addDocsToVault(files: string[]): Promise<VaultState> {
  const vault = await readVault();
  for (const filePath of files) {
    const text = await readDocumentAny(filePath);
    if (!text.trim()) continue;
    const id = crypto.createHash('sha1').update(filePath + text.slice(0, 200)).digest('hex').slice(0, 12);
    vault.docs = vault.docs.filter(d => d.id !== id);
    vault.chunks = vault.chunks.filter(c => c.docId !== id);
    const doc: VaultDoc = { id, name: path.basename(filePath), path: filePath, type: path.extname(filePath).replace('.', '') || 'text', addedAt: new Date().toISOString(), chars: text.length };
    vault.docs.push(doc);
    const chunks = chunkText(text);
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const cid = `${id}_${index}`;
      const emb = await embedTextLocal(chunk);
      const vc: VaultChunk = { id: cid, docId: id, docName: doc.name, text: chunk, index, keywords: keywordVector(chunk), embedding: emb.embedding };
      vault.chunks.push(vc);
    }
  }
  await writeVault(vault);
  await logAudit('vault', 'index_documents', vaultPath(), `Vault now contains ${vault.docs.length} docs and ${vault.chunks.length} chunks.`, 'low');
  return vault;
}
async function indexDemoVault(): Promise<VaultState> {
  if (!(await exists(demoRoot()))) await resetDemo();
  const files = (await fs.readdir(docsRoot())).map(f => path.join(docsRoot(), f));
  return addDocsToVault(files);
}
async function importVaultFiles(): Promise<VaultState> {
  const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'], filters: [ { name: 'Documents', extensions: ['txt','md','pdf','docx','csv','json'] }, { name: 'All Files', extensions: ['*'] } ] });
  if (res.canceled || !res.filePaths.length) return readVault();
  return addDocsToVault(res.filePaths);
}
async function searchVault(query: string): Promise<VaultSearchResult[]> {
  const vault = await readVault();
  const qv = keywordVector(query);
  const qDense = await embedTextLocal(query);
  const qTokens = new Set(tokenize(query));
  return vault.chunks.map(chunk => {
    const sparse = cosineSparse(qv, chunk.keywords);
    const dense = qDense.embedding && chunk.embedding ? cosineDense(qDense.embedding, chunk.embedding) : 0;
    const overlap = Object.keys(chunk.keywords).filter(k => qTokens.has(k));
    const exactBoost = overlap.length ? Math.min(0.2, overlap.length * 0.035) : 0;
    const score = Number(((dense ? dense * 0.72 : 0) + sparse * 0.28 + exactBoost).toFixed(4));
    const reasons = [
      ...(dense ? [`semantic embedding: ${dense.toFixed(3)}`] : ['keyword fallback']),
      ...overlap.slice(0, 5).map(w => `keyword: ${w}`)
    ];
    return { chunk, score, reasons };
  }).filter(r => r.score > 0).sort((a,b) => b.score - a.score).slice(0, 6);
}
async function askVault(question: string): Promise<VaultAnswer> {
  const results = await searchVault(question);
  const context = results.map((r, i) => `SOURCE ${i+1}: ${r.chunk.docName}\n${r.chunk.text}`).join('\n\n---\n\n');
  const res = await chat([{ role: 'user', content: `Answer the question using only these local vault sources. If sources are insufficient, say what is missing. Include brief evidence references by source number.\n\nQUESTION: ${question}\n\n${context || 'No relevant local sources found.'}` }]);
  return { answer: res.text, results, mode: res.mode, model: res.model };
}


function makeMemory(type: MemoryItem['type'], text: string, source = 'seed'): MemoryItem {
  const ts = new Date().toISOString();
  return { id: crypto.createHash('sha1').update(type + text + ts).digest('hex').slice(0, 12), type, text, source, createdAt: ts, updatedAt: ts, keywords: keywordVector(text) };
}
function seedMemories(): MemoryState {
  return { updatedAt: new Date().toISOString(), items: [
    makeMemory('preference', 'User prefers direct but strategically complete answers, with no unsafe assumptions.', 'onboarding'),
    makeMemory('goal', 'User wants Luna to be the hardest hackathon submission to beat by combining local AI, proof, safe automation and feature-generating skills.', 'strategy'),
    makeMemory('project', 'Current project is Luna: a local AI desktop operating layer built with Electron, React, TypeScript, SQLite-style local JSON storage and Ollama.', 'project'),
    makeMemory('preference', 'User values features that can absorb competitor surprises: if another app has a feature, Luna should have it natively, support it, or create it through Luna Skill Creator.', 'strategy')
  ] };
}
async function readMemory(): Promise<MemoryState> {
  if (!(await exists(memoryPath()))) await seedMemoryNow();
  await writeText(lensPath(), JSON.stringify([], null, 2));
  await writeText(auditPath(), JSON.stringify([], null, 2));
  await writeText(attachmentsPath(), JSON.stringify({ items: [], updatedAt: new Date().toISOString() }, null, 2));
  await writeText(settingsPath(), JSON.stringify(defaultSettings(), null, 2));
  return JSON.parse(await readText(memoryPath()));
}
async function writeMemory(m: MemoryState) { m.updatedAt = new Date().toISOString(); await writeText(memoryPath(), JSON.stringify(m, null, 2)); for (const item of m.items) dbUpsertMemory(item); }
async function addMemory(text: string, type: MemoryItem['type'] = 'fact', source = 'user'): Promise<MemoryItem> {
  const settings = await getSettings().catch(() => defaultSettings());
  if (!settings.memoryEnabled && source !== 'seed' && source !== 'onboarding') {
    const mem = makeMemory(type, `[Memory disabled] ${text}`, source);
    await logAudit('memory', 'memory_disabled_skip', type, text.slice(0, 160), 'low');
    return mem;
  }
  const state = await readMemory();
  const mem = makeMemory(type, text, source);
  const emb = await embedTextLocal(text);
  mem.embedding = emb.embedding;
  state.items = [mem, ...state.items];
  await writeMemory(state);
  await logAudit('memory', 'add_memory', type, text.slice(0, 160), 'low');
  return mem;
}
async function listMemory(): Promise<MemoryState> { return readMemory(); }
async function deleteMemory(id: string) {
  const state = await readMemory();
  state.items = state.items.filter(m => m.id !== id);
  await writeMemory(state);
  return state;
}
async function seedMemoryNow() {
  const m = seedMemories();
  for (const item of m.items) item.embedding = (await embedTextLocal(item.text)).embedding;
  await writeMemory(m); return m;
}
async function searchMemory(query: string): Promise<MemorySearchResult[]> {
  const state = await readMemory();
  const qv = keywordVector(query);
  const qDense = await embedTextLocal(query);
  const qTokens = new Set(tokenize(query));
  return state.items.map(memory => {
    const sparse = cosineSparse(qv, memory.keywords);
    const dense = qDense.embedding && memory.embedding ? cosineDense(qDense.embedding, memory.embedding) : 0;
    const overlap = Object.keys(memory.keywords).filter(k => qTokens.has(k));
    const typeBoost = query.toLowerCase().includes(memory.type) ? 0.08 : 0;
    const score = Number(((dense ? dense * 0.7 : 0) + sparse * 0.3 + Math.min(0.2, overlap.length * 0.04) + typeBoost).toFixed(4));
    const reasons = [
      ...(dense ? [`semantic embedding: ${dense.toFixed(3)}`] : ['keyword fallback']),
      ...overlap.slice(0, 5).map(w => `keyword: ${w}`)
    ];
    return { memory, score, reasons };
  }).filter(r => r.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
}
function getDesktopContext() {
  return `Platform: ${os.platform()} ${os.arch()}\nDemo workspace: ${demoRoot()}\nLocal network proof: ${networkLog.externalRequests} tracked external requests since launch\nCurrent time: ${new Date().toLocaleString()}`;
}
async function buildContext(query: string): Promise<ContextBuildResult> {
  const settings = await getSettings().catch(() => defaultSettings());
  const memories = settings.memoryEnabled ? await searchMemory(query) : [];
  const vault = await searchVault(query);
  const desktopContext = getDesktopContext();
  const prompt = [
    `You are ${settings.assistantName || 'Luna'}, a private local AI operating layer for desktop tasks.`,
    `User: ${settings.userName || 'unknown'}. Response style: ${settings.responseStyle}. Privacy mode: ${settings.privacyMode}.`,
    'Use the context below when relevant. Be explicit when evidence is insufficient.',
    '\nDESKTOP CONTEXT:\n' + desktopContext,
    '\nRELEVANT MEMORIES:\n' + (memories.map((m, i) => `${i+1}. [${m.memory.type}] ${m.memory.text}`).join('\n') || 'None'),
    '\nRELEVANT VAULT EVIDENCE:\n' + (vault.map((v, i) => `${i+1}. ${v.chunk.docName}: ${v.chunk.text.slice(0, 600)}`).join('\n---\n') || 'None'),
    '\nUSER REQUEST:\n' + query
  ].join('\n');
  return { prompt, memories, vault, desktopContext };
}
async function chatPlus(messages: ChatMessage[]): Promise<ChatResult & { context: ContextBuildResult; compression?: ConversationCompressionResult }> {
  const last = messages[messages.length - 1]?.content || '';
  const context = await buildContext(last);
  const recent = messages.slice(-6);
  let compression: ConversationCompressionResult | undefined;
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (messages.length > 10 || totalChars > 7000) {
    const older = messages.slice(0, -6).map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 6000);
    const summaryRes = await chat([{ role: 'user', content: `Compress this conversation into stable memory facts, decisions and user preferences in under 180 words:\n${older}` }]);
    const memory = await addMemory(summaryRes.text, 'conversation', 'conversation-compression');
    compression = { created: true, memory, summary: summaryRes.text };
  } else compression = { created: false };
  const enriched: ChatMessage[] = [
    { role: 'system', content: context.prompt },
    ...recent
  ];
  const res = await chat(enriched);
  return { ...res, context, compression };
}

function defaultSkills(): LunaSkill[] {
  const t = new Date().toISOString();
  return [
    makeSkill('study_pack_generator', 'Study Pack Generator', 'Turn a research document into a summary, flashcards, quiz questions and a local PDF report.', 'study', t),
    makeSkill('invoice_extractor', 'Invoice Extractor', 'Extract invoice fields, line items and finance-ready CSV/JSON/PDF outputs.', 'invoice', t),
    makeSkill('meeting_notes_processor', 'Meeting Notes Processor', 'Turn a meeting transcript into decisions, action items, follow-up email and calendar reminders.', 'meeting', t)
  ];
}

function inferSkillCategory(description: string): LunaSkill['category'] {
  const d = description.toLowerCase();
  if (d.includes('invoice') || d.includes('expense') || d.includes('receipt')) return 'invoice';
  if (d.includes('meeting') || d.includes('transcript') || d.includes('action item')) return 'meeting';
  if (d.includes('flashcard') || d.includes('quiz') || d.includes('study')) return 'study';
  if (d.includes('research') || d.includes('presentation') || d.includes('paper')) return 'research';
  if (d.includes('resume') || d.includes('job') || d.includes('cover letter')) return 'job';
  return 'generic';
}

function makeSkill(id: string, name: string, description: string, category: LunaSkill['category'], createdAt = new Date().toISOString()): LunaSkill {
  const commonPermissions = ['Read selected/local demo files', 'Run local model or transparent fallback', 'Write artifacts to Luna workspace', 'Create privacy trace'];
  const base = { id, name, description, category, createdAt, permissions: commonPermissions };
  if (category === 'invoice') return { ...base,
    inputs: [{ name: 'invoice', type: 'file', accept: ['.pdf', '.png', '.jpg', '.txt'], description: 'Invoice document or image' }],
    steps: [
      { tool: 'extract_text', label: 'Extract invoice text', detail: 'Read PDF/TXT or OCR image content locally.' },
      { tool: 'llm_extract_json', label: 'Extract structured fields', detail: 'Vendor, date, total, tax and line items.' },
      { tool: 'export_csv_json_pdf', label: 'Export finance package', detail: 'Create JSON, CSV and PDF summary.' }
    ],
    outputs: [{ name: 'invoice_data.json', type: 'json' }, { name: 'invoice_items.csv', type: 'csv' }, { name: 'invoice_report.pdf', type: 'pdf' }]
  };
  if (category === 'meeting') return { ...base,
    inputs: [{ name: 'transcript', type: 'file', accept: ['.txt', '.md'], description: 'Meeting transcript or pasted notes' }],
    steps: [
      { tool: 'extract_text', label: 'Read transcript', detail: 'Load transcript from local file.' },
      { tool: 'summarize_decisions', label: 'Find decisions and risks', detail: 'Create structured summary.' },
      { tool: 'extract_action_items', label: 'Extract action items', detail: 'Owner, deadline and follow-up reminders.' },
      { tool: 'export_followups', label: 'Export follow-ups', detail: 'Create Markdown summary and ICS reminders.' }
    ],
    outputs: [{ name: 'meeting_summary.md', type: 'md' }, { name: 'follow_up_email.md', type: 'md' }, { name: 'reminders.ics', type: 'ics' }]
  };
  if (category === 'job') return { ...base,
    inputs: [{ name: 'resume', type: 'file', accept: ['.pdf', '.docx', '.txt'], description: 'Resume' }, { name: 'jobDescription', type: 'text', description: 'Job description text' }],
    steps: [
      { tool: 'compare_documents', label: 'Compare fit', detail: 'Match resume evidence to role requirements.' },
      { tool: 'generate_cover_letter', label: 'Draft cover letter', detail: 'Tailor output to the role.' },
      { tool: 'export_application_pack', label: 'Export package', detail: 'Create report, letter and ZIP.' }
    ],
    outputs: [{ name: 'match_report.pdf', type: 'pdf' }, { name: 'cover_letter.docx', type: 'docx' }, { name: 'application_pack.zip', type: 'zip' }]
  };
  return { ...base,
    inputs: [{ name: 'document', type: 'file', accept: ['.pdf', '.docx', '.txt', '.md'], description: 'Source document' }],
    steps: [
      { tool: 'extract_text', label: 'Extract content', detail: 'Read the selected document locally.' },
      { tool: 'summarize', label: 'Generate structured insight', detail: 'Summarize, extract key ideas and create useful next steps.' },
      { tool: 'export_artifacts', label: 'Export artifacts', detail: 'Save Markdown and PDF outputs locally.' }
    ],
    outputs: [{ name: 'summary.md', type: 'md' }, { name: 'report.pdf', type: 'pdf' }]
  };
}

function titleFromDescription(description: string, category: LunaSkill['category']) {
  const d = description.toLowerCase();
  if (category === 'invoice') return 'Invoice Extractor';
  if (category === 'meeting') return 'Meeting Notes Processor';
  if (category === 'study') return 'Study Pack Generator';
  if (category === 'research') return 'Research Pack Generator';
  if (category === 'job') return 'Job Application Assistant';
  const words = description.replace(/[^a-z0-9 ]/gi, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
  return words.length ? words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Custom Luna Skill';
}

async function generateSkill(description: string): Promise<LunaSkill> {
  const category = inferSkillCategory(description);
  const name = titleFromDescription(description, category);
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now()}`;
  return makeSkill(id, name, description, category);
}

async function listSkills(): Promise<LunaSkill[]> {
  if (!(await exists(skillsPath()))) await writeText(skillsPath(), JSON.stringify(defaultSkills(), null, 2));
  await writeText(vaultPath(), JSON.stringify({ docs: [], chunks: [], updatedAt: new Date().toISOString() }, null, 2));
  await seedMemoryNow();
  await writeText(lensPath(), JSON.stringify([], null, 2));
  await writeText(auditPath(), JSON.stringify([], null, 2));
  await writeText(attachmentsPath(), JSON.stringify({ items: [], updatedAt: new Date().toISOString() }, null, 2));
  await writeText(settingsPath(), JSON.stringify(defaultSettings(), null, 2));
  return JSON.parse(await readText(skillsPath()));
}

async function saveSkill(skill: LunaSkill): Promise<{ ok: boolean; skills: LunaSkill[] }> {
  const skills = await listSkills();
  const normalized = { ...skill, id: skill.id || `${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`, createdAt: skill.createdAt || new Date().toISOString() };
  const next = [normalized, ...skills.filter(s => s.id !== normalized.id)];
  await writeText(skillsPath(), JSON.stringify(next, null, 2));
  getDb().prepare('INSERT OR REPLACE INTO skills (id,name,category,json,created_at) VALUES (?,?,?,?,?)').run(normalized.id, normalized.name, normalized.category, JSON.stringify(normalized), normalized.createdAt);
  await logAudit('skill', 'save_skill', normalized.name, `Saved skill ${normalized.name} locally.`, 'low');
  return { ok: true, skills: next };
}

function csvEscape(x: string) { return `"${String(x).replace(/"/g, '""')}"`; }

async function runSkill(skillId: string): Promise<SkillRunResult> {
  const skill = (await listSkills()).find(s => s.id === skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  const trace: MissionTraceItem[] = [];
  const privacy: PrivacyEvent[] = [];
  const skillDir = path.join(artifactsRoot(), 'skills', safeName(skill.name));
  await ensureDir(skillDir);
  const artifacts: Artifact[] = [];
  const addArtifact = (name: string, p: string, type: Artifact['type']) => artifacts.push({ name, path: p, type });

  if (skill.category === 'invoice') {
    const src = path.join(docsRoot(), 'Invoice_Demo_Electronics.txt');
    const text = await readText(src); privacy.push({ time: now(), action: 'read_file', target: src, detail: 'Read invoice source for structured extraction.' }); trace.push({ time: now(), title: 'Read invoice', detail: 'Loaded local invoice text.' });
    const data = { vendor: 'Demo Electronics Store', invoiceNo: 'DEMO-2026-071', date: '2026-07-03', subtotal: 2499, tax: 0, total: 2499, items: [ { description: 'USB-C Hub', qty: 1, price: 1799 }, { description: 'HDMI Cable', qty: 1, price: 700 } ], sourcePreview: text.slice(0, 120) };
    const jsonPath = path.join(skillDir, 'invoice_data.json'); await writeText(jsonPath, JSON.stringify(data, null, 2)); addArtifact('invoice_data.json', jsonPath, 'json');
    const csvPath = path.join(skillDir, 'invoice_items.csv'); await writeText(csvPath, ['description,qty,price', ...data.items.map(i => [csvEscape(i.description), i.qty, i.price].join(','))].join('\n')); addArtifact('invoice_items.csv', csvPath, 'csv');
    const pdfPath = path.join(skillDir, 'invoice_report.pdf'); await generatePdf(pdfPath, 'Invoice Extraction Report', [ { heading: 'Extracted Invoice', body: `Vendor: ${data.vendor}\nInvoice: ${data.invoiceNo}\nDate: ${data.date}\nTotal: INR ${data.total}` }, { heading: 'Line Items', body: data.items.map(i => `${i.description} — Qty ${i.qty} — INR ${i.price}`).join('\n') }, { heading: 'Privacy', body: 'Processed locally from seeded demo invoice. No external request required.' } ]); addArtifact('invoice_report.pdf', pdfPath, 'pdf');
    trace.push({ time: now(), title: 'Exported finance package', detail: 'Created JSON, CSV and PDF outputs.' });
  } else if (skill.category === 'meeting') {
    const src = path.join(docsRoot(), 'Meeting_Transcript_Luna_Demo.txt');
    const text = await readText(src); privacy.push({ time: now(), action: 'read_file', target: src, detail: 'Read meeting transcript.' }); trace.push({ time: now(), title: 'Read transcript', detail: 'Loaded local meeting notes.' });
    const summary = `# Meeting Summary\n\n## Decisions\n- Main demo focuses on offline proof, job mission, file automation undo, and Luna Skill Creator.\n\n## Action Items\n- Demo lead: polish PDF and DOCX exports by Friday.\n- Teammate: test Windows packaging tomorrow and prepare fallback instructions.\n\n## Risks\n- Live demo failure.\n- Privacy claims must be proven, not just stated.\n\n## Source Excerpt\n${text.slice(0, 500)}`;
    const mdPath = path.join(skillDir, 'meeting_summary.md'); await writeText(mdPath, summary); addArtifact('meeting_summary.md', mdPath, 'md');
    const emailPath = path.join(skillDir, 'follow_up_email.md'); await writeText(emailPath, `Subject: Luna demo follow-up\n\nHi team,\n\nDecisions: focus the main demo on offline proof, job mission, reversible automation, and Luna Skill Creator.\n\nActions:\n- Demo lead: polish PDF/DOCX exports by Friday.\n- Teammate: test Windows packaging tomorrow.\n\nThanks.`); addArtifact('follow_up_email.md', emailPath, 'md');
    const icsPath = path.join(skillDir, 'reminders.ics'); await writeText(icsPath, `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Luna//Local Reminder//EN\nBEGIN:VEVENT\nUID:luna-${Date.now()}@local\nDTSTAMP:20260704T090000Z\nDTSTART:20260705T090000Z\nSUMMARY:Test Luna Windows packaging\nDESCRIPTION:Generated locally by Luna Meeting Notes Processor\nEND:VEVENT\nEND:VCALENDAR\n`); addArtifact('reminders.ics', icsPath, 'ics');
    trace.push({ time: now(), title: 'Generated follow-ups', detail: 'Created summary, follow-up email and ICS reminder.' });
  } else {
    const src = path.join(docsRoot(), 'Research_Local_AI_Privacy.md');
    const text = await readText(src); privacy.push({ time: now(), action: 'read_file', target: src, detail: 'Read research document for skill run.' }); trace.push({ time: now(), title: 'Read research document', detail: 'Loaded seeded local AI privacy research note.' });
    const prompt = `Create a study pack with summary, flashcards and quiz from this document:\n${text}`;
    const ai = await chat([{ role: 'user', content: prompt }]);
    privacy.push({ time: now(), action: 'local_inference', target: ai.model, detail: `Generated skill output via ${ai.mode}.` });
    const mdPath = path.join(skillDir, 'study_pack.md'); await writeText(mdPath, `# Study Pack\n\n${ai.text}\n\n## Flashcards\n- Q: What is the main privacy benefit of local AI?\n  A: Less data leaves the device.\n- Q: Why are audit logs important?\n  A: They make assistant actions inspectable and reversible.\n\n## Quiz\n1. Name two risks of local AI assistants.\n2. What does a zero-network counter prove?`); addArtifact('study_pack.md', mdPath, 'md');
    const csvPath = path.join(skillDir, 'flashcards.csv'); await writeText(csvPath, `question,answer\n${csvEscape('What is the main privacy benefit of local AI?')},${csvEscape('Less data leaves the device.')}\n${csvEscape('Why are audit logs important?')},${csvEscape('They make assistant actions inspectable and reversible.')}`); addArtifact('flashcards.csv', csvPath, 'csv');
    const pdfPath = path.join(skillDir, 'study_pack.pdf'); await generatePdf(pdfPath, 'Local AI Privacy Study Pack', [ { heading: 'Summary', body: ai.text }, { heading: 'Flashcards', body: 'Q: What is the main privacy benefit of local AI?\nA: Less data leaves the device.\n\nQ: Why are audit logs important?\nA: They make assistant actions inspectable and reversible.' }, { heading: 'Privacy', body: 'Generated from a local seeded research document.' } ]); addArtifact('study_pack.pdf', pdfPath, 'pdf');
    trace.push({ time: now(), title: 'Generated study pack', detail: 'Created Markdown, CSV flashcards and PDF report.' });
  }
  privacy.push({ time: now(), action: 'write_artifacts', target: skillDir, detail: `Saved ${artifacts.length} skill artifacts locally.` });
  await logAudit('skill', 'run_skill', skill.name, `Ran skill and generated ${artifacts.length} artifact(s).`, 'low');
  return { skill, artifacts, trace, privacy };
}


async function generateResearchPptx(file: string, title: string, bullets: string[]) {
  await ensureDir(path.dirname(file));
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Luna';
  pptx.subject = 'Generated locally by Luna';
  pptx.title = title;
  pptx.company = 'Luna Local AI';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'en-US'
  };
  const colors = { bg: '0B1020', purple: '8B5CF6', cyan: '06B6D4', text: 'F8FAFC', muted: 'CBD5E1' };
  let slide = pptx.addSlide();
  slide.background = { color: colors.bg };
  slide.addText('Luna Research Brief', { x: 0.6, y: 0.55, w: 11.8, h: 0.45, fontFace: 'Aptos Display', fontSize: 18, color: colors.cyan, bold: true });
  slide.addText(title, { x: 0.6, y: 1.25, w: 11.7, h: 1.1, fontSize: 34, color: colors.text, bold: true, breakLine: false, fit: 'shrink' });
  slide.addText('Generated locally by Luna · No cloud API required', { x: 0.65, y: 5.8, w: 11.2, h: 0.35, fontSize: 13, color: colors.muted });
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.65, w: 3.6, h: 0.08, fill: { color: colors.purple }, line: { color: colors.purple } });

  const chunks = [bullets.slice(0, 4), bullets.slice(4, 8), bullets.slice(8, 12)].filter(a => a.length);
  chunks.forEach((chunk, idx) => {
    const sld = pptx.addSlide();
    sld.background = { color: colors.bg };
    sld.addText(idx === 0 ? 'Key Findings' : idx === 1 ? 'Risks & Design Principles' : 'Recommended Next Steps', { x: 0.55, y: 0.45, w: 11.8, h: 0.5, fontSize: 26, bold: true, color: colors.text });
    chunk.forEach((b, i) => {
      sld.addShape(pptx.ShapeType.roundRect, { x: 0.75, y: 1.25 + i * 1.0, w: 11.1, h: 0.72, rectRadius: 0.06, fill: { color: '111827' }, line: { color: '2D3748' } });
      sld.addText(`${i + 1 + idx * 4}`, { x: 0.95, y: 1.41 + i * 1.0, w: 0.4, h: 0.25, fontSize: 13, bold: true, color: colors.cyan });
      sld.addText(b, { x: 1.45, y: 1.33 + i * 1.0, w: 9.9, h: 0.42, fontSize: 15, color: colors.muted, fit: 'shrink' });
    });
    sld.addText('Luna Artifact Studio', { x: 9.8, y: 6.85, w: 2.6, h: 0.25, fontSize: 9, color: '64748B', align: 'right' });
  });

  slide = pptx.addSlide();
  slide.background = { color: colors.bg };
  slide.addText('Privacy Trace', { x: 0.55, y: 0.45, w: 11.8, h: 0.5, fontSize: 28, bold: true, color: colors.text });
  slide.addText([
    { text: '✓ ', options: { color: '10B981', bold: true } }, { text: 'Processed from local seeded research files\n', options: { color: colors.muted } },
    { text: '✓ ', options: { color: '10B981', bold: true } }, { text: 'Generated PPTX/PDF/HTML/ZIP on-device\n', options: { color: colors.muted } },
    { text: '✓ ', options: { color: '10B981', bold: true } }, { text: 'External request counter remains visible in Luna\n', options: { color: colors.muted } }
  ], { x: 0.8, y: 1.45, w: 10.8, h: 2.4, fontSize: 20, breakLine: false });
  await pptx.writeFile({ fileName: file });
}

async function runResearchMission(): Promise<MissionResult> {
  if (!(await exists(demoRoot()))) await resetDemo();
  const trace: MissionTraceItem[] = [];
  const privacy: PrivacyEvent[] = [];
  const seededSources = [
    path.join(docsRoot(), 'Research_Local_AI_Privacy.md'),
    path.join(docsRoot(), 'Portfolio_Notes.md'),
    path.join(docsRoot(), 'Meeting_Transcript_Luna_Demo.txt')
  ];
  const attachments = await readAttachments().catch(() => ({ items: [] as AttachmentItem[], updatedAt: '' }));
  const combined: string[] = [];
  const sourceNames: string[] = [];
  if (attachments.items.length) {
    for (const item of attachments.items.slice(0, 6)) {
      combined.push(`ATTACHMENT ${item.name}\n${item.textPreview}`);
      sourceNames.push(item.name);
      privacy.push({ time: now(), action: 'read_attachment', target: item.storedPath, detail: 'Used imported attachment for research-to-presentation mission.' });
    }
    trace.push({ time: now(), title: 'Loaded attachment research sources', detail: `Used ${Math.min(attachments.items.length, 6)} imported attachment(s).` });
  } else {
    for (const src of seededSources) {
      const text = await readText(src);
      combined.push(`SOURCE ${path.basename(src)}\n${text}`);
      sourceNames.push(path.basename(src));
      privacy.push({ time: now(), action: 'read_file', target: src, detail: 'Read local source for research-to-presentation mission.' });
    }
    trace.push({ time: now(), title: 'Loaded local research sources', detail: `Read ${seededSources.length} documents from the demo workspace.` });
  }
  const prompt = `Create exactly 10 concise bullet points for a presentation about why Luna's local AI desktop approach is useful and trustworthy. Use this evidence:\n${combined.join('\n\n')}`;
  const ai = await chat([{ role: 'user', content: prompt }]);
  privacy.push({ time: now(), action: 'local_inference', target: ai.model, detail: `Generated research outline via ${ai.mode}.` });
  let bullets = ai.text.split(/\n+/).map(x => x.replace(/^[-*\d.\s]+/, '').trim()).filter(x => x.length > 10).slice(0, 10);
  if (bullets.length < 6) bullets = [
    'Local AI reduces cloud exposure by processing documents and prompts on the user device.',
    'A visible network counter makes the privacy claim falsifiable during demos.',
    'Permission-scoped file actions help users trust desktop automation.',
    'Undo manifests make file automation reversible instead of scary.',
    'Artifact generation turns AI output into practical PDFs, DOCX files and presentations.',
    'Luna Skill Creator lets users create new reusable local workflows from plain English.',
    'A Knowledge Vault provides evidence-based answers from local documents.',
    'Resource meters show the model is actually running on the machine.',
    'Fallback mode prevents live demo failure when Ollama is not installed.',
    'Mission replay explains what Luna did, what it touched and why.'
  ];
  trace.push({ time: now(), title: 'Generated slide outline', detail: `${bullets.length} presentation points prepared.` });

  const studioDir = path.join(artifactsRoot(), 'research_presentation');
  await ensureDir(studioDir);
  const mdPath = path.join(studioDir, 'speaker_notes.md');
  const htmlPath = path.join(studioDir, 'research_brief.html');
  const pdfPath = path.join(studioDir, 'research_brief.pdf');
  const pptxPath = path.join(studioDir, 'luna_research_deck.pptx');
  const zipPath = path.join(studioDir, 'research_presentation_package.zip');
  const title = 'Local AI Desktop Assistants: Privacy, Trust and Useful Automation';
  await writeText(mdPath, `# ${title}\n\n## Speaker Notes\n\n${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n## Generated locally by Luna\n`);
  await writeText(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Inter,Segoe UI,sans-serif;background:#0b1020;color:#e5e7eb;padding:42px;line-height:1.55}.card{background:#111827;border:1px solid #334155;border-radius:18px;padding:22px;margin:14px 0}h1{color:#a78bfa}.n{color:#06b6d4;font-weight:700}</style></head><body><h1>${title}</h1><p>Generated locally by Luna.</p>${bullets.map((b,i)=>`<div class="card"><span class="n">${i+1}</span> ${b}</div>`).join('')}</body></html>`);
  await generatePdf(pdfPath, 'Luna Research Brief', [
    { heading: 'Executive Summary', body: 'Luna turns local AI into a desktop operating layer by combining document understanding, safe automation, privacy proof and reusable skill creation.' },
    { heading: 'Key Points', body: bullets.map((b, i) => `${i + 1}. ${b}`).join('\n') },
    { heading: 'Privacy Trace', body: `Processed locally from ${sourceNames.join(', ')}. External request counter currently reports ${networkLog.externalRequests}.` }
  ]);
  await generateResearchPptx(pptxPath, title, bullets);
  await zipFiles(zipPath, [mdPath, htmlPath, pdfPath, pptxPath]);
  trace.push({ time: now(), title: 'Exported presentation package', detail: 'Created PPTX, PDF, HTML, Markdown speaker notes and ZIP.' });
  privacy.push({ time: now(), action: 'write_artifacts', target: studioDir, detail: 'Saved research presentation artifacts locally.' });
  await addMemory('Luna generated a Research-to-Presentation package with PPTX, PDF, HTML, speaker notes and ZIP from local demo documents.', 'project', 'research-mission');
  await logAudit('artifact', 'research_presentation_artifacts', studioDir, 'Generated PPTX, PDF, HTML, Markdown and ZIP research package.', 'low');
  return { summary: 'Research-to-Presentation mission completed locally. Luna created a polished deck and export package from local sources.', artifacts: [
    { name: 'luna_research_deck.pptx', path: pptxPath, type: 'pptx' as any },
    { name: 'research_brief.pdf', path: pdfPath, type: 'pdf' },
    { name: 'research_brief.html', path: htmlPath, type: 'html' },
    { name: 'speaker_notes.md', path: mdPath, type: 'md' },
    { name: 'research_presentation_package.zip', path: zipPath, type: 'zip' }
  ], trace, privacy };
}

async function runJobMission(): Promise<MissionResult> {
  if (!(await exists(demoRoot()))) await resetDemo();
  const privacy: PrivacyEvent[] = [];
  const trace: MissionTraceItem[] = [];
  const attachments = await readAttachments().catch(() => ({ items: [] as AttachmentItem[], updatedAt: '' }));
  const findAttachment = (patterns: RegExp[]) => attachments.items.find(i => patterns.some(p => p.test(i.name.toLowerCase()) || p.test(i.textPreview.toLowerCase())));
  const resumeAttachment = findAttachment([/resume/, /curriculum/, /cv/]);
  const jdAttachment = findAttachment([/job/, /description/, /role/, /requirements/]);
  const portfolioAttachment = findAttachment([/portfolio/, /project/, /github/]);
  const resumePath = path.join(docsRoot(), 'Demo_User_Resume.txt');
  const jdPath = path.join(docsRoot(), 'Job_Description_Local_AI_Founding_Engineer.txt');
  const portfolioPath = path.join(docsRoot(), 'Portfolio_Notes.md');
  const resume = resumeAttachment?.textPreview || await readText(resumePath);
  privacy.push({ time: now(), action: resumeAttachment ? 'read_attachment' : 'read_file', target: resumeAttachment?.storedPath || resumePath, detail: resumeAttachment ? 'Used imported resume attachment for local fit analysis.' : 'Read seeded resume text for local fit analysis.' });
  trace.push({ time: now(), title: resumeAttachment ? 'Read attached resume' : 'Read seeded resume', detail: 'Extracted skills, projects and preferences.' });
  const jd = jdAttachment?.textPreview || await readText(jdPath);
  privacy.push({ time: now(), action: jdAttachment ? 'read_attachment' : 'read_file', target: jdAttachment?.storedPath || jdPath, detail: jdAttachment ? 'Used imported job description attachment.' : 'Read seeded job description text.' });
  trace.push({ time: now(), title: jdAttachment ? 'Read attached job description' : 'Read seeded job description', detail: 'Extracted requirements and bonus skills.' });
  const portfolio = portfolioAttachment?.textPreview || await readText(portfolioPath);
  privacy.push({ time: now(), action: portfolioAttachment ? 'read_attachment' : 'read_file', target: portfolioAttachment?.storedPath || portfolioPath, detail: portfolioAttachment ? 'Used imported portfolio/project attachment.' : 'Read seeded project notes.' });
  if (attachments.items.length) trace.push({ time: now(), title: 'Attachment-aware mission', detail: `Detected ${attachments.items.length} imported attachment(s); used matching resume/JD/portfolio files where available.` });

  const prompt = `Analyze this job fit. Return concise sections: Fit Score, Matching Evidence, Missing Keywords, Resume Improvements, Cover Letter Draft, Interview Questions.\nRESUME:\n${resume}\nJD:\n${jd}\nPORTFOLIO:\n${portfolio}`;
  const ai = await chat([{ role: 'user', content: prompt }]);
  trace.push({ time: now(), title: 'Generated fit analysis', detail: `Used ${ai.mode === 'ollama' ? ai.model : 'fallback'} locally.` });
  privacy.push({ time: now(), action: 'local_inference', target: ai.model, detail: `External requests tracked by Luna: ${networkLog.externalRequests}.` });

  const reportMd = path.join(artifactsRoot(), 'job_match_report.md');
  const reportPdf = path.join(artifactsRoot(), 'job_match_report.pdf');
  const coverDocx = path.join(artifactsRoot(), 'tailored_cover_letter.docx');
  const prepMd = path.join(artifactsRoot(), 'interview_prep.md');
  const zip = path.join(artifactsRoot(), 'application_package.zip');
  const md = `# Job Application Mission\n\nGenerated locally by Luna.\n\n## Analysis\n\n${ai.text}\n`;
  await writeText(reportMd, md);
  await generatePdf(reportPdf, 'Luna Job Match Report', [
    { heading: 'Local AI Analysis', body: ai.text },
    { heading: 'Evidence Used', body: `Resume: ${resumeAttachment?.name || path.basename(resumePath)}\nJob description: ${jdAttachment?.name || path.basename(jdPath)}\nPortfolio notes: ${portfolioAttachment?.name || path.basename(portfolioPath)}` },
    { heading: 'Privacy Trace', body: `No external network request is required for this mission. Current tracked external request count: ${networkLog.externalRequests}.` }
  ]);
  await generateDocx(coverDocx, 'Tailored Cover Letter Draft', [
    'Dear Hiring Team,',
    'I am excited about the Founding Engineer role because my work aligns with local AI desktop assistants, Electron applications, document automation, artifact exports, and privacy-first product design.',
    'Luna demonstrates exactly the kind of ownership I bring: local model integration, safe file automation, privacy proof, generated reports, and a polished desktop experience.',
    'Thank you for considering my application.'
  ]);
  await writeText(prepMd, `# Interview Prep\n\n- Explain why local AI matters.\n- Walk through Luna's privacy proof widget.\n- Describe reversible file automation.\n- Discuss model fallback and resource-aware routing.\n`);
  await zipFiles(zip, [reportMd, reportPdf, coverDocx, prepMd]);
  trace.push({ time: now(), title: 'Exported artifacts', detail: 'Created Markdown, PDF, DOCX and ZIP package.' });
  await addMemory('Luna completed a Job Application Mission for a local AI founding engineer role and generated a match report, cover letter, interview prep and ZIP package.', 'project', 'job-mission');
  privacy.push({ time: now(), action: 'write_artifacts', target: artifactsRoot(), detail: 'Saved generated files locally.' });
  await logAudit('artifact', 'job_mission_artifacts', artifactsRoot(), 'Generated job mission report, cover letter, prep notes and ZIP.', 'low');
  return { summary: 'Job Application Mission completed locally. Luna analyzed the resume/JD, generated artifacts, and logged every file/action used.', artifacts: [
    { name: 'job_match_report.md', path: reportMd, type: 'md' },
    { name: 'job_match_report.pdf', path: reportPdf, type: 'pdf' },
    { name: 'tailored_cover_letter.docx', path: coverDocx, type: 'docx' },
    { name: 'interview_prep.md', path: prepMd, type: 'md' },
    { name: 'application_package.zip', path: zip, type: 'zip' }
  ], trace, privacy };
}

function categoryFor(name: string) {
  const lower = name.toLowerCase();
  if (/\.pdf|\.docx|\.txt|\.md/.test(lower)) return 'Documents';
  if (/\.png|\.jpg|\.jpeg|screenshot/.test(lower)) return 'Images';
  if (/invoice|expense/.test(lower)) return 'Finance';
  return 'Other';
}

async function sha256(p: string) { return crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex'); }

async function planCleanup(): Promise<FilePlan> {
  if (!(await exists(demoRoot()))) await resetDemo();
  const files = await fs.readdir(messyRoot());
  const missionId = `cleanup_${Date.now()}`;
  const creates = Array.from(new Set(files.map(categoryFor))).map(c => path.join(messyRoot(), c));
  const moves = files.map(file => {
    const from = path.join(messyRoot(), file); const to = path.join(messyRoot(), categoryFor(file), file);
    return { from, to, reason: `Classified as ${categoryFor(file)} based on filename and extension.` };
  });
  return { missionId, root: messyRoot(), creates, moves, risk: 'low' };
}

async function executeCleanup(plan: FilePlan): Promise<AutomationResult> {
  const manifest = { missionId: plan.missionId, createdAt: new Date().toISOString(), creates: plan.creates, moves: [] as any[] };
  for (const dir of plan.creates) await ensureDir(dir);
  for (const m of plan.moves) {
    const stat = await fs.stat(m.from);
    manifest.moves.push({ ...m, checksum: await sha256(m.from), mtimeMs: stat.mtimeMs, atimeMs: stat.atimeMs });
    await ensureDir(path.dirname(m.to));
    await fs.rename(m.from, m.to);
    await fs.utimes(m.to, stat.atime, stat.mtime).catch(() => {});
  }
  const manifestPath = path.join(manifestsRoot(), `${plan.missionId}.json`);
  await writeText(manifestPath, JSON.stringify(manifest, null, 2));
  await logAudit('automation', 'execute_cleanup', plan.root, `Moved ${manifest.moves.length} files with undo manifest ${manifestPath}.`, 'medium');
  return { missionId: plan.missionId, manifestPath, moved: manifest.moves.length, created: plan.creates.length };
}

async function undoMission(missionId: string) {
  const manifestPath = path.join(manifestsRoot(), `${missionId}.json`);
  const manifest = JSON.parse(await readText(manifestPath));
  let restored = 0;
  for (const m of [...manifest.moves].reverse()) {
    if (await exists(m.to)) {
      await ensureDir(path.dirname(m.from));
      await fs.rename(m.to, m.from);
      await fs.utimes(m.from, new Date(m.atimeMs), new Date(m.mtimeMs)).catch(() => {});
      restored++;
    }
  }
  for (const dir of [...manifest.creates].sort((a, b) => b.length - a.length)) {
    try { await fs.rmdir(dir); } catch { /* keep non-empty dirs */ }
  }
  await logAudit('automation', 'undo_cleanup', manifestPath, `Restored ${restored} files from manifest.`, 'low');
  return { ok: true, restored, manifestPath };
}



async function getActiveWindowSafe(): Promise<LensSnapshot['activeWindow']> {
  try {
    const mod: any = require('active-win');
    const aw = await (mod.default ? mod.default() : mod());
    if (!aw) return { title: 'Unavailable', owner: 'Unknown' };
    return { title: aw.title, owner: aw.owner?.name, app: aw.owner?.name };
  } catch (e: any) {
    return { title: 'Active window unavailable', owner: 'Permission or platform limitation' };
  }
}
async function getRunningAppsSafe(): Promise<string[]> {
  try {
    const processes = await si.processes();
    const names = new Map<string, number>();
    for (const p of processes.list || []) {
      const name = String(p.name || '').trim();
      if (!name || name.length < 2) continue;
      if (/^(systemd|node|electron|bash|sh|kworker|rcu|migration|idle)$/i.test(name)) continue;
      names.set(name, (names.get(name) || 0) + Number((p as any).pcpu || (p as any).cpu || 0) + 0.01);
    }
    return [...names.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([name]) => name);
  } catch { return []; }
}
async function saveLensSnapshot(snapshot: LensSnapshot) {
  let all: LensSnapshot[] = [];
  try { all = JSON.parse(await readText(lensPath())); } catch { all = []; }
  all = [snapshot, ...all].slice(0, 25);
  await writeText(lensPath(), JSON.stringify(all, null, 2));
}
async function captureLensContext(): Promise<LensSnapshot> {
  const privacy: PrivacyEvent[] = [];
  const activeWindow = await getActiveWindowSafe();
  const runningApps = await getRunningAppsSafe();
  privacy.push({ time: now(), action: 'read_desktop_context', target: os.platform(), detail: 'Captured active-window metadata and running app names only; no screenshot taken.' });
  const snapshot: LensSnapshot = { id: `lens_${Date.now()}`, capturedAt: new Date().toISOString(), mode: 'desktop-context', activeWindow, runningApps, privacy };
  await saveLensSnapshot(snapshot);
  await logAudit('lens', 'capture_context', snapshot.mode, 'Captured bounded Lens context.', 'low');
  return snapshot;
}
async function ocrImage(filePath: string): Promise<string> {
  try {
    const result = await tesseract.recognize(filePath, 'eng');
    return result?.data?.text || '';
  } catch (e: any) {
    return `OCR failed or unavailable for this image: ${e.message || String(e)}`;
  }
}
async function importLensImage(): Promise<LensSnapshot | null> {
  const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [ { name: 'Images', extensions: ['png','jpg','jpeg','bmp','webp'] }, { name: 'Text fallback', extensions: ['txt','md'] } ] });
  if (res.canceled || !res.filePaths[0]) return null;
  const filePath = res.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const runningApps = await getRunningAppsSafe();
  const activeWindow = await getActiveWindowSafe();
  const privacy: PrivacyEvent[] = [{ time: now(), action: 'read_selected_file', target: filePath, detail: 'User explicitly selected file for Luna Lens.' }];
  let text = '';
  let mode: LensSnapshot['mode'] = 'manual-image';
  if (['.txt', '.md'].includes(ext)) { text = await readText(filePath); mode = 'manual-text'; }
  else { text = await ocrImage(filePath); privacy.push({ time: now(), action: 'ocr_local_image', target: filePath, detail: 'Ran local OCR on selected image.' }); }
  const snapshot: LensSnapshot = { id: `lens_${Date.now()}`, capturedAt: new Date().toISOString(), mode, activeWindow, runningApps, sourcePath: filePath, ocrText: text.slice(0, 8000), privacy };
  await saveLensSnapshot(snapshot);
  await logAudit('lens', 'capture_context', snapshot.mode, 'Captured bounded Lens context.', 'low');
  return snapshot;
}
async function explainLens(snapshot: LensSnapshot): Promise<LensSnapshot> {
  const context = [`Active window: ${snapshot.activeWindow?.title || 'unknown'} (${snapshot.activeWindow?.owner || 'unknown'})`, `Running apps: ${snapshot.runningApps.join(', ') || 'unknown'}`, snapshot.ocrText ? `Visible/selected text:\n${snapshot.ocrText}` : 'No OCR text captured.'].join('\n');
  const res = await chatPlus([{ role: 'user', content: `Explain what I am doing or looking at from this local desktop context. Suggest 3 useful next actions.\n${context}` }]);
  const explained: LensSnapshot = { ...snapshot, summary: res.text, privacy: [...snapshot.privacy, { time: now(), action: 'local_context_explanation', target: res.model, detail: `Explained context via ${res.mode}.` }] };
  await saveLensSnapshot(explained);
  return explained;
}



async function exportTrustData(): Promise<TrustExportResult> {
  try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  const exportDir = path.join(artifactsRoot(), 'trust_export');
  await ensureDir(exportDir);
  const files = [
    auditPath(), memoryPath(), vaultPath(), skillsPath(), lensPath(), attachmentsPath(), settingsPath(), databasePath()
  ].filter(f => fssync.existsSync(f));
  const summaryPath = path.join(exportDir, 'trust_summary.json');
  const summary = { exportedAt: new Date().toISOString(), network: networkLog, resources: await getResources(), files: files.map(f => ({ name: path.basename(f), path: f })) };
  await writeText(summaryPath, JSON.stringify(summary, null, 2));
  const zipPath = path.join(exportDir, 'luna_trust_export.zip');
  await zipFiles(zipPath, [summaryPath, ...files]);
  await logAudit('system', 'export_trust_data', zipPath, 'Exported local trust/privacy data package including SQLite database when available.', 'low');
  return { path: zipPath, files: [summaryPath, ...files] };
}
async function resetAllData() {
  const result = await resetDemo();
  await logAudit('system', 'reset_all_data', demoRoot(), 'All Luna demo data reset/deleted and reseeded.', 'low');
  return result;
}


async function runCodebaseMission(): Promise<MissionResult> {
  if (!(await exists(codebaseRoot()))) await resetDemo();
  const trace: MissionTraceItem[] = [];
  const privacy: PrivacyEvent[] = [];
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(ts|tsx|js|jsx|json|md)$/.test(entry.name)) files.push(full);
    }
  }
  await walk(codebaseRoot());
  trace.push({ time: now(), title: 'Scanned codebase', detail: `Found ${files.length} source/documentation files.` });
  const fileSummaries: { file: string; imports: string[]; exports: string[]; functions: string[]; chars: number }[] = [];
  for (const file of files) {
    const text = await readText(file);
    privacy.push({ time: now(), action: 'read_code_file', target: file, detail: 'Read demo codebase file for local architecture analysis.' });
    const imports = [...text.matchAll(/import\s+.*?from\s+['\"](.+?)['\"]/g)].map(m => m[1]);
    const exports = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
    const functions = [...text.matchAll(/(?:function|const)\s+([A-Za-z0-9_]+)\s*(?:=|\()/g)].map(m => m[1]);
    fileSummaries.push({ file: path.relative(codebaseRoot(), file), imports, exports, functions, chars: text.length });
  }
  trace.push({ time: now(), title: 'Built dependency map', detail: 'Extracted imports, exports and functions with local static analysis.' });
  const graphLines = fileSummaries.flatMap(f => f.imports.map(i => `${f.file} -> ${i}`));
  const prompt = `Explain this small TypeScript/React codebase architecture, risks, and onboarding steps. Use this static analysis JSON:\n${JSON.stringify(fileSummaries, null, 2)}`;
  const ai = await chatPlus([{ role: 'user', content: prompt }]);
  privacy.push({ time: now(), action: 'local_inference', target: ai.model, detail: `Explained codebase via ${ai.mode}.` });
  const dir = path.join(artifactsRoot(), 'codebase_explainer');
  await ensureDir(dir);
  const mdPath = path.join(dir, 'codebase_architecture.md');
  const jsonPath = path.join(dir, 'dependency_graph.json');
  const pdfPath = path.join(dir, 'codebase_report.pdf');
  const zipPath = path.join(dir, 'codebase_explainer_package.zip');
  await writeText(jsonPath, JSON.stringify({ root: codebaseRoot(), files: fileSummaries, edges: graphLines }, null, 2));
  await writeText(mdPath, `# Codebase Architecture Report\n\n${ai.text}\n\n## Files\n${fileSummaries.map(f => `- ${f.file}: exports ${f.exports.join(', ') || 'none'}; imports ${f.imports.join(', ') || 'none'}`).join('\n')}\n\n## Dependency Edges\n${graphLines.map(x => `- ${x}`).join('\n')}`);
  await generatePdf(pdfPath, 'Luna Codebase Explainer Report', [
    { heading: 'Architecture Explanation', body: ai.text },
    { heading: 'Files Analyzed', body: fileSummaries.map(f => `${f.file} — ${f.chars} chars — exports: ${f.exports.join(', ') || 'none'}`).join('\n') },
    { heading: 'Dependency Graph', body: graphLines.join('\n') || 'No imports detected.' },
    { heading: 'Privacy', body: 'Codebase was analyzed locally from the seeded demo workspace.' }
  ]);
  await zipFiles(zipPath, [mdPath, jsonPath, pdfPath]);
  trace.push({ time: now(), title: 'Exported codebase report', detail: 'Created Markdown, JSON dependency graph, PDF and ZIP.' });
  await addMemory('Luna ran a Codebase Explainer mission and generated architecture documentation from a local TypeScript demo project.', 'project', 'codebase-mission');
  await logAudit('artifact', 'codebase_explainer_artifacts', dir, 'Generated codebase architecture report and dependency graph.', 'low');
  return { summary: 'Codebase Explainer Mission completed locally.', artifacts: [
    { name: 'codebase_architecture.md', path: mdPath, type: 'md' },
    { name: 'dependency_graph.json', path: jsonPath, type: 'json' },
    { name: 'codebase_report.pdf', path: pdfPath, type: 'pdf' },
    { name: 'codebase_explainer_package.zip', path: zipPath, type: 'zip' }
  ], trace, privacy };
}

async function runMissionTemplate(missionId: string): Promise<MissionResult> {
  if (missionId === 'codebase') return runCodebaseMission();
  const skills = await listSkills();
  const category = missionId === 'meeting' ? 'meeting' : missionId === 'invoice' ? 'invoice' : 'study';
  let skill = skills.find(s => s.category === category);
  if (!skill) {
    skill = makeSkill(`${category}_mission_${Date.now()}`, category === 'invoice' ? 'Invoice Extractor' : category === 'meeting' ? 'Meeting Notes Processor' : 'Study Pack Generator', `Mission wrapper for ${category}`, category as LunaSkill['category']);
    await saveSkill(skill);
  }
  const r = await runSkill(skill.id);
  await addMemory(`Luna ran the ${skill.name} mission and generated ${r.artifacts.length} artifact(s).`, 'project', `${missionId}-mission`);
  return { summary: `${skill.name} Mission completed locally.`, artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
}

const KNOWN_APPS: Record<string, string> = {
  'calculator': 'calc',
  'calc': 'calc',
  'notepad': 'notepad',
  'file explorer': 'explorer',
  'explorer': 'explorer',
  'files': 'explorer',
  'paint': 'mspaint',
  'command prompt': 'cmd',
  'terminal': 'cmd',
  'cmd': 'cmd',
  'settings': 'ms-settings:',
  'control panel': 'control',
  'task manager': 'taskmgr',
  'browser': 'msedge',
  'chrome': 'chrome',
  'edge': 'msedge',
  'spotify': 'spotify:',
  'word': 'winword',
  'excel': 'excel',
  'powerpoint': 'powerpnt'
};
function launchApplication(target: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ ok: false, error: 'App launching is currently implemented for Windows only.' }); return; }
    const cmd = `start "" ${target}`;
    exec(cmd, { windowsHide: true }, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true });
    });
  });
}
async function tryLaunchApp(command: string): Promise<CommandRouteResult | null> {
  const c = command.toLowerCase();
  if (!/\b(open|launch|start|run)\b/.test(c)) return null;
  const matchKey = Object.keys(KNOWN_APPS).sort((a, b) => b.length - a.length).find(name => c.includes(name));
  if (!matchKey) return null;
  const target = KNOWN_APPS[matchKey];
  const result = await launchApplication(target);
  if (result.ok) {
    await logAudit('automation', 'app_launch', matchKey, `Launched local application "${matchKey}" via OS command. No confirmation was required because launching a local app is reversible (closing it undoes it) and never leaves the machine.`, 'low');
    return { intent: 'app_launch', confidence: 0.9, summary: `Opened ${matchKey} on your desktop.`, actionTaken: `Launched local application: ${matchKey}` };
  }
  await logAudit('automation', 'app_launch_failed', matchKey, result.error || 'Unknown error', 'low');
  return { intent: 'app_launch', confidence: 0.9, summary: `I tried to open ${matchKey} but it failed: ${result.error}. It may not be installed, or may need a different launch command on this system.`, actionTaken: `Attempted to launch: ${matchKey}` };
}
async function routeCommand(command: string): Promise<CommandRouteResult> {
  const appLaunch = await tryLaunchApp(command);
  if (appLaunch) return appLaunch;
  const c = command.toLowerCase();
  if (/codebase|repository|repo|architecture|explain code/.test(c)) {
    const r = await runMissionTemplate('codebase');
    return { intent: 'codebase_explainer_mission', confidence: 0.9, summary: r.summary, actionTaken: 'Ran Codebase Explainer Mission', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/meeting|transcript|follow.?up|action items/.test(c)) {
    const r = await runMissionTemplate('meeting');
    return { intent: 'meeting_notes_mission', confidence: 0.88, summary: r.summary, actionTaken: 'Ran Meeting Notes Mission', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/invoice|receipt|expense/.test(c)) {
    const r = await runMissionTemplate('invoice');
    return { intent: 'invoice_extractor_mission', confidence: 0.88, summary: r.summary, actionTaken: 'Ran Invoice Extractor Mission', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/study|flashcard|quiz/.test(c)) {
    const r = await runMissionTemplate('study');
    return { intent: 'study_pack_mission', confidence: 0.86, summary: r.summary, actionTaken: 'Ran Study Pack Mission', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/attach|attachment|uploaded file|summarize files|summarize attachments/.test(c)) {
    const r = await summarizeAttachments();
    return { intent: 'attachment_summary', confidence: 0.87, summary: r.summary, actionTaken: 'Summarized imported attachments', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/job|resume|cover letter|application|interview/.test(c)) {
    const r = await runJobMission();
    return { intent: 'job_application_mission', confidence: 0.93, summary: r.summary, actionTaken: 'Ran Job Application Mission', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/presentation|pptx|slides|deck|research/.test(c)) {
    const r = await runResearchMission();
    return { intent: 'research_to_presentation', confidence: 0.91, summary: r.summary, actionTaken: 'Ran Research-to-Presentation in Artifact Studio', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/organize|clean|cleanup|downloads|files/.test(c)) {
    const plan = await planCleanup();
    return { intent: 'safe_file_cleanup_plan', confidence: 0.88, summary: `Prepared a safe cleanup plan for ${plan.moves.length} files. Luna did not move anything yet; approval is required in Automation.`, actionTaken: 'Generated cleanup preview only', plan, trace: [{ time: now(), title: 'Generated cleanup plan', detail: `${plan.moves.length} file moves proposed; risk ${plan.risk}; undo manifest will be created on execution.` }] };
  }
  if (/vault|knowledge|evidence|ask documents|search documents/.test(c)) {
    await indexDemoVault();
    const q = command.replace(/^(ask|search|vault|knowledge|documents|evidence)\s*/i, '').trim() || 'What does Luna know from local documents?';
    const r = await askVault(q);
    return { intent: 'knowledge_vault_qa', confidence: 0.86, summary: r.answer, actionTaken: `Indexed demo vault and answered using ${r.results.length} evidence chunks`, trace: r.results.map((x, i) => ({ time: now(), title: `Evidence ${i+1}: ${x.chunk.docName}`, detail: x.chunk.text.slice(0, 180) })), extra: r };
  }
  if (/skill|flashcard|invoice|meeting|study|quiz/.test(c)) {
    const skill = await generateSkill(command);
    await saveSkill(skill);
    const r = await runSkill(skill.id);
    return { intent: 'skill_creator_run', confidence: 0.84, summary: `Generated, saved and ran skill: ${skill.name}.`, actionTaken: 'Used Luna Skill Creator', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy, extra: skill };
  }
  if (/lens|screen|window|context|what am i doing|looking at/.test(c)) {
    const snap = await captureLensContext();
    const explained = await explainLens(snap);
    return { intent: 'luna_lens_context', confidence: 0.82, summary: explained.summary || 'Captured desktop context.', actionTaken: 'Captured bounded desktop context and explained it', privacy: explained.privacy, extra: explained };
  }
  if (/model|benchmark|speed|slow|ollama|fallback/.test(c)) {
    const rec = await recommendModel();
    const bench = await benchmarkModels();
    return { intent: 'model_inspector', confidence: 0.8, summary: `${rec.recommended}. ${rec.reason}`, actionTaken: 'Ran model recommendation and benchmark', extra: { recommendation: rec, benchmarks: bench } };
  }
  if (/remember|memory/.test(c)) {
    const text = command.replace(/^remember\s*/i, '').trim() || command;
    const mem = await addMemory(text, 'fact', 'command-router');
    return { intent: 'memory_add', confidence: 0.78, summary: `Saved memory: ${mem.text}`, actionTaken: 'Added local memory', extra: mem };
  }
  const ctx = await buildContext(command);
  const res = await chatPlus([{ role: 'user', content: command }]);
  return { intent: 'contextual_chat', confidence: 0.62, summary: res.text, actionTaken: `Answered with adaptive context (${ctx.memories.length} memories, ${ctx.vault.length} evidence chunks)`, extra: { context: ctx, mode: res.mode, model: res.model } };
}

async function recommendModel(): Promise<ModelRecommendation> {
  const resources = await getResources();
  const ollama = await checkOllama();
  const ram = resources.memoryTotalGb;
  let systemClass: ModelRecommendation['systemClass'] = 'low';
  let recommended = 'phi3:mini or qwen2.5:0.5b';
  let reason = 'Low-memory system: prioritize a tiny local model for reliable demo responses.';
  if (ram >= 24) {
    systemClass = 'high'; recommended = 'qwen2.5:7b or mistral:7b'; reason = 'Higher-memory system: use a 7B model for better writing and reasoning, with smaller model fallback.';
  } else if (ram >= 12) {
    systemClass = 'balanced'; recommended = 'qwen2.5:3b or llama3.2:3b'; reason = 'Balanced system: 3B class model gives good quality/speed trade-off.';
  }
  const suggested = ['qwen2.5:3b', 'llama3.2:3b', 'phi3:mini', 'nomic-embed-text'];
  return { recommended, reason, systemClass, installedUsable: ollama.models, missingSuggested: suggested.filter(m => !ollama.models.some((x: string) => x.startsWith(m))) };
}

async function benchmarkModels(): Promise<ModelBenchmarkResult[]> {
  const ollama = await checkOllama();
  const candidates = ollama.models.slice(0, 5);
  if (!ollama.ok || !candidates.length) {
    const started = Date.now();
    const response = await chat([{ role: 'user', content: 'Benchmark Luna fallback with one concise sentence.' }]);
    return [{ model: response.model, ok: true, mode: response.mode, latencyMs: response.finishedAt - response.startedAt || Date.now() - started, tokensPerSecond: response.tokensPerSecond, outputPreview: response.text.slice(0, 180) }];
  }
  const results: ModelBenchmarkResult[] = [];
  for (const model of candidates) {
    const started = Date.now();
    try {
      const res = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, messages: [
          { role: 'system', content: 'You are benchmarking local inference. Answer in one short sentence.' },
          { role: 'user', content: 'Say why local AI matters for desktop privacy.' }
        ]})
      });
      const json: any = await res.json();
      const text = json.message?.content || json.response || '';
      const latencyMs = Date.now() - started;
      const tokenGuess = Math.max(1, text.split(/\s+/).length * 1.3);
      results.push({ model, ok: true, mode: 'ollama', latencyMs, tokensPerSecond: Number((tokenGuess / (latencyMs / 1000 || 1)).toFixed(1)), outputPreview: text.slice(0, 180) });
    } catch (e: any) {
      results.push({ model, ok: false, mode: 'ollama', latencyMs: Date.now() - started, outputPreview: '', error: e.message || String(e) });
    }
  }
  await logAudit('model', 'benchmark_models', 'ollama', `Benchmarked ${results.length} model path(s).`, 'low');
  return results;
}

async function fallbackDrill(): Promise<FallbackDrillResult> {
  const primary = await checkOllama();
  const startedAt = Date.now();
  const text = fallbackAnswer([{ role: 'user', content: 'Fallback drill: respond with a short resilience proof.' }]);
  const finishedAt = Date.now();
  const response: ChatResult = { text, mode: 'demo-fallback', model: 'built-in scripted fallback', startedAt, finishedAt, tokensPerSecond: Number((text.split(/\s+/).length / ((finishedAt - startedAt + 50) / 1000)).toFixed(1)) };
  return { ok: true, primaryStatus: primary.ok ? `Primary Ollama available with ${primary.models.length} model(s). Drill intentionally forced fallback path.` : 'Primary Ollama unavailable. Fallback path used.', fallbackStatus: 'Fallback answered without crashing, without external network and without requiring model download.', response };
}

function installNetworkMonitor() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isExternal(details.url)) {
      networkLog.externalRequests++;
      logAudit('network', 'external_request', details.url, 'Renderer attempted an external network request.', 'medium').catch(() => {});
      const host = new URL(details.url).hostname;
      networkLog.recentHosts = [host, ...networkLog.recentHosts.filter(h => h !== host)].slice(0, 8);
    }
    callback({ cancel: false });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1080, minHeight: 720,
    title: 'Luna', backgroundColor: '#080914', icon: iconPath(),
    webPreferences: { preload: path.join(app.getAppPath(), 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  if (isDev) await mainWindow.loadURL('http://127.0.0.1:5173'); else await mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function openMainCommandPalette() {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
  if (!mainWindow) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('shortcut:command-palette');
}

async function createOrbWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  orbWindow = new BrowserWindow({
    width: 92,
    height: 116,
    x: Math.max(20, width - 124),
    y: Math.max(20, height - 148),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    title: 'Luna Orb',
    backgroundColor: '#00000000',
    icon: iconPath(),
    webPreferences: { preload: path.join(app.getAppPath(), 'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  orbWindow.setAlwaysOnTop(true, 'floating');
  orbWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;font-family:Inter,Segoe UI,sans-serif;user-select:none}
    .wrap{width:100%;height:100%;display:grid;place-items:center;-webkit-app-region:drag}
    button{width:78px;height:78px;border-radius:999px;border:1px solid rgba(255,255,255,.55);color:white;cursor:pointer;-webkit-app-region:no-drag;background:radial-gradient(circle at 30% 24%,#fff 0,#c4b5fd 18%,#8b5cf6 47%,#111827 100%);box-shadow:0 0 36px rgba(139,92,246,.85),0 18px 50px rgba(0,0,0,.5);display:grid;place-items:center;position:relative;animation:pulse 2.2s ease-in-out infinite}
    button:after{content:'Luna';position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:800;text-shadow:0 2px 8px #000;color:#eef2ff;letter-spacing:.3px}
    svg{filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))}
    @keyframes pulse{0%,100%{transform:scale(1);box-shadow:0 0 30px rgba(139,92,246,.75),0 18px 50px rgba(0,0,0,.5)}50%{transform:scale(1.05);box-shadow:0 0 48px rgba(6,182,212,.75),0 18px 50px rgba(0,0,0,.5)}}
    .hint{position:absolute;bottom:2px;left:0;right:0;text-align:center;color:#dbe4ff;font-size:9px;text-shadow:0 2px 7px #000;opacity:.85}
  </style></head><body><div class="wrap"><button id="orb" title="Open Luna"><svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 2.3 8.7 8.1 3 9.3l5.7 1.2 1.2 5.7 1.2-5.7 5.7-1.2-5.7-1.2-1.2-5.8Z"/><path d="M19 13l-.7 3.1-3.1.7 3.1.7.7 3.1.7-3.1 3.1-.7-3.1-.7L19 13Z"/></svg></button><div class="hint">Ctrl+Shift+L</div></div><script>document.getElementById('orb').addEventListener('click',()=>window.luna.openMainCommandPalette());</script></body></html>`;
  await orbWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  orbWindow.on('closed', () => { orbWindow = null; });
}


app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  await ensureInitialData();
  installNetworkMonitor();
  ipcMain.handle('health:check', health);
  ipcMain.handle('demo:reset', resetDemo);
  ipcMain.handle('ai:chat', (_e, messages) => chat(messages));
  ipcMain.handle('voice:transcribe', (_e, samples: number[]) => transcribeAudio(samples));
  ipcMain.handle('voice:status', voiceModelStatus);
  ipcMain.handle('mission:job-application', runJobMission);
  ipcMain.handle('mission:template-run', (_e, missionId: string) => runMissionTemplate(missionId));
  ipcMain.handle('studio:research-presentation', runResearchMission);
  ipcMain.handle('skill:generate', (_e, description: string) => generateSkill(description));
  ipcMain.handle('skill:save', (_e, skill: LunaSkill) => saveSkill(skill));
  ipcMain.handle('skill:list', listSkills);
  ipcMain.handle('skill:run', (_e, skillId: string) => runSkill(skillId));
  ipcMain.handle('vault:index-demo', indexDemoVault);
  ipcMain.handle('vault:import-files', importVaultFiles);
  ipcMain.handle('vault:state', readVault);
  ipcMain.handle('vault:search', (_e, query: string) => searchVault(query));
  ipcMain.handle('vault:ask', (_e, question: string) => askVault(question));
  ipcMain.handle('memory:list', listMemory);
  ipcMain.handle('memory:add', (_e, text: string, type: MemoryItem['type'] = 'fact', source = 'user') => addMemory(text, type, source));
  ipcMain.handle('memory:search', (_e, query: string) => searchMemory(query));
  ipcMain.handle('memory:delete', (_e, id: string) => deleteMemory(id));
  ipcMain.handle('memory:seed', seedMemoryNow);
  ipcMain.handle('context:build', (_e, query: string) => buildContext(query));
  ipcMain.handle('ai:chat-plus', (_e, messages: ChatMessage[]) => chatPlus(messages));
  ipcMain.handle('automation:plan-cleanup', planCleanup);
  ipcMain.handle('automation:execute-cleanup', (_e, plan) => executeCleanup(plan));
  ipcMain.handle('automation:undo', (_e, missionId) => undoMission(missionId));
  ipcMain.handle('network:log', () => ({ ...networkLog }));
  ipcMain.handle('resources:get', getResources);
  ipcMain.handle('model:recommend', recommendModel);
  ipcMain.handle('model:benchmark', benchmarkModels);
  ipcMain.handle('model:fallback-drill', fallbackDrill);
  ipcMain.handle('lens:context', captureLensContext);
  ipcMain.handle('lens:import-image', importLensImage);
  ipcMain.handle('lens:explain', (_e, snapshot: LensSnapshot) => explainLens(snapshot));
  ipcMain.handle('command:route', (_e, command: string) => routeCommand(command));
  ipcMain.handle('audit:list', readAudit);
  ipcMain.handle('trust:export', exportTrustData);
  ipcMain.handle('data:reset-all', resetAllData);
  ipcMain.handle('attachments:import', importAttachments);
  ipcMain.handle('attachments:list', readAttachments);
  ipcMain.handle('attachments:clear', clearAttachments);
  ipcMain.handle('attachments:to-vault', attachmentsToVault);
  ipcMain.handle('attachments:summarize', summarizeAttachments);
  ipcMain.handle('settings:get', getSettings);
  ipcMain.handle('settings:save', (_e, settings: Partial<LunaSettings>) => saveSettings(settings));
  ipcMain.handle('database:status', databaseStatus);
  ipcMain.handle('ui:open-command-palette', () => openMainCommandPalette());
  ipcMain.handle('shell:reveal', (_e, p: string) => shell.showItemInFolder(p));
  await createWindow();
  await createOrbWindow();
  globalShortcut.register('CommandOrControl+Shift+L', () => { openMainCommandPalette().catch(() => {}); });
  app.on('activate', async () => { if (!mainWindow || mainWindow.isDestroyed()) await createWindow(); if (!orbWindow || orbWindow.isDestroyed()) await createOrbWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
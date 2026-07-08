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
const { PDFParse } = require('pdf-parse');
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

async function getUniquePath(destDir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  let counter = 1;
  let candidate = path.join(destDir, filename);
  while (await exists(candidate)) {
    candidate = path.join(destDir, `${baseName} (${counter})${ext}`);
    counter++;
  }
  return candidate;
}



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
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        role TEXT,
        content TEXT,
        meta TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
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
  const tableNames = ['audit_events','memories','vault_docs','vault_chunks','skills','settings','artifacts','chat_sessions','chat_messages'];
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
  if (orbWindow && !orbWindow.isDestroyed()) await refreshOrbWindow();
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
  await ensureDir(lunaTrashFolder()); // Ensure Luna's trash folder exists
  await ensureDir(attachmentsRoot());
  
  // One-time cleanup: delete any manifest that references paths inside demo workspace
  try {
    const manifestFiles = (await fs.readdir(manifestsRoot())).filter(f => f.endsWith('.json'));
    for (const file of manifestFiles) {
      const manifestPath = path.join(manifestsRoot(), file);
      try {
        const manifest = JSON.parse(await readText(manifestPath));
        const isDemoManifest = (
          (manifest.root && (manifest.root as string).startsWith(demoRoot())) || // Old cleanup manifests have root
          (manifest.originalPath && (manifest.originalPath as string).startsWith(demoRoot())) || // Delete manifests
          (manifest.from && (manifest.from as string).startsWith(demoRoot())) // Rename/move manifests
        );
        if (isDemoManifest) {
          await fs.unlink(manifestPath);
          await logAudit('automation', 'cleanup_old_demo_manifest', manifestPath, 'Removed stale demo-sandbox manifest.', 'low');
        }
      } catch (e) {
        // If manifest is invalid/corrupt, delete it too
        await fs.unlink(manifestPath).catch(() => {});
      }
    }
  } catch {}
  
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
  if (process.env.FORCE_OLLAMA_OFFLINE === '1') {
    return { ok: false, models: [], error: 'Forced offline by test environment.' };
  }
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
  const isSkillStep = last.includes('\nskill:') || last.includes('\nstep:') || last.includes('extract structured json') || last.includes('schema hint:');
  if (!isSkillStep) {
    if (last.includes('what') && last.includes('luna')) return 'I am Luna, a local-first desktop AI layer. In this prototype I can chat, analyze seeded local documents, generate job-application artifacts, organize files with preview and full undo, and show privacy/resource proof widgets.';
    if (last.includes('privacy')) return 'Privacy trace: Luna is using local demo mode or local Ollama only. External network requests are tracked in the header, file access is logged per skill run, and demo data can be reset with one click.';
  }
  return 'Local AI model unavailable — connect Ollama and try again';
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
    const parser = new PDFParse({ data });
    const parsed = await parser.getText();
    await parser.destroy().catch(() => {});
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
    makeSkill('analyze_resume_fit', 'Analyze Resume Fit', 'Compare a resume against a job description, analyze fit, and generate a cover letter.', 'job', t),
    makeSkill('summarize_meeting_transcript', 'Summarize Meeting Transcript', 'Extract decisions and action items from a meeting transcript.', 'meeting', t),
    makeSkill('extract_invoice_data', 'Extract Invoice Data', 'Extract vendor, total, tax, and line items from an invoice document.', 'invoice', t),
    makeSkill('generate_study_pack', 'Generate Study Pack', 'Generate study summaries and flashcards from a document.', 'study', t),
    makeSkill('explain_codebase_architecture', 'Explain Codebase Architecture', 'Statically analyze a local codebase directory and explain its architecture.', 'research', t)
  ];
}

const allowedSkillCategories = ['study', 'invoice', 'meeting', 'research', 'job', 'generic'] as const;
const allowedSkillTools = ['read_input', 'local_inference', 'structured_extract', 'export_markdown', 'export_pdf', 'export_csv', 'export_json', 'export_ics', 'export_zip', 'export_docx', 'analyze_codebase'] as const;
const allowedInputTypes = ['file', 'folder', 'text', 'demo'] as const;
const allowedOutputTypes = ['pdf', 'docx', 'md', 'html', 'zip', 'json', 'csv', 'ics'] as const;

function slugify(text: string) {
  return String(text || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function looksLikeUnsupportedLiveExternalRequest(description: string): boolean {
  const text = String(description || '').toLowerCase();
  const hasLocalInputCue = /(from my|from the|from this|provided|uploaded|attached|local|document|transcript|file|folder|resume|invoice|meeting|notes|source)/i.test(text);
  const hasExternalDataCue = /(netflix|spotify|streaming|catalog|shows|movies|anime|manga|song|songs|playlist|artist|price|prices|inventory|stock|stocks|weather|news|sports|event|events|schedule|schedules|live|real-time|current|latest|up-to-date|today|tonight|now|online|web|internet|available|popular|top|best)/i.test(text);
  const asksForCurrentInfo = /(current|latest|up-to-date|live|real-time|today|tonight|now|available|catalog|what's on|what is on)/i.test(text);
  const isLocalContentTask = /(summarize|summary|analyze|extract|organize|transform|convert|rewrite|compare|notes|transcript|resume|invoice|meeting|document|file|folder)/i.test(text);
  return hasExternalDataCue && !hasLocalInputCue && (asksForCurrentInfo || /(?:netflix|spotify|streaming|catalog|shows|movies|anime|manga|song|songs|playlist|artist|price|prices|inventory|stock|stocks|weather|news|events|schedule|popular|top|best)/i.test(text)) && !isLocalContentTask;
}

function buildSkillArtifactPath(skillDir: string, stem: string, ext: string) {
  return path.join(skillDir, `${slugify(stem)}.${ext.replace(/^\./, '')}`);
}

async function resolveSkillInput(skill: LunaSkill, context?: any) {
  const inputValues = context?.inputValues || {};
  const hasRealInputs = skill.inputs?.some(i => ['file', 'folder', 'text'].includes(i.type));

  if (hasRealInputs && Object.keys(inputValues).length > 0) {
    const fileOrFolderInputs = skill.inputs?.filter(i => ['file', 'folder'].includes(i.type)) || [];
    let firstFilePath: string | undefined = undefined;
    for (const inp of fileOrFolderInputs) {
      const val = inputValues[inp.name];
      if (val && typeof val === 'string') {
        firstFilePath = val;
        break;
      }
    }

    const parts: string[] = [];
    for (const inp of skill.inputs || []) {
      const val = inputValues[inp.name];
      if (val !== undefined && val !== null) {
        const valStr = String(val);
        if (inp.type === 'file' || inp.type === 'folder') {
          let resolvedPath = valStr;
          try {
            const stat = await fs.stat(valStr);
            if (stat.isDirectory()) {
              const entries = await fs.readdir(valStr);
              const files = entries.filter(x => !x.startsWith('.'));
              if (files.length) {
                resolvedPath = path.join(valStr, files[0]);
              }
            }
          } catch {}
          const docText = await readDocumentAny(resolvedPath);
          parts.push(`Input [${inp.name}]:\n${docText}`);
        } else if (inp.type === 'text') {
          parts.push(`Input [${inp.name}]:\n${valStr}`);
        }
      }
    }

    const combinedText = parts.join('\n\n') || skill.description;
    return {
      sourceType: 'text' as const,
      text: combinedText,
      path: firstFilePath,
      name: firstFilePath ? path.basename(firstFilePath) : undefined
    };
  }

  const preferred = skill.inputs?.find(i => ['file', 'folder', 'text', 'demo'].includes(i.type)) || skill.inputs?.[0];
  if (!preferred) return { sourceType: 'text' as const, text: skill.description };
  if (preferred.type === 'text') return { sourceType: 'text' as const, text: preferred.description || skill.description };
  if (preferred.type === 'demo') {
    const fallback = skill.category === 'invoice' ? path.join(docsRoot(), 'Invoice_Demo_Electronics.txt') : skill.category === 'meeting' ? path.join(docsRoot(), 'Meeting_Transcript_Luna_Demo.txt') : skill.category === 'job' ? path.join(docsRoot(), 'Demo_User_Resume.txt') : path.join(docsRoot(), 'Research_Local_AI_Privacy.md');
    return { sourceType: 'file' as const, path: fallback, name: path.basename(fallback) };
  }
  if (preferred.type === 'folder') {
    const folderPath = path.join(docsRoot(), 'documents');
    const entries = fssync.existsSync(folderPath) ? fssync.readdirSync(folderPath).filter(x => !x.startsWith('.')) : [];
    if (entries.length) return { sourceType: 'file' as const, path: path.join(folderPath, entries[0]), name: entries[0] };
  }
  try {
    const attachments = await readAttachments().catch(() => ({ items: [] as AttachmentItem[], updatedAt: '' }));
    const match = attachments.items.find(item => {
      const accepted = preferred.accept?.map(ext => ext.toLowerCase());
      if (!accepted?.length) return true;
      const itemExt = path.extname(item.name).toLowerCase();
      return accepted.some(ext => ext === itemExt || ext === `.${itemExt}`);
    });
    if (match?.storedPath) return { sourceType: 'file' as const, path: match.storedPath, name: match.name };
  } catch {}
  const fallbackPath = skill.category === 'invoice' ? path.join(docsRoot(), 'Invoice_Demo_Electronics.txt') : skill.category === 'meeting' ? path.join(docsRoot(), 'Meeting_Transcript_Luna_Demo.txt') : skill.category === 'job' ? path.join(docsRoot(), 'Demo_User_Resume.txt') : path.join(docsRoot(), 'Research_Local_AI_Privacy.md');
  return { sourceType: 'file' as const, path: fallbackPath, name: path.basename(fallbackPath) };
}

async function playSkillTool(tool: string, step: LunaSkill['steps'][number], context: any, skill: LunaSkill, skillDir: string) {
  const executor = (skillToolRegistry as Record<string, (step: LunaSkill['steps'][number], context: any, skill: LunaSkill, skillDir: string) => Promise<any>>)[tool];
  if (!executor) throw new Error(`Unsupported skill tool: ${tool}`);
  return executor(step, context, skill, skillDir);
}

const skillToolRegistry: Record<string, (step: LunaSkill['steps'][number], context: any, skill: LunaSkill, skillDir: string) => Promise<any>> = {
  async read_input(_step, context, skill) {
    const resolved = await resolveSkillInput(skill, context);
    let text = '';
    if (resolved.sourceType === 'text') text = resolved.text || skill.description;
    else if (resolved.path) text = await readDocumentAny(resolved.path);
    else text = skill.description;
    context.inputPath = resolved.path;
    context.inputText = text;
    context.currentText = text;
    context.currentJson = null;
    return { text };
  },
  async local_inference(step, context, skill) {
    const prompt = [
      `Skill: ${skill.name}`,
      `Skill description: ${skill.description}`,
      `Step: ${step.label}`,
      `Step detail: ${step.detail}`,
      `Context from earlier steps:\n${context.currentText || context.inputText || 'No prior context.'}`
    ].join('\n\n');
    const ai = await chat([{ role: 'user', content: prompt }]);
    context.currentText = ai.text;
    context.currentJson = null;
    return { text: ai.text };
  },
  async structured_extract(step, context) {
    const source = context.currentText || context.inputText || '';
    const prompt = [
      'Extract structured JSON from the provided text.',
      'Return valid JSON only.',
      `Schema hint: ${step.detail}`,
      `Source text:\n${source}`
    ].join('\n\n');
    const ai = await chat([{ role: 'user', content: prompt }]);
    if (ai.text === "Local AI model unavailable — connect Ollama and try again") {
      return { text: ai.text };
    }
    const parsed = extractJsonObject(ai.text);
    const payload = parsed && typeof parsed === 'object' ? parsed : { extracted: source.slice(0, 4000) };
    context.currentJson = payload;
    context.currentText = JSON.stringify(payload, null, 2);
    return { json: payload, text: context.currentText };
  },
  async export_markdown(_step, context, skill, skillDir) {
    const content = `# ${skill.name}\n\n${context.currentJson ? JSON.stringify(context.currentJson, null, 2) : context.currentText || ''}\n`;
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_summary`, 'md');
    await ensureDir(path.dirname(filePath));
    await writeText(filePath, content);
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async export_pdf(_step, context, skill, skillDir) {
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_report`, 'pdf');
    const body = context.currentJson ? JSON.stringify(context.currentJson, null, 2) : context.currentText || '';
    await generatePdf(filePath, skill.name, [{ heading: 'Generated skill output', body }, { heading: 'Privacy', body: 'Generated locally by Luna skill runner.' }]);
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async export_csv(_step, context, skill, skillDir) {
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_data`, 'csv');
    let content = '';
    if (context.currentJson && typeof context.currentJson === 'object' && !Array.isArray(context.currentJson)) {
      const rows = Object.entries(context.currentJson).map(([k, v]) => `${csvEscape(k)},${csvEscape(String(v))}`).join('\n');
      content = `field,value\n${rows}`;
    } else if (Array.isArray(context.currentJson)) {
      const headers = Object.keys(context.currentJson[0] || {}).filter(Boolean);
      content = [headers.join(','), ...context.currentJson.map((row: any) => headers.map(h => csvEscape(String(row?.[h] ?? ''))).join(','))].join('\n');
    } else {
      content = `content\n${csvEscape(context.currentText || '')}`;
    }
    await ensureDir(path.dirname(filePath));
    await writeText(filePath, content);
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async export_json(_step, context, skill, skillDir) {
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_payload`, 'json');
    const payload = context.currentJson ?? { text: context.currentText || '', skillName: skill.name };
    await ensureDir(path.dirname(filePath));
    await writeText(filePath, JSON.stringify(payload, null, 2));
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async export_ics(_step, context, skill, skillDir) {
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_reminder`, 'ics');
    const content = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Luna//Skill Runner//EN\nBEGIN:VEVENT\nUID:${Date.now()}@local\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}\nSUMMARY:${skill.name}\nDESCRIPTION:${String(context.currentText || context.currentJson ? JSON.stringify(context.currentJson || {}) : '').replace(/\n/g, ' ')}\nEND:VEVENT\nEND:VCALENDAR\n`;
    await ensureDir(path.dirname(filePath));
    await writeText(filePath, content);
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async export_zip(_step, context, skill, skillDir) {
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_package`, 'zip');
    const sources = context.artifactPaths.filter(Boolean);
    if (sources.length) await zipFiles(filePath, sources);
    else {
      const tempMd = buildSkillArtifactPath(skillDir, `${skill.name}_snapshot`, 'md');
      await writeText(tempMd, context.currentText || '');
      await zipFiles(filePath, [tempMd]);
      context.artifactPaths.push(tempMd);
    }
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async export_docx(_step, context, skill, skillDir) {
    const filePath = buildSkillArtifactPath(skillDir, `${skill.name}_document`, 'docx');
    const body = context.currentJson ? JSON.stringify(context.currentJson, null, 2) : context.currentText || '';
    const paragraphs = body.split(/\n\s*\n/).map((p: string) => p.trim()).filter(Boolean);
    await generateDocx(filePath, skill.name, paragraphs);
    context.artifactPaths.push(filePath);
    return { path: filePath };
  },
  async analyze_codebase(_step, context, skill, skillDir) {
    let targetFolder = context.inputPath;
    let isFallback = false;
    if (targetFolder && (await exists(targetFolder))) {
      const stat = await fs.stat(targetFolder);
      if (!stat.isDirectory()) {
        targetFolder = path.dirname(targetFolder);
      }
    }
    if (!targetFolder || !(await exists(targetFolder))) {
      targetFolder = codebaseRoot();
      isFallback = true;
    }
    if (!(await exists(targetFolder))) {
      await resetDemo();
    }
    if (isFallback) {
      context.fallbackNotice = "No target folder selected; analyzing demo-codebase as fallback.";
      await logAudit('skill', 'analyze_codebase_fallback', targetFolder, 'No target folder selected; fell back to demo-codebase for analysis.', 'low');
    }
    const files: string[] = [];
    async function walk(dir: string) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.(ts|tsx|js|jsx|json|md)$/.test(entry.name)) files.push(full);
      }
    }
    await walk(targetFolder);
    const fileSummaries: any[] = [];
    for (const file of files) {
      const text = await readText(file);
      const imports = [...text.matchAll(/import\s+.*?from\s+['\"](.+?)['\"]/g)].map(m => m[1]);
      const exports = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
      const functions = [...text.matchAll(/(?:function|const)\s+([A-Za-z0-9_]+)\s*(?:=|\()/g)].map(m => m[1]);
      fileSummaries.push({ file: path.relative(targetFolder, file), imports, exports, functions, chars: text.length });
    }
    const graphLines = fileSummaries.flatMap((f: any) => f.imports.map((i: string) => `${f.file} -> ${i}`));
    const payload = { root: targetFolder, files: fileSummaries, edges: graphLines, isDemoFallback: isFallback };
    context.currentJson = payload;
    context.currentText = JSON.stringify(payload, null, 2);
    return { json: payload, text: context.currentText };
  }
};

function inferSkillCategory(description: string): LunaSkill['category'] {
  const d = description.toLowerCase();
  if (d.includes('invoice') || d.includes('expense') || d.includes('receipt')) return 'invoice';
  if (d.includes('meeting') || d.includes('transcript') || d.includes('action item')) return 'meeting';
  if (d.includes('flashcard') || d.includes('quiz') || d.includes('study')) return 'study';
  if (d.includes('research') || d.includes('presentation') || d.includes('paper')) return 'research';
  if (d.includes('resume') || d.includes('job') || d.includes('cover letter')) return 'job';
  return 'generic';
}

function sanitizeSkillCategory(value: unknown, fallback: LunaSkill['category']): LunaSkill['category'] {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  return allowedSkillCategories.includes(raw as typeof allowedSkillCategories[number]) ? raw as LunaSkill['category'] : fallback;
}

function sanitizeSkillInputType(value: unknown): LunaSkill['inputs'][number]['type'] {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  return allowedInputTypes.includes(raw as typeof allowedInputTypes[number]) ? raw as LunaSkill['inputs'][number]['type'] : 'text';
}

function sanitizeSkillTool(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  return allowedSkillTools.includes(raw as typeof allowedSkillTools[number]) ? raw : 'summarize';
}

function sanitizeSkillOutputType(value: unknown): LunaSkill['outputs'][number]['type'] {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  return allowedOutputTypes.includes(raw as typeof allowedOutputTypes[number]) ? raw as LunaSkill['outputs'][number]['type'] : 'md';
}

function extractJsonObject(raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  return null;
}

function buildGeneratedSkillFromPayload(payload: any, description: string, categoryHint: LunaSkill['category']): LunaSkill | null {
  if (!payload || typeof payload !== 'object') return null;
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : titleFromDescription(description, categoryHint);
  const category = sanitizeSkillCategory(payload.category, categoryHint);
  const inputs = Array.isArray(payload.inputs) ? payload.inputs.filter(Boolean).slice(0, 4).map((input: any, index: number) => ({
    name: typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : `input_${index + 1}`,
    type: sanitizeSkillInputType(input?.type),
    accept: Array.isArray(input?.accept) ? input.accept.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 6) : undefined,
    description: typeof input?.description === 'string' && input.description.trim() ? input.description.trim() : 'Local input for this skill'
  })) : [];
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 6) : [];
  const steps = Array.isArray(payload.steps) ? payload.steps.filter(Boolean).slice(0, 6).map((step: any, index: number) => ({
    tool: sanitizeSkillTool(step?.tool),
    label: typeof step?.label === 'string' && step.label.trim() ? step.label.trim() : `Step ${index + 1}`,
    detail: typeof step?.detail === 'string' && step.detail.trim() ? step.detail.trim() : 'Perform the requested local refinement safely.'
  })) : [];
  const outputs = Array.isArray(payload.outputs) ? payload.outputs.filter(Boolean).slice(0, 4).map((output: any, index: number) => ({
    name: typeof output?.name === 'string' && output.name.trim() ? output.name.trim() : `output_${index + 1}`,
    type: sanitizeSkillOutputType(output?.type)
  })) : [];
  if (!steps.length || !outputs.length) return null;
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now()}`,
    name,
    description: typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : description,
    category,
    inputs: inputs.length ? inputs : [{ name: 'input', type: 'text', description: 'Primary input for this skill' }],
    permissions: permissions.length ? permissions : ['Read selected/local demo files', 'Run local model or transparent fallback', 'Write artifacts to Luna workspace', 'Create privacy trace'],
    steps,
    outputs,
    createdAt: new Date().toISOString()
  };
}

function makeSkill(id: string, name: string, description: string, category: LunaSkill['category'], createdAt = new Date().toISOString()): LunaSkill {
  const commonPermissions = ['Read selected/local demo files', 'Run local model or transparent fallback', 'Write artifacts to Luna workspace', 'Create privacy trace'];
  const base = { id, name, description, category, createdAt, permissions: commonPermissions };
  if (category === 'invoice') return { ...base,
    inputs: [{ name: 'invoice', type: 'file', accept: ['.pdf', '.png', '.jpg', '.txt'], description: 'Invoice document or image' }],
    steps: [
      { tool: 'read_input', label: 'Read invoice input', detail: 'Read the invoice document or image and extract the available text locally.' },
      { tool: 'structured_extract', label: 'Extract invoice fields', detail: 'Return JSON with vendor, invoiceNumber, date, total, tax, and lineItems.' },
      { tool: 'export_json', label: 'Export invoice JSON', detail: 'Save the extracted invoice data as JSON.' },
      { tool: 'export_csv', label: 'Export invoice CSV', detail: 'Save the extracted invoice rows as CSV.' },
      { tool: 'export_pdf', label: 'Export invoice PDF', detail: 'Generate a PDF summary of the extracted invoice data.' }
    ],
    outputs: [{ name: 'invoice_data.json', type: 'json' }, { name: 'invoice_items.csv', type: 'csv' }, { name: 'invoice_report.pdf', type: 'pdf' }]
  };
  if (category === 'meeting') return { ...base,
    inputs: [{ name: 'transcript', type: 'file', accept: ['.txt', '.md'], description: 'Meeting transcript or pasted notes' }],
    steps: [
      { tool: 'read_input', label: 'Read transcript', detail: 'Load the transcript from local storage.' },
      { tool: 'local_inference', label: 'Summarize meeting', detail: 'Produce decisions, risks and concrete follow-up actions from the transcript.' },
      { tool: 'export_markdown', label: 'Export summary', detail: 'Write the meeting summary to Markdown.' },
      { tool: 'export_ics', label: 'Export reminders', detail: 'Write reminder events based on the generated follow-up summary.' }
    ],
    outputs: [{ name: 'meeting_summary.md', type: 'md' }, { name: 'reminders.ics', type: 'ics' }]
  };
  if (category === 'job') return { ...base,
    inputs: [
      { name: 'resume', type: 'file', accept: ['.pdf', '.docx', '.txt'], description: 'Resume file' },
      { name: 'jobDescription', type: 'file', accept: ['.pdf', '.docx', '.txt'], description: 'Job description file' }
    ],
    steps: [
      { tool: 'read_input', label: 'Read resume', detail: 'Read the resume file.' },
      { tool: 'read_input', label: 'Read job description', detail: 'Read the job description file.' },
      { tool: 'local_inference', label: 'Compare fit', detail: 'Compare fit and draft a cover letter based on resume and job description.' },
      { tool: 'export_pdf', label: 'Export fit analysis PDF', detail: 'Save the fit analysis as a PDF report.' },
      { tool: 'export_docx', label: 'Export cover letter DOCX', detail: 'Save the cover letter as a DOCX document.' }
    ],
    outputs: [{ name: 'fit_analysis.pdf', type: 'pdf' }, { name: 'cover_letter.docx', type: 'docx' }]
  };
  if (category === 'research') return { ...base,
    inputs: [{ name: 'codebase', type: 'folder', description: 'Codebase directory' }],
    steps: [
      { tool: 'read_input', label: 'Read codebase folder', detail: 'Select and load the codebase folder.' },
      { tool: 'analyze_codebase', label: 'Analyze codebase', detail: 'Perform static dependency and function analysis on the codebase.' },
      { tool: 'local_inference', label: 'Explain codebase architecture', detail: 'Produce architectural explanations and onboarding guide.' },
      { tool: 'export_json', label: 'Export dependency graph JSON', detail: 'Save the static dependency map as JSON.' },
      { tool: 'export_markdown', label: 'Export architecture report MD', detail: 'Save the explanation as Markdown.' },
      { tool: 'export_pdf', label: 'Export report PDF', detail: 'Save a PDF report of the codebase explanation.' },
      { tool: 'export_zip', label: 'Export complete package ZIP', detail: 'Bundle all reports and graph JSON into a ZIP package.' }
    ],
    outputs: [
      { name: 'dependency_graph.json', type: 'json' },
      { name: 'codebase_architecture.md', type: 'md' },
      { name: 'codebase_report.pdf', type: 'pdf' },
      { name: 'codebase_package.zip', type: 'zip' }
    ]
  };
  return { ...base,
    inputs: [{ name: 'document', type: 'file', accept: ['.pdf', '.docx', '.txt', '.md'], description: 'Source document' }],
    steps: [
      { tool: 'read_input', label: 'Read document', detail: 'Read the selected document locally.' },
      { tool: 'local_inference', label: 'Generate insight', detail: 'Summarize the document into structured notes and useful next steps.' },
      { tool: 'export_markdown', label: 'Export summary', detail: 'Save a Markdown summary locally.' },
      { tool: 'export_pdf', label: 'Export report', detail: 'Save a PDF report locally.' }
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
  if (looksLikeUnsupportedLiveExternalRequest(description)) {
    return {
      id: `${slugify(name)}_${Date.now()}`,
      name: 'Unsupported request',
      description,
      category,
      inputs: [],
      permissions: ['Read selected/local demo files'],
      steps: [],
      outputs: [],
      createdAt: new Date().toISOString(),
      unsupported: true,
      unsupportedReason: 'This request depends on live or external data that Luna cannot access locally, so it cannot be executed accurately.'
    };
  }
  const basePrompt = [
    'You are generating a structured skill for a private local AI desktop assistant.',
    'Return JSON only, no markdown, matching this schema:',
    '{"id":"string","name":"string","description":"string","category":"study|invoice|meeting|research|job|generic","inputs":[{"name":"string","type":"file|folder|text|demo","accept":["string"],"description":"string"}],"permissions":["string"],"steps":[{"tool":"string","label":"string","detail":"string"}],"outputs":[{"name":"string","type":"pdf|docx|md|html|zip|json|csv|ics"}],"createdAt":"string"}',
    'Allowed tools: read_input, local_inference, structured_extract, export_markdown, export_pdf, export_csv, export_json, export_ics, export_zip.',
    'Allowed input types: file, folder, text, demo.',
    'Allowed output types: pdf, docx, md, html, zip, json, csv, ics.',
    'If the request requires internet access, external accounts, third-party app control, or live/external data that Luna cannot access locally, return {"unsupported":true,"reason":"..."} instead of inventing a fake skill.',
    'Do not generate skills that pretend to know current catalogs, prices, inventory, weather, news, schedules, or other time-sensitive facts without a real local data source.',
    'Do not invent arbitrary or unrelated inputs (e.g. startDate/endDate for list generation) that are not directly implied by the request or explicitly required. If you cannot associate a legitimate local input (like a file, folder, or custom text representing the user\'s local data) with the task, you must return {"unsupported":true,"reason":"..."}.',
    'For every output type declared in "outputs" (e.g. json, csv, pdf, md), you MUST include a corresponding export step in "steps" (e.g. export_json, export_csv, export_pdf, export_markdown). Do not declare outputs without corresponding export steps.',
    'The skill must reflect the user request, stay within local safe desktop automation, and never invent arbitrary code execution tools.',
    `User request: ${description}`
  ].join('\n');
  const prompts = [basePrompt, `${basePrompt}\nIMPORTANT: Only use the allowed tool names above. If any tool is outside that set, reject the draft and return an unsupported response.`];
  for (const prompt of prompts) {
    try {
      const res = await chat([{ role: 'system', content: 'You create structured local desktop workflow skills. Return valid JSON only.' }, { role: 'user', content: prompt }]);
      const payload = extractJsonObject(res.text);
      if (payload?.unsupported) {
        return {
          id: `${slugify(name)}_${Date.now()}`,
          name: 'Unsupported request',
          description,
          category,
          inputs: [],
          permissions: ['Read selected/local demo files'],
          steps: [],
          outputs: [],
          createdAt: new Date().toISOString(),
          unsupported: true,
          unsupportedReason: typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : 'This request requires capabilities that Luna cannot provide locally.'
        };
      }
      const generated = buildGeneratedSkillFromPayload(payload, description, category);
      if (generated) return generated;
    } catch {}
  }
  const id = `${slugify(name)}_${Date.now()}`;
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

async function deleteSkill(skillId: string): Promise<{ ok: boolean; skills: LunaSkill[] }> {
  const skills = await listSkills();
  const next = skills.filter(skill => skill.id !== skillId);
  await writeText(skillsPath(), JSON.stringify(next, null, 2));
  getDb().prepare('DELETE FROM skills WHERE id = ?').run(skillId);
  await logAudit('skill', 'delete_skill', skillId, `Deleted skill ${skillId} locally.`, 'low');
  return { ok: true, skills: next };
}

function csvEscape(x: string) { return `"${String(x).replace(/"/g, '""')}"`; }

async function runSkill(skillId: string, inputValues?: Record<string, any>): Promise<SkillRunResult> {
  const skill = (await listSkills()).find(s => s.id === skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  const trace: MissionTraceItem[] = [];
  const privacy: PrivacyEvent[] = [];
  const skillDir = path.join(artifactsRoot(), 'skills', safeName(skill.name));
  await ensureDir(skillDir);
  const artifacts: Artifact[] = [];
  const addArtifact = (name: string, p: string, type: Artifact['type']) => artifacts.push({ name, path: p, type });

  if (skill.unsupported) {
    trace.push({ time: now(), title: 'Unsupported skill', detail: skill.unsupportedReason || 'This skill is not executable locally.' });
    privacy.push({ time: now(), action: 'skill_refusal', target: skill.name, detail: skill.unsupportedReason || 'Skill generation refused unsupported request.' });
    await logAudit('skill', 'run_skill', skill.name, 'Skipped unsupported skill execution.', 'low');
    return { skill, artifacts, trace, privacy };
  }

  const context: any = { artifactPaths: [] as string[], inputValues: inputValues || {} };
  let executionError: string | null = null;

  try {
    for (const step of skill.steps || []) {
      trace.push({ time: now(), title: step.label, detail: step.detail });
      const result = await playSkillTool(step.tool, step, context, skill, skillDir);
      if (context.fallbackNotice) {
        trace.push({ time: now(), title: 'Demo Fallback Target Used', detail: context.fallbackNotice });
        delete context.fallbackNotice;
      }
      if (result?.text === "Local AI model unavailable — connect Ollama and try again") {
        throw new Error("Local AI model unavailable — connect Ollama and try again");
      }
      if (result?.path) {
        const artifactName = path.basename(result.path);
        addArtifact(artifactName, result.path, (path.extname(result.path).replace('.', '') || 'md') as Artifact['type']);
      }
      if (result?.text) context.currentText = result.text;
      if (result?.json !== undefined) context.currentJson = result.json;
      privacy.push({ time: now(), action: step.tool, target: skill.name, detail: `Executed skill step: ${step.label}` });
    }
  } catch (err: any) {
    executionError = err?.message || String(err);
    trace.push({ time: now(), title: 'Execution failed', detail: executionError || 'Unknown error' });
    privacy.push({ time: now(), action: 'execution_error', target: skill.name, detail: `Error during execution: ${executionError || 'Unknown error'}` });
  }

  if (artifacts.length) {
    privacy.push({ time: now(), action: 'write_artifacts', target: skillDir, detail: `Saved ${artifacts.length} skill artifacts locally.` });
  } else {
    let detail = 'The skill completed, but no local artifact files were written.';
    if (executionError) {
      detail = `Execution aborted due to an error: ${executionError}`;
    } else {
      const hasExportStep = skill.steps?.some(step => step.tool.startsWith('export_'));
      if (!hasExportStep) {
        detail = 'The skill definition did not include any export steps (e.g. export_json, export_pdf) to save files to your workspace.';
      } else {
        const hasZipOnly = skill.steps?.every(step => !step.tool.startsWith('export_') || step.tool === 'export_zip');
        if (hasZipOnly) {
          detail = 'The skill only included a ZIP export step, but no other files were written to package into the ZIP.';
        }
      }
    }
    trace.push({ time: now(), title: 'No artifacts produced', detail });
    privacy.push({ time: now(), action: 'skill_no_artifacts', target: skill.name, detail: 'No skill artifacts were produced by this run.' });
  }
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
  await addMemory('Luna generated a Research-to-Presentation package with PPTX, PDF, HTML, speaker notes and ZIP from local demo documents.', 'project', 'research-skill');
  await logAudit('artifact', 'research_presentation_artifacts', studioDir, 'Generated PPTX, PDF, HTML, Markdown and ZIP research package.', 'low');
  return { summary: 'Research-to-Presentation skill completed locally. Luna created a polished deck and export package from local sources.', artifacts: [
    { name: 'luna_research_deck.pptx', path: pptxPath, type: 'pptx' as any },
    { name: 'research_brief.pdf', path: pdfPath, type: 'pdf' },
    { name: 'research_brief.html', path: htmlPath, type: 'html' },
    { name: 'speaker_notes.md', path: mdPath, type: 'md' },
    { name: 'research_presentation_package.zip', path: zipPath, type: 'zip' }
  ], trace, privacy };
}

function categoryFor(name: string): { category: string; source: 'rule' | 'uncertain' } {
  const lower = name.toLowerCase();
  if (/\.pdf|\.docx|\.txt|\.md|\.doc|\.rtf|\.odt/.test(lower)) return { category: 'Documents', source: 'rule' };
  if (/\.png|\.jpg|\.jpeg|\.gif|\.bmp|\.tiff|\.webp|\.svg|screenshot/.test(lower)) return { category: 'Images', source: 'rule' };
  if (/\.mp4|\.mkv|\.mov|\.avi|\.wmv|\.flv|\.webm/.test(lower)) return { category: 'Videos', source: 'rule' };
  if (/\.zip|\.rar|\.7z|\.tar|\.gz|\.bz2|\.xz/.test(lower)) return { category: 'Archives', source: 'rule' };
  if (/invoice|expense|receipt|billing|statement/.test(lower)) return { category: 'Finance', source: 'rule' };
  return { category: 'Other', source: 'uncertain' };
}

async function batchClassifyFiles(files: string[]): Promise<Map<string, { category: string; source: 'ai' | 'uncertain' }>> {
  const o = await checkOllama();
  if (!o.ok || o.models.length === 0) {
    const map = new Map<string, { category: string; source: 'ai' | 'uncertain' }>();
    for (const file of files) map.set(file, { category: 'Other', source: 'uncertain' });
    return map;
  }
  
  const categories = ['Documents', 'Images', 'Videos', 'Finance', 'Archives', 'Uncertain'];
  const prompt = `Classify each of these filenames into ONE of these EXACT categories: ${categories.join(', ')}.
Only reply with a JSON object where keys are the exact filenames and values are the category string. No extra text or explanation.
Filenames: ${JSON.stringify(files, null, 2)}`;

  const settings = await getSettings().catch(() => defaultSettings());
  const preferred = ['qwen2.5:3b', 'llama3.2:3b', 'phi3:mini'];
  const explicit = settings.preferredModel && settings.preferredModel !== 'auto'
    ? o.models.find((x: string) => x.startsWith(settings.preferredModel))
    : undefined;
  const model = explicit || preferred.find(m => o.models.some((x: string) => x.startsWith(m))) || o.models[0];

  try {
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: 'You are a precise file classifier. Only return valid JSON, no extra text.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const json: any = await res.json();
    const text = json.message?.content || json.response || '';
    const parsed: Record<string, string> = JSON.parse(text);
    const map = new Map<string, { category: string; source: 'ai' | 'uncertain' }>();
    for (const file of files) {
      const cat = parsed[file];
      if (cat && (categories as string[]).includes(cat) && cat !== 'Uncertain') {
        map.set(file, { category: cat, source: 'ai' });
      } else {
        map.set(file, { category: 'Other', source: 'uncertain' });
      }
    }
    await logAudit('ai', 'batch_classify_files', model, `Classified ${files.length} ambiguous files locally via Ollama.`, 'low');
    return map;
  } catch {
    const map = new Map<string, { category: string; source: 'ai' | 'uncertain' }>();
    for (const file of files) map.set(file, { category: 'Other', source: 'uncertain' });
    return map;
  }
}

async function sha256(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fssync.createReadStream(p);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function planFolderCleanup(folderPath?: string): Promise<FilePlan> {
  const targetFolder = folderPath || messyRoot();
  const dirEntries = await fs.readdir(targetFolder, { withFileTypes: true });
  const missionId = `cleanup_${Date.now()}`;

  // Layer 1: Project folder detection
  const projectMarkers = [
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.git', '.gitignore', '.gitattributes',
    'requirements.txt', 'pyproject.toml', 'setup.py',
    'Cargo.toml', 'Cargo.lock',
    'go.mod', 'go.sum',
    'pom.xml', 'build.gradle',
    'Makefile', 'CMakeLists.txt',
    '.env', '.env.example'
  ];
  let isProjectFolder = false;
  for (const marker of projectMarkers) {
    const markerPath = path.join(targetFolder, marker);
    if (await exists(markerPath)) {
      isProjectFolder = true;
      break;
    }
  }

  // Layer 2: Fixed exclusion list (never move these, regardless of folder)
  const excludedFiles = new Set([
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.gitignore', '.gitattributes', '.env', '.env.local', '.env.development', '.env.production',
    'requirements.txt', 'pyproject.toml', 'setup.py',
    'Cargo.toml', 'Cargo.lock',
    'go.mod', 'go.sum',
    'pom.xml', 'build.gradle',
    'Makefile', 'CMakeLists.txt',
    'README.md', 'README.txt', 'LICENSE', 'LICENSE.txt'
  ]);

  // Build list of valid files to consider (skip directories and excluded files)
  const files: string[] = [];
  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    if (excludedFiles.has(entry.name)) continue;
    files.push(entry.name);
  }

  // Split into rule-matched and ambiguous
  const ruleMatched: Array<{ file: string; category: string }> = [];
  const ambiguousFiles: string[] = [];
  for (const file of files) {
    const result = categoryFor(file);
    if (result.source === 'rule') {
      ruleMatched.push({ file, category: result.category });
    } else {
      ambiguousFiles.push(file);
    }
  }

  // Batch classify ambiguous
  const ambiguousResults = await batchClassifyFiles(ambiguousFiles);

  // Combine results
  const allResults = new Map<string, { category: string; source: 'rule' | 'ai' | 'uncertain' }>();
  for (const rm of ruleMatched) {
    allResults.set(rm.file, { category: rm.category, source: 'rule' });
  }
  for (const [file, result] of ambiguousResults) {
    allResults.set(file, result);
  }

  // Define real system folders
  const documentsPath = app.getPath('documents');
  const picturesPath = app.getPath('pictures');
  const videosPath = app.getPath('videos');
  const financePath = path.join(documentsPath, 'Finance');

  // Build creates and moves
  const createsSet = new Set<string>();
  const moves: FilePlan['moves'] = [];
  for (const file of files) {
    const result = allResults.get(file);
    if (!result) continue;
    if (result.source === 'uncertain') {
      continue; // Don't move uncertain files at all
    }

    // Determine real destination folder
    let destFolder: string;
    switch (result.category) {
      case 'Documents': destFolder = documentsPath; break;
      case 'Images': destFolder = picturesPath; break;
      case 'Videos': destFolder = videosPath; break;
      case 'Finance': destFolder = financePath; break;
      case 'Archives':
        // Keep archives in place for now (user can decide later)
        continue;
      default:
        continue; // Skip if category is not mapped
    }

    // Add dest folder to creates set if it's not a standard system folder (only Finance)
    if (result.category === 'Finance') {
      createsSet.add(financePath);
    }

    const from = path.join(targetFolder, file);
    // For now, we'll just set to base filename in dest; executeCleanup will handle collisions
    const to = path.join(destFolder, file);
    moves.push({
      from,
      to,
      reason: `Classified as ${result.category} ${result.source === 'ai' ? 'via local AI' : 'based on filename and extension'}.`,
      classificationSource: result.source
    });
  }
  const creates = Array.from(createsSet);

  const warning = isProjectFolder
    ? 'This looks like a source code project — Automation is meant for messy file folders like Downloads, not project directories, since moving these files could break it.'
    : undefined;

  const risk = isProjectFolder ? 'high' : 'low';

  return { missionId, root: targetFolder, creates, moves, risk, warning };
}

async function executeCleanup(plan: FilePlan): Promise<AutomationResult> {
  console.log('Main: automation:execute-cleanup handler called! Plan:', plan); // TEMP LOG
  try {
    if (plan.warning) {
      throw new Error(plan.warning);
    }
    const manifest = {
      missionId: plan.missionId,
      type: 'cleanup' as const,
      description: `Cleaned up ${plan.moves.length} file(s) from ${path.basename(plan.root)}`,
      createdAt: new Date().toISOString(),
      creates: plan.creates,
      moves: [] as any[]
    };
    const skippedFiles: string[] = [];
    for (const dir of plan.creates) await ensureDir(dir);
    for (const m of plan.moves) {
      // Check if file exists first
      if (!(await exists(m.from))) {
        console.log('executeCleanup: skipping missing file', m.from);
        skippedFiles.push(path.basename(m.from));
        continue;
      }
      // Defensive check: skip directories
      const stat = await fs.stat(m.from);
      if (stat.isDirectory()) {
        console.log('executeCleanup: skipping directory', m.from);
        continue;
      }
      
      // Handle filename collision
      const destDir = path.dirname(m.to);
      const uniqueTo = await getUniquePath(destDir, path.basename(m.from));
      
      manifest.moves.push({
        from: m.from,
        to: uniqueTo,
        checksum: await sha256(m.from),
        mtimeMs: stat.mtimeMs,
        atimeMs: stat.atimeMs
      });
      await ensureDir(destDir);
      await fs.rename(m.from, uniqueTo);
      await fs.utimes(uniqueTo, stat.atime, stat.mtime).catch(() => {});
    }
    
    // If no files were moved, don't create a manifest
    if (manifest.moves.length === 0) {
      await logAudit('automation', 'execute_cleanup_noop', plan.root, 'No files to move — cleanup skipped manifest creation.', 'low');
      return { missionId: plan.missionId, manifestPath: null, moved: 0, skipped: skippedFiles.length, skippedFiles, created: plan.creates.length };
    }

    const manifestPath = path.join(manifestsRoot(), `${plan.missionId}.json`);
    await writeText(manifestPath, JSON.stringify(manifest, null, 2));
    await logAudit('automation', 'execute_cleanup', plan.root, `Moved ${manifest.moves.length} files with undo manifest ${manifestPath}.`, 'medium');
    return { missionId: plan.missionId, manifestPath, moved: manifest.moves.length, skipped: skippedFiles.length, skippedFiles, created: plan.creates.length };
  } catch (e) {
    console.error('Main: executeCleanup failed!', e);
    throw e;
  }
}

async function undoMission(missionId: string) {
  const manifestPath = path.join(manifestsRoot(), `${missionId}.json`);
  console.log('undoMission called with missionId:', missionId, 'manifestPath:', manifestPath);
  
  if (!(await exists(manifestPath))) {
    throw new Error('Manifest not found.');
  }
  
  let manifest: any;
  try {
    manifest = JSON.parse(await readText(manifestPath));
    console.log('undoMission manifest:', JSON.stringify(manifest, null, 2));
  } catch {
    await fs.unlink(manifestPath).catch(() => {});
    throw new Error('Manifest is corrupt; removed from list.');
  }

  let canUndo = true;
  let restored = 0;

  // Single-file delete manifest
  if (manifest.type === 'delete') {
    if (!(await exists(manifest.trashedPath))) {
      console.log('undoMission: trashed path does not exist:', manifest.trashedPath);
      canUndo = false;
    } else {
      await ensureDir(path.dirname(manifest.originalPath));
      await fs.rename(manifest.trashedPath, manifest.originalPath);
      restored = 1;
    }
  }
  // Single-file rename/move manifest
  else if (manifest.type === 'rename' || manifest.type === 'move') {
    if (!(await exists(manifest.to))) {
      console.log('undoMission: target path does not exist:', manifest.to);
      canUndo = false;
    } else {
      await ensureDir(path.dirname(manifest.from));
      await fs.rename(manifest.to, manifest.from);
      restored = 1;
    }
  }
  // Bulk cleanup manifest
  else if (manifest.type === 'cleanup') {
    let anyFilesExist = false;
    console.log('undoMission: processing cleanup moves:', manifest.moves);
    for (const m of [...manifest.moves].reverse()) {
      console.log('undoMission: checking m.to:', m.to);
      if (await exists(m.to)) {
        anyFilesExist = true;
        console.log('undoMission: found, restoring from', m.to, 'to', m.from);
        await ensureDir(path.dirname(m.from));
        await fs.rename(m.to, m.from);
        await fs.utimes(m.from, new Date(m.atimeMs), new Date(m.mtimeMs)).catch(() => {});
        restored++;
      } else {
        console.log('undoMission: m.to does not exist, skipping', m.to);
      }
    }
    // If no files existed, mark as can't undo
    canUndo = anyFilesExist;
    
    // Try to clean up empty created dirs regardless
    for (const dir of [...(manifest.creates || [])].sort((a: string, b: string) => b.length - a.length)) {
      console.log('undoMission: trying to delete created dir:', dir);
      try { await fs.rmdir(dir); console.log('undoMission: deleted dir:', dir); } catch (e) { 
        console.log('undoMission: could not delete dir:', dir, e); 
      }
    }
  }

  if (canUndo) {
    await fs.unlink(manifestPath).catch(() => {});
    await logAudit('automation', `undo_${manifest.type}`, manifestPath, `Successfully undid ${manifest.type} action, restored ${restored} files.`, 'low');
    return { ok: true, restored, manifestPath };
  } else {
    await logAudit('automation', `undo_${manifest.type}_failed`, manifestPath, `Failed to undo ${manifest.type} action; files do not exist at target paths.`, 'medium');
    throw new Error('This action cannot be undone (files no longer exist at target paths). The manifest has been preserved in your history.');
  }
}



export type UndoableAction = {
  missionId: string;
  type: 'delete' | 'rename' | 'move' | 'cleanup';
  description: string;
  createdAt: string;
};

async function listUndoableActions(): Promise<UndoableAction[]> {
  await ensureDir(manifestsRoot());
  let files: string[] = [];
  try { files = (await fs.readdir(manifestsRoot())).filter(f => f.endsWith('.json')); } catch { return []; }
  const actions: UndoableAction[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(await readText(path.join(manifestsRoot(), file)));
      // Skip zero-move cleanup manifests
      if (raw.type === 'cleanup' && (!raw.moves || raw.moves.length === 0)) {
        // Optionally delete the old manifest here for good measure
        await fs.unlink(path.join(manifestsRoot(), file)).catch(() => {});
        continue;
      }
      const type: UndoableAction['type'] =
        raw.type === 'delete' ? 'delete' :
        raw.type === 'rename' ? 'rename' :
        raw.type === 'move' ? 'move' : 'cleanup';
      const description = raw.description ||
        (raw.moves ? `Moved ${raw.moves.length} file(s) (cleanup)` : raw.missionId);
      actions.push({ missionId: raw.missionId, type, description, createdAt: raw.createdAt });
    } catch { /* skip malformed */ }
  }
  return actions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function undoAllPending(): Promise<{ ok: boolean; undone: number; failed: number; message: string }> {
  const actions = await listUndoableActions();
  if (!actions.length) return { ok: true, undone: 0, failed: 0, message: 'Nothing to restore — no undo history found.' };
  let undone = 0;
  let failed = 0;
  for (const action of actions) {
    try {
      await undoMission(action.missionId);
      undone++;
    } catch (e: any) {
      failed++;
      await logAudit('automation', 'undo_all_skipped_unresolvable', action.missionId, e?.message || String(e), 'medium');
    }
  }
  await logAudit('automation', 'undo_all_pending', manifestsRoot(), `Reversed ${undone} pending action(s), skipped ${failed} unresolvable action(s).`, 'low');
  
  if (failed > 0) {
    return { ok: true, undone, failed, message: `Restored ${undone} action(s); skipped ${failed} unresolvable action(s) that have been removed from list.` };
  } else {
    return { ok: true, undone, failed: 0, message: `Restored all ${undone} action(s) successfully.` };
  }
}

async function restoreFromTrash(missionId: string) {
  return undoMission(missionId);
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
const KNOWN_FOLDERS: Record<string, Parameters<typeof app.getPath>[0]> = {
  'desktop': 'desktop',
  'documents': 'documents',
  'docs': 'documents',
  'downloads': 'downloads',
  'pictures': 'pictures',
  'photos': 'pictures',
  'videos': 'videos',
  'movies': 'videos',
  'music': 'music',
  'songs': 'music',
  'home folder': 'home',
  'user folder': 'home'
};
const SEARCHABLE_FOLDERS: Array<Parameters<typeof app.getPath>[0]> = ['desktop', 'documents', 'downloads', 'pictures'];
function cleanFileQuery(raw: string): string {
  return raw
    .replace(/\b(my|the|a|an|file|document|folder|for|please|that|this)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function extractFolderScope(raw: string): { text: string; folderScope?: Parameters<typeof app.getPath>[0] } {
  const m = raw.match(/\b(?:from|in)\s+(?:my\s+|the\s+)?([a-z]+)(?:\s+folder)?\b/i);
  if (m) {
    const key = m[1].toLowerCase();
    const folderScope = (KNOWN_FOLDERS as Record<string, Parameters<typeof app.getPath>[0]>)[key];
    if (folderScope) return { text: raw.slice(0, m.index).trim(), folderScope };
  }
  return { text: raw };
}
async function walkFiles(dir: string, depth = 2): Promise<string[]> {
  let found: string[] = [];
  let entries: any[] = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && depth > 0) found = found.concat(await walkFiles(full, depth - 1));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}
function rankFileMatches(matches: string[], query: string): string[] {
  const q = query.toLowerCase();
  const score = (p: string) => {
    const base = path.basename(p).toLowerCase();
    const withoutExt = base.slice(0, base.length - path.extname(base).length);
    const exact = (base === q || withoutExt === q) ? 0 : 1;
    const depth = p.split(path.sep).length;
    return [exact, depth] as [number, number];
  };
  return [...matches].sort((a, b) => {
    const [ae, ad] = score(a), [be, bd] = score(b);
    return ae !== be ? ae - be : ad - bd;
  });
}
async function findFilesByName(rawQuery: string): Promise<string[]> {
  const { text, folderScope } = extractFolderScope(rawQuery);
  const q = cleanFileQuery(text).toLowerCase();
  const folders = folderScope ? [folderScope] : SEARCHABLE_FOLDERS;
  const matches: string[] = [];
  for (const folderKey of folders) {
    const root = app.getPath(folderKey);
    const files = await walkFiles(root, 2);
    for (const f of files) if (path.basename(f).toLowerCase().includes(q)) matches.push(f);
  }
  return rankFileMatches(matches, q);
}
function isAmbiguousTop(matches: string[], query: string): boolean {
  if (matches.length < 2) return false;
  const ranked = rankFileMatches(matches, query);
  const topBase = path.basename(ranked[0]).toLowerCase();
  const secondBase = path.basename(ranked[1]).toLowerCase();
  const topDepth = ranked[0].split(path.sep).length;
  const secondDepth = ranked[1].split(path.sep).length;
  return topBase === secondBase && topDepth === secondDepth;
}
async function trySearchFiles(command: string): Promise<CommandRouteResult | null> {
  const c = command.toLowerCase();
  if (/vault|evidence|knowledge base/.test(c)) return null;
  const m = c.match(/\b(?:find|search)(?:\s+for)?\s+(.+?)(?:\s+in\s+my\s+files)?$/i);
  if (!m) return null;
  const scoped = extractFolderScope(m[1]);
  const query = cleanFileQuery(scoped.text);
  if (!query || query.length < 2) return null;
  const matches = await findFilesByName(m[1]);
  const scopeLabel = scoped.folderScope ? `your ${scoped.folderScope} folder` : 'Desktop, Documents, Downloads and Pictures';
  await logAudit('automation', 'file_search', query, `Searched ${scopeLabel} for "${query}" and found ${matches.length} match(es). Search was read-only.`, 'low');
  if (matches.length === 0) return { intent: 'file_search', confidence: 0.85, summary: `I couldn't find any file matching "${query}" in ${scopeLabel}.`, actionTaken: `Searched for: ${query}` };
  const list = matches.slice(0, 8).map(p => `• ${p}`).join('\n');
  return { intent: 'file_search', confidence: 0.9, summary: `Found ${matches.length} file(s) matching "${query}":\n${list}`, actionTaken: `Searched for: ${query}`, extra: matches };
}
type LastFileAction = { type: 'delete' | 'move' | 'rename'; from: string; to: string; label: string };

// A single candidate match returned to the renderer so it can send back a clarification
export type RealFileMatch = { path: string; name: string };
// Pending clarification payload stored in the renderer, forwarded on next submission
export type PendingClarification = {
  intent: 'delete' | 'rename';
  candidates: RealFileMatch[];
  newName?: string; // for rename only
};
let fileActionHistory: LastFileAction[] = [];
function lunaTrashDir() { return path.join(app.getPath('userData'), 'luna-trash'); }
function lunaTrashFolder() { return path.join(demoRoot(), 'trash'); }
async function softTrash(filePath: string): Promise<string> {
  await fs.mkdir(lunaTrashDir(), { recursive: true });
  const dest = path.join(lunaTrashDir(), `${Date.now()}-${path.basename(filePath)}`);
  await fs.rename(filePath, dest);
  return dest;
}
// ── Direct-execution helpers (used by routeCommandWithContext) ─────────────

async function deleteRealFileToTrash(filePath: string): Promise<CommandRouteResult> {
  try {
    await ensureDir(lunaTrashFolder());
    const missionId = `delete_${Date.now()}_${crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 8)}`;
    const trashedName = `${missionId}_${path.basename(filePath)}`;
    const trashedPath = path.join(lunaTrashFolder(), trashedName);
    await fs.rename(filePath, trashedPath);

    // Write a typed manifest so listUndoableActions + undoMission can handle it
    const manifest = {
      missionId,
      type: 'delete' as const,
      createdAt: new Date().toISOString(),
      description: `Deleted ${path.basename(filePath)}`,
      originalPath: filePath,
      trashedPath,
    };
    await ensureDir(manifestsRoot());
    await writeText(path.join(manifestsRoot(), `${missionId}.json`), JSON.stringify(manifest, null, 2));

    fileActionHistory.push({ type: 'delete', from: filePath, to: trashedPath, label: `deleted ${path.basename(filePath)}` });
    await logAudit('automation', 'file_delete', filePath, `Moved "${filePath}" to Luna trash folder. Manifest saved. Reversible via undo.`, 'medium');
    return { intent: 'file_delete', confidence: 0.95, summary: `Moved "${path.basename(filePath)}" to Luna's trash. Say "undo" any time to restore it.`, actionTaken: `Trashed file: ${filePath}`, extra: { missionId } };
  } catch (e: any) {
    await logAudit('automation', 'file_delete_failed', filePath, e?.message || String(e), 'medium');
    return { intent: 'file_delete', confidence: 0.8, summary: `Found the file but couldn't delete it: ${e?.message || e}.`, actionTaken: `Attempted delete: ${filePath}` };
  }
}

async function moveOrRenameRealFile(source: string, destQuery: string, isRename: boolean): Promise<CommandRouteResult> {
  try {
    if (isRename) {
      const newName = path.basename(destQuery.trim());
      const dest = path.join(path.dirname(source), newName);
      await fs.rename(source, dest);

      const missionId = `rename_${Date.now()}_${crypto.createHash('sha1').update(source).digest('hex').slice(0, 8)}`;
      const manifest = { missionId, type: 'rename' as const, createdAt: new Date().toISOString(), description: `Renamed ${path.basename(source)} → ${newName}`, from: source, to: dest };
      await ensureDir(manifestsRoot());
      await writeText(path.join(manifestsRoot(), `${missionId}.json`), JSON.stringify(manifest, null, 2));

      fileActionHistory.push({ type: 'rename', from: source, to: dest, label: `renamed ${path.basename(source)} to ${newName}` });
      await logAudit('automation', 'file_rename', source, `Renamed "${source}" to "${newName}". Say "undo" to reverse it.`, 'low');
      return { intent: 'file_rename', confidence: 0.95, summary: `Renamed "${path.basename(source)}" to "${newName}". Say "undo" to reverse it.`, actionTaken: `Renamed file to: ${newName}`, extra: { missionId } };
    } else {
      const folderKey = Object.keys(KNOWN_FOLDERS).sort((a, b) => b.length - a.length).find(name => destQuery.toLowerCase().includes(name));
      if (!folderKey) return { intent: 'file_move', confidence: 0.7, summary: `Didn't recognize the destination "${destQuery.trim()}". Try a folder like Desktop, Documents, Downloads, Pictures, Videos or Music.`, actionTaken: `Attempted move: ${path.basename(source)}` };
      const destDir = app.getPath(KNOWN_FOLDERS[folderKey]);
      const dest = path.join(destDir, path.basename(source));
      try { await fs.rename(source, dest); } catch { await fs.copyFile(source, dest); await fs.unlink(source); }

      const missionId = `move_${Date.now()}_${crypto.createHash('sha1').update(source).digest('hex').slice(0, 8)}`;
      const manifest = { missionId, type: 'move' as const, createdAt: new Date().toISOString(), description: `Moved ${path.basename(source)} to ${folderKey}`, from: source, to: dest };
      await ensureDir(manifestsRoot());
      await writeText(path.join(manifestsRoot(), `${missionId}.json`), JSON.stringify(manifest, null, 2));

      fileActionHistory.push({ type: 'move', from: source, to: dest, label: `moved ${path.basename(source)} to ${folderKey}` });
      await logAudit('automation', 'file_move', source, `Moved "${source}" to "${dest}". Say "undo" to reverse it.`, 'low');
      return { intent: 'file_move', confidence: 0.95, summary: `Moved "${path.basename(source)}" to your ${folderKey} folder. Say "undo" to reverse it.`, actionTaken: `Moved file to: ${folderKey}`, extra: { missionId } };
    }
  } catch (e: any) {
    await logAudit('automation', isRename ? 'file_rename_failed' : 'file_move_failed', source, e?.message || String(e), 'low');
    return { intent: isRename ? 'file_rename' : 'file_move', confidence: 0.8, summary: `Found the file but the operation failed: ${e?.message || e}.`, actionTaken: `Attempted ${isRename ? 'rename' : 'move'}: ${path.basename(source)}` };
  }
}

// Resolve a clarification reply against a known candidate list.
// Returns the matched file path, or null if still ambiguous, or undefined if unrelated.
function resolveAgainstCandidates(reply: string, candidates: RealFileMatch[]): string | null | undefined {
  const r = reply.trim().toLowerCase();

  // Ordinal phrases: "the first one", "first", "1", "the second", "2nd", etc.
  const ordinalWords: Record<string, number> = {
    'first': 0, '1st': 0, '1': 0, 'one': 0,
    'second': 1, '2nd': 1, '2': 1, 'two': 1,
    'third': 2, '3rd': 2, '3': 2, 'three': 2,
    'fourth': 3, '4th': 3, '4': 3, 'four': 3,
    'fifth': 4, '5th': 4, '5': 4, 'five': 4,
  };
  for (const [word, idx] of Object.entries(ordinalWords)) {
    if (new RegExp(`\\b${word}\\b`).test(r) && idx < candidates.length) {
      return candidates[idx].path;
    }
  }

  // Filename / path fragment match: check if reply contains part of any candidate name
  const hits = candidates.filter(c =>
    r.includes(c.name.toLowerCase()) ||
    r.includes(path.basename(c.path, path.extname(c.path)).toLowerCase())
  );
  if (hits.length === 1) return hits[0].path;
  if (hits.length > 1) return null; // still ambiguous

  // No match at all — treat reply as unrelated
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────

async function undoLastFileAction(): Promise<{ ok: boolean; message: string }> {
  const action = fileActionHistory.pop();
  if (!action) return { ok: false, message: 'There is no recent file action to undo.' };
  const { from, to, label } = action;
  try {
    await fs.rename(to, from);
    await logAudit('automation', 'file_action_undo', from, `Reversed previous action ("${label}"), restoring "${from}". ${fileActionHistory.length} earlier action(s) remain undoable.`, 'low');
    const remaining = fileActionHistory.length;
    return { ok: true, message: `Undid it — restored "${path.basename(from)}".${remaining > 0 ? ` You have ${remaining} earlier action${remaining === 1 ? '' : 's'} you can still undo one at a time, or say "restore everything" to reverse all of them.` : ''}` };
  } catch (e: any) {
    fileActionHistory.push(action);
    return { ok: false, message: `Couldn't undo: ${e?.message || e}` };
  }
}
async function restoreAllFileActions(): Promise<{ ok: boolean; message: string }> {
  if (fileActionHistory.length === 0) return { ok: false, message: 'There is nothing tracked to restore — no file actions since Luna started.' };
  const total = fileActionHistory.length;
  let restored = 0;
  const failures: string[] = [];
  while (fileActionHistory.length > 0) {
    const action = fileActionHistory.pop()!;
    try {
      await fs.rename(action.to, action.from);
      restored++;
    } catch (e: any) {
      failures.push(`${path.basename(action.from)}: ${e?.message || e}`);
    }
  }
  await logAudit('automation', 'file_action_restore_all', lunaTrashDir(), `Restored ${restored} of ${total} tracked file action(s) in one bulk undo.`, 'low');
  const failureNote = failures.length ? ` ${failures.length} couldn't be restored: ${failures.join('; ')}.` : '';
  return { ok: failures.length === 0, message: `Restored ${restored} of ${total} recent file action(s) back to their original state.${failureNote}` };
}
async function tryDeleteFile(command: string): Promise<CommandRouteResult | null> {
  const c = command.toLowerCase();
  const m = c.match(/\b(?:delete|remove|trash)\s+(.+)/i);
  if (!m) return null;
  const scoped = extractFolderScope(m[1]);
  const query = cleanFileQuery(scoped.text);
  if (!query) return null;
  const matches = await findFilesByName(m[1]);
  const scopeLabel = scoped.folderScope ? `your ${scoped.folderScope} folder` : 'Desktop, Documents, Downloads or Pictures folders';
  if (matches.length === 0) {
    return { intent: 'file_delete', confidence: 0.8, summary: `I couldn't find a file matching "${query}" in ${scopeLabel}, so nothing was deleted.`, actionTaken: `Attempted delete: ${query}` };
  }
  if (isAmbiguousTop(matches, query)) {
    const topMatches = matches.slice(0, 5);
    const list = topMatches.map(p => `• ${p}`).join('\n');
    const candidates: RealFileMatch[] = topMatches.map(p => ({ path: p, name: path.basename(p) }));
    return {
      intent: 'file_delete', confidence: 0.6,
      summary: `I found more than one file matching "${query}" and I'm not confident which one you mean, so I didn't delete anything:\n${list}\nWhich one did you mean? You can say "the first one", "the second one", or part of the filename.`,
      actionTaken: `Ambiguous delete: ${query}`,
      extra: { pendingClarification: { intent: 'delete', candidates } satisfies PendingClarification }
    };
  }
  const target = matches[0];
  return deleteRealFileToTrash(target);
}
async function tryRestoreAll(command: string): Promise<CommandRouteResult | null> {
  if (!/\b(restore everything|undo everything|undo all|restore all)\b/i.test(command)) return null;
  const result = await restoreAllFileActions();
  return { intent: 'file_restore_all', confidence: 0.9, summary: result.message, actionTaken: result.ok ? 'Restored all tracked file actions' : 'Bulk restore incomplete or nothing to restore' };
}
async function tryUndoFileAction(command: string): Promise<CommandRouteResult | null> {
  if (!/\bundo\b/i.test(command)) return null;
  const result = await undoLastFileAction();
  return { intent: 'file_undo', confidence: 0.9, summary: result.message, actionTaken: result.ok ? 'Undid last file action' : 'Undo failed' };
}
async function tryMoveOrRename(command: string): Promise<CommandRouteResult | null> {
  const c = command.toLowerCase();
  const renameMatch = c.match(/\brename\s+(.+?)\s+to\s+(.+)/i);
  const moveMatch = !renameMatch ? c.match(/\bmove\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+folder)?$/i) : null;
  if (!renameMatch && !moveMatch) return null;
  const [, sourceQuery, destQuery] = (renameMatch || moveMatch)!;
  const cleanedSource = cleanFileQuery(extractFolderScope(sourceQuery).text);
  const matches = await findFilesByName(sourceQuery);
  if (matches.length === 0) {
    return { intent: renameMatch ? 'file_rename' : 'file_move', confidence: 0.8, summary: `I couldn't find a file matching "${cleanedSource}" to ${renameMatch ? 'rename' : 'move'}.`, actionTaken: `Attempted ${renameMatch ? 'rename' : 'move'}: ${cleanedSource}` };
  }
  if (isAmbiguousTop(matches, cleanedSource)) {
    const topMatches = matches.slice(0, 5);
    const list = topMatches.map(p => `• ${p}`).join('\n');
    const candidates: RealFileMatch[] = topMatches.map(p => ({ path: p, name: path.basename(p) }));
    const pendingClarification: PendingClarification = renameMatch
      ? { intent: 'rename', candidates, newName: destQuery.trim() }
      : { intent: 'rename', candidates }; // move uses 'rename' intent key but newName carries the dest
    // For move, store destQuery so we can resume it
    if (!renameMatch) pendingClarification.newName = destQuery.trim();
    return {
      intent: renameMatch ? 'file_rename' : 'file_move', confidence: 0.6,
      summary: `I found more than one file matching "${cleanedSource}" and I'm not confident which one you mean, so I didn't ${renameMatch ? 'rename' : 'move'} anything:\n${list}\nWhich one did you mean? You can say "the first one", "the second one", or part of the filename.`,
      actionTaken: `Ambiguous ${renameMatch ? 'rename' : 'move'}: ${cleanedSource}`,
      extra: { pendingClarification }
    };
  }
  const source = matches[0];
  return moveOrRenameRealFile(source, destQuery.trim(), !!renameMatch);
}
async function tryOpenFolder(command: string): Promise<CommandRouteResult | null> {
  const c = command.toLowerCase();
  if (!/\b(open|show|launch|go to)\b/.test(c)) return null;
  const matchKey = Object.keys(KNOWN_FOLDERS).sort((a, b) => b.length - a.length).find(name => c.includes(name));
  if (!matchKey) return null;
  const folderPath = app.getPath(KNOWN_FOLDERS[matchKey]);
  const err = await shell.openPath(folderPath);
  if (!err) {
    await logAudit('automation', 'folder_open', matchKey, `Opened the local ${matchKey} folder (${folderPath}) in File Explorer. No confirmation was required because opening a folder is read-only and reversible.`, 'low');
    return { intent: 'folder_open', confidence: 0.9, summary: `Opened your ${matchKey} folder in File Explorer.`, actionTaken: `Opened local folder: ${matchKey}` };
  }
  await logAudit('automation', 'folder_open_failed', matchKey, err, 'low');
  return { intent: 'folder_open', confidence: 0.9, summary: `I tried to open your ${matchKey} folder but it failed: ${err}.`, actionTaken: `Attempted to open folder: ${matchKey}` };
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
async function routeCommandWithContext(command: string, pending: PendingClarification | null): Promise<CommandRouteResult & { pendingClarification?: PendingClarification | null }> {
  if (!pending) return routeCommand(command);

  const resolved = resolveAgainstCandidates(command, pending.candidates);

  // undefined = unrelated command — fall through to normal routing, clear pending
  if (resolved === undefined) {
    return routeCommand(command);
  }

  // null = still ambiguous after narrowing — ask again with same candidates
  if (resolved === null) {
    const list = pending.candidates.map((c, i) => `${i + 1}. ${c.path}`).join('\n');
    return {
      intent: pending.intent === 'delete' ? 'file_delete' : 'file_rename',
      confidence: 0.5,
      summary: `Still not sure which one you mean. Here are the options again:\n${list}\nTry saying "the first one", "the second one", or part of the filename.`,
      actionTaken: 'Awaiting clarification',
      extra: { pendingClarification: pending }
    };
  }

  // Resolved to exactly one file — execute the original action
  if (pending.intent === 'delete') {
    return deleteRealFileToTrash(resolved);
  } else {
    // rename or move — newName carries the destination
    const isMove = !!(pending.newName && Object.keys(KNOWN_FOLDERS).some(k => pending.newName!.toLowerCase().includes(k)));
    return moveOrRenameRealFile(resolved, pending.newName || '', !isMove);
  }
}

async function routeCommand(command: string): Promise<CommandRouteResult> {
  const restoreAll = await tryRestoreAll(command);
  if (restoreAll) return restoreAll;
  const undo = await tryUndoFileAction(command);
  if (undo) return undo;
  const moveOrRename = await tryMoveOrRename(command);
  if (moveOrRename) return moveOrRename;
  const deleteFile = await tryDeleteFile(command);
  if (deleteFile) return deleteFile;
  const folderOpen = await tryOpenFolder(command);
  if (folderOpen) return folderOpen;
  const appLaunch = await tryLaunchApp(command);
  if (appLaunch) return appLaunch;
  const fileSearch = await trySearchFiles(command);
  if (fileSearch) return fileSearch;
  const c = command.toLowerCase();
  if (/codebase|repository|repo|architecture|explain code/.test(c)) {
    const r = await runSkill('explain_codebase_architecture');
    return { intent: 'explain_codebase_architecture', confidence: 0.9, summary: `Completed skill run: ${r.skill.name}`, actionTaken: `Executed skill: ${r.skill.name}`, artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/meeting|transcript|follow.?up|action items/.test(c)) {
    const r = await runSkill('summarize_meeting_transcript');
    return { intent: 'summarize_meeting_transcript', confidence: 0.88, summary: `Completed skill run: ${r.skill.name}`, actionTaken: `Executed skill: ${r.skill.name}`, artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/invoice|receipt|expense/.test(c)) {
    const r = await runSkill('extract_invoice_data');
    return { intent: 'extract_invoice_data', confidence: 0.88, summary: `Completed skill run: ${r.skill.name}`, actionTaken: `Executed skill: ${r.skill.name}`, artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/study|flashcard|quiz/.test(c)) {
    const r = await runSkill('generate_study_pack');
    return { intent: 'generate_study_pack', confidence: 0.86, summary: `Completed skill run: ${r.skill.name}`, actionTaken: `Executed skill: ${r.skill.name}`, artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/attach|attachment|uploaded file|summarize files|summarize attachments/.test(c)) {
    const r = await summarizeAttachments();
    return { intent: 'attachment_summary', confidence: 0.87, summary: r.summary, actionTaken: 'Summarized imported attachments', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/job|resume|cover letter|application|interview/.test(c)) {
    const r = await runSkill('analyze_resume_fit');
    return { intent: 'analyze_resume_fit', confidence: 0.93, summary: `Completed skill run: ${r.skill.name}`, actionTaken: `Executed skill: ${r.skill.name}`, artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/presentation|pptx|slides|deck|research/.test(c)) {
    const r = await runResearchMission();
    return { intent: 'research_to_presentation', confidence: 0.91, summary: r.summary, actionTaken: 'Ran Research-to-Presentation in Artifact Studio', artifacts: r.artifacts, trace: r.trace, privacy: r.privacy };
  }
  if (/organize|clean|cleanup|downloads|files/.test(c)) {
    const plan = await planFolderCleanup(app.getPath('downloads'));
    return { intent: 'safe_file_cleanup_plan', confidence: 0.88, summary: `Prepared a safe cleanup plan for ${plan.moves.length} files in your Downloads folder. Luna did not move anything yet; approval is required in Automation.`, actionTaken: 'Generated cleanup preview only', plan, trace: [{ time: now(), title: 'Generated cleanup plan', detail: `${plan.moves.length} file moves proposed; risk ${plan.risk}; undo manifest will be created on execution.` }] };
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

// ─── Chat Sessions ────────────────────────────────────────────────────────────

export type ChatSessionRow = { id: string; title: string; created_at: string; updated_at: string };
export type ChatMessageRow = { id: string; session_id: string; role: string; content: string; meta: string | null; created_at: string };

function listChatSessions(): ChatSessionRow[] {
  return getDb().prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all() as ChatSessionRow[];
}

function createChatSession(): string {
  const id = crypto.randomUUID?.() || crypto.createHash('sha1').update(Date.now() + Math.random().toString()).digest('hex').slice(0, 16);
  const ts = new Date().toISOString();
  getDb().prepare('INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, '', ts, ts);
  return id;
}

function getChatMessages(sessionId: string): ChatMessageRow[] {
  return getDb().prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as ChatMessageRow[];
}

function appendChatMessage(sessionId: string, role: string, content: string, meta: string | null = null): ChatMessageRow {
  const id = crypto.randomUUID?.() || crypto.createHash('sha1').update(sessionId + role + Date.now()).digest('hex').slice(0, 16);
  const ts = new Date().toISOString();
  getDb().prepare('INSERT INTO chat_messages (id, session_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, role, content, meta ?? null, ts);
  getDb().prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(ts, sessionId);
  return { id, session_id: sessionId, role, content, meta: meta ?? null, created_at: ts };
}

async function renameChatSessionIfUntitled(sessionId: string, firstUserMessage: string): Promise<void> {
  const row = getDb().prepare('SELECT title FROM chat_sessions WHERE id = ?').get(sessionId) as { title: string } | undefined;
  if (!row || row.title) return; // already titled
  let title = '';
  try {
    const res = await chat([{
      role: 'user',
      content: `Generate a short chat title (3–6 words, no punctuation) summarizing this message: "${firstUserMessage.slice(0, 280)}"`
    }]);
    title = res.text.trim().replace(/^["']|["']$/g, '').slice(0, 60);
  } catch {
    title = firstUserMessage.slice(0, 40).trim();
  }
  if (!title) title = firstUserMessage.slice(0, 40).trim();
  getDb().prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, new Date().toISOString(), sessionId);
}

function deleteChatSession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}
async function renderOrbWindowHtml() {
  const settings = await getSettings();
  const assistantName = escapeHtml(settings.assistantName || 'Luna');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;font-family:Inter,Segoe UI,sans-serif;user-select:none}
    .wrap{width:100%;height:100%;display:grid;place-items:center;-webkit-app-region:drag;position:relative;padding:24px 24px 36px;box-sizing:border-box}
    .wrap::before{content:'';position:absolute;inset:18px;border:1px solid rgba(255,255,255,.18);border-radius:999px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05),0 0 0 1px rgba(255,255,255,.03);pointer-events:none}
    .wrap:hover{cursor:grab}
    .wrap:active{cursor:grabbing}
    button{width:78px;height:78px;border-radius:999px;border:1px solid rgba(255,255,255,.55);color:white;cursor:pointer;-webkit-app-region:no-drag;background:radial-gradient(circle at 30% 24%,#fff 0,#c4b5fd 18%,#8b5cf6 47%,#111827 100%);box-shadow:0 0 36px rgba(139,92,246,.85),0 18px 50px rgba(0,0,0,.5);display:grid;place-items:center;position:relative;animation:pulse 2.2s ease-in-out infinite;transition:transform .2s ease}
    button:after{content:'${assistantName}';position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:800;text-shadow:0 2px 8px #000;color:#eef2ff;letter-spacing:.3px}
    svg{filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))}
    @keyframes pulse{0%,100%{transform:scale(1);box-shadow:0 0 30px rgba(139,92,246,.75),0 18px 50px rgba(0,0,0,.5)}50%{transform:scale(1.05);box-shadow:0 0 48px rgba(6,182,212,.75),0 18px 50px rgba(0,0,0,.5)}}
  </style></head><body><div class="wrap"><button id="orb" title="Open ${assistantName}"><svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 2.3 8.7 8.1 3 9.3l5.7 1.2 1.2 5.7 1.2-5.7 5.7-1.2-5.7-1.2-1.2-5.8Z"/><path d="M19 13l-.7 3.1-3.1.7 3.1.7.7 3.1.7-3.1 3.1-.7-3.1-.7L19 13Z"/></svg></button></div><script>document.getElementById('orb').addEventListener('click',()=>window.luna.openMainCommandPalette());</script></body></html>`;
}
async function refreshOrbWindow() {
  if (!orbWindow || orbWindow.isDestroyed()) return;
  const html = await renderOrbWindowHtml();
  await orbWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}
async function createOrbWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  orbWindow = new BrowserWindow({
    width: 150,
    height: 180,
    x: Math.max(20, width - 170),
    y: Math.max(20, height - 200),
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
  await refreshOrbWindow();
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

  ipcMain.handle('studio:research-presentation', runResearchMission);
  ipcMain.handle('skill:generate', (_e, description: string) => generateSkill(description));
  ipcMain.handle('skill:save', (_e, skill: LunaSkill) => saveSkill(skill));
  ipcMain.handle('skills:delete', (_e, skillId: string) => deleteSkill(skillId));
  ipcMain.handle('skill:list', listSkills);
  ipcMain.handle('skill:run', (_e, skillId: string, inputValues?: Record<string, any>) => runSkill(skillId, inputValues));
  ipcMain.handle('dialog:open-file', async (_e, accept?: string[]) => {
    const filters: any[] = [];
    if (accept && accept.length) {
      const extensions = accept.map(ext => ext.replace(/^\./, ''));
      filters.push({ name: 'Supported files', extensions });
    }
    filters.push({ name: 'All Files', extensions: ['*'] });
    const res = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });
  ipcMain.handle('dialog:open-folder', async (_e) => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });
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
  ipcMain.handle('automation:plan-cleanup', (_e, folderPath: string) => planFolderCleanup(folderPath));
  ipcMain.handle('automation:execute-cleanup', (_e, plan) => executeCleanup(plan));
  ipcMain.handle('automation:undo', (_e, missionId) => undoMission(missionId));
  ipcMain.handle('automation:list-undoable', () => listUndoableActions());
  ipcMain.handle('automation:undo-all', () => undoAllPending());
  ipcMain.handle('automation:restore-from-trash', (_e, missionId: string) => restoreFromTrash(missionId));
  ipcMain.handle('network:log', () => ({ ...networkLog }));
  ipcMain.handle('resources:get', getResources);
  ipcMain.handle('model:recommend', recommendModel);
  ipcMain.handle('model:benchmark', benchmarkModels);
  ipcMain.handle('model:fallback-drill', fallbackDrill);
  ipcMain.handle('lens:context', captureLensContext);
  ipcMain.handle('lens:import-image', importLensImage);
  ipcMain.handle('lens:explain', (_e, snapshot: LensSnapshot) => explainLens(snapshot));
  ipcMain.handle('command:route', (_e, command: string) => routeCommand(command));
  ipcMain.handle('command:route-with-context', (_e, command: string, pending: PendingClarification | null) => routeCommandWithContext(command, pending));
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
  ipcMain.handle('shell:reveal', async (_e, p: string) => {
    if (await exists(p)) {
      shell.showItemInFolder(p);
    } else {
      throw new Error('This manifest no longer exists');
    }
  });
  ipcMain.handle('chat:list-sessions', () => listChatSessions());
  ipcMain.handle('chat:create-session', () => createChatSession());
  ipcMain.handle('chat:get-messages', (_e, sessionId: string) => getChatMessages(sessionId));
  ipcMain.handle('chat:append-message', (_e, sessionId: string, role: string, content: string, meta: string | null) => appendChatMessage(sessionId, role, content, meta));
  ipcMain.handle('chat:rename-session', (_e, sessionId: string, firstUserMessage: string) => renameChatSessionIfUntitled(sessionId, firstUserMessage));
  ipcMain.handle('chat:delete-session', (_e, sessionId: string) => { deleteChatSession(sessionId); });
  await createWindow();
  await createOrbWindow();
  globalShortcut.register('CommandOrControl+Shift+L', () => { openMainCommandPalette().catch(() => {}); });
  app.on('activate', async () => { if (!mainWindow || mainWindow.isDestroyed()) await createWindow(); if (!orbWindow || orbWindow.isDestroyed()) await createOrbWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
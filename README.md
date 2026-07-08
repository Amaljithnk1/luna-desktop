# Luna — Local AI Desktop Companion

Luna is a Windows-first desktop AI assistant that acts as a private local AI operating layer for your computer. It combines conversation, local context, memory, document understanding, artifact generation, safe desktop automation, reusable skills, voice/command access, and privacy forensics into one runnable desktop app — fully offline-capable.

## Highlights

- **Guided Demo** — One-click end-to-end proof path: privacy proof, skills, artifact generation, evidence Q&A, reversible automation, skill creation, and adaptive memory.
- **Always-on-top Luna Orb** companion window with global shortcut `Ctrl/Cmd + Shift + L`
- **Intent-based Command Router** — natural-language command palette that routes to skills, vault, lens, automation, or model inspector.
- **Local Ollama chat** with transparent fallback mode when Ollama is unavailable.
- **Skill Creator** — Generate, save, and run reusable local workflows from plain English. Built-in default skills:
  - Summarize My Files
  - Analyze Resume Fit
  - Summarize Meeting Transcript
  - Extract Invoice Data
  - Generate Study Pack
  - Explain Codebase Architecture
  - Research to Presentation
- **Knowledge Vault** — Local RAG layer: index PDF/DOCX/TXT/MD/CSV/JSON files, search with embeddings (when available) or keyword fallback, and ask questions with evidence.
- **Personal Memory** with adaptive context — stores reviewable local memories, retrieves relevant ones into prompts.
- **Artifact Generation** — Export to PDF, DOCX, PPTX, HTML, Markdown, CSV, JSON, ICS, and ZIP — all generated locally.
- **Luna Lens** — Permission-bounded desktop context capture (active window, running apps) with optional manual screenshot/image OCR.
- **Safe File Automation** — Preview file cleanup plans, approve with permission, full undo via manifests.
- **Trust Center** — External network counter, audit log, SQLite database status, trust data export, and full data reset.
- **Luna Voice** — Push-to-talk with on-device transcription via open Whisper model (one-time ~75MB download, fully offline after).
- **SQLite-backed data layer** for audit, memory, vault, skills, chat sessions, and settings metadata.

## Run locally

```bash
npm install
npm run dev
```

## Optional local model setup

Install [Ollama](https://ollama.com), then run:

```bash
ollama serve
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```

Alternative chat models:

```bash
ollama pull llama3.2:3b
ollama pull phi3:mini
```

If Ollama is not available, Luna still runs using transparent fallback mode.

## Build

Production build:

```bash
npm run build
```

Windows installer/portable build on Windows:

```bash
npm run dist
```

Linux/macOS smoke-test for unpacked Windows output:

```bash
npm run dist:win-dir
```

Output appears under:

```txt
release/
```

## Unsigned Windows build note

This development build is not code-signed. Windows SmartScreen may show:

```txt
Windows protected your PC
```

Choose:

```txt
More info → Run anyway
```

This is expected for unsigned Electron development builds.

## Recommended demo path

Fastest option:

1. Open Luna.
2. Complete or skip onboarding.
3. Click **Guided Demo** in the sidebar and click **Run full showcase**.
4. End in **Trust Center** to show audit logs, SQLite status, data export and reset controls.

Manual path:

1. Show the top proof strip: model/fallback status, external request counter, CPU/RAM.
2. Click the always-on-top Luna Orb or press `Ctrl/Cmd + Shift + L`.
3. Try: `Create a presentation from my local research notes`.
4. Open **Skill Creator** and run a built-in skill like **Summarize My Files** or **Extract Invoice Data**.
5. Go to **Knowledge Vault**, index demo docs, and ask a question with evidence.
6. Run **Automation** to preview file cleanup, approve, then undo.
7. Explore **Luna Lens**, **Memory**, and **Trust Center**.

## Demo assets

Sample files are included under `demo-assets/`:

- `demo_user_resume.docx`
- `job_description.txt`
- `portfolio_notes.md`
- `local_ai_research.pdf`
- `meeting_transcript.txt`
- `invoice_demo_electronics.txt`
- `luna_ocr_demo.png`

These are included in packaged builds as extra resources.

## Main sections

- Guided Demo
- Capabilities
- Chat
- Voice
- Luna Lens
- Knowledge Vault
- Memory
- Automation
- Skill Creator
- Trust Center
- Settings
- Help

## Architecture

Luna is structured as an Electron app with two layers:

- **Backend (main process, `src/electron/main.ts`)**: All file I/O, document extraction (PDF/DOCX/TXT/OCR via pdf-parse, mammoth, tesseract.js), AI inference (Ollama or fallback), SQLite storage, file automation, skill execution, and IPC handlers. This is the only process with filesystem and network access.
- **Preload bridge (`src/electron/preload.cts`)**: Exposes a typed API surface (`window.luna.*`) to the renderer via `contextBridge` — no direct Node.js access in the renderer.
- **Renderer (`src/renderer/main.tsx`)**: React single-page app with sidebar navigation, chat sessions, command palette, voice UI, and all visual components. Communicates exclusively through the preload bridge.

Key backend utilities that serve multiple features:

- `readDocumentAny()` — Generic file reader supporting `.txt`, `.md`, `.csv`, `.json`, `.log`, `.pdf`, `.docx`
- `ocrImage()` — Tesseract.js OCR for images
- `importAttachments()` — File copy + extraction pipeline for imported files
- `readAttachments()` / `writeAttachments()` — JSON-backed metadata store for imported file paths (used by Skill Creator's quick-select picker)

## Data and privacy

Luna stores local app data inside its local workspace (`demo-workspace/`), including:

- `luna.db` — SQLite database with audit events, memories, vault docs/chunks, skills, settings, chat sessions, artifacts
- `audit-log.json` — Flat audit log
- `memory.json` — Personal memories
- `vault.json` — Knowledge Vault chunks and embeddings
- `skills.json` — Saved skills
- `settings.json` — User preferences
- `attachments.json` — Imported file metadata
- `lens-snapshots.json` — Luna Lens history
- `artifacts/` — Generated PDF, DOCX, PPTX, HTML, MD, ZIP files
- `manifests/` — Undo manifests for file automation
- `attachments/` — Copies of imported files

Trust Center lets the user inspect all activity, export a complete trust/audit package as ZIP, and reset all local data.

## QA and release commands

Preflight check:

```bash
npm run preflight
```

IPC consistency check:

```bash
npm run ipc-check
```

Create support bundle:

```bash
npm run bundle:submission
```

Windows release helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows-release.ps1
```

## Notes

- No paid APIs are required.
- Ollama is optional but recommended for the best local AI experience.
- `nomic-embed-text` is recommended for semantic retrieval.
- If an embedding model is missing, Luna uses keyword fallback.
- If speech recognition is unavailable, Voice mode still works through transcript mode.
- Imported files are copied into Luna's local workspace; the Skill Creator's input picker can quick-select previously imported files or browse for new ones.

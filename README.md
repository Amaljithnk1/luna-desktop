# Luna — Local AI Desktop Layer

Luna is a Windows-first desktop AI assistant that acts as a private local AI operating layer for the user's computer.

It is designed to combine conversation, local context, memory, document understanding, artifact generation, safe desktop automation, reusable skills, voice/command access, and privacy forensics into one runnable desktop app.

## Highlights

- AI Demo Presenter Mode with narration, tab switching, autoplay and optional speech
- Guided Judge Showcase mode for a one-click product walkthrough
- Always-on-top Luna Orb companion window
- Command Palette with global shortcut `Ctrl/Cmd + Shift + L`
- Intent-based Command Router
- Local Ollama chat with transparent fallback mode
- SQLite-backed data layer for audit, memory, vault, skills and settings metadata
- Onboarding and Settings
- Luna Voice with push-to-talk/transcript command mode
- Unified Attachments for PDF/DOCX/TXT/MD/CSV/JSON/images with OCR support
- Mission Hub: Meeting Notes, Invoice/Expense, Study Pack and Codebase Explainer
- Job Application Mission using imported resume/JD/portfolio attachments when available
- Artifact Studio for Research-to-Presentation exports
- Knowledge Vault with embedding retrieval when available and keyword fallback
- Personal Memory with adaptive context
- Luna Lens for bounded desktop context and manual screenshot/image OCR
- Safe file cleanup with preview, permission approval, manifest logging and full undo
- Luna Skill Creator for reusable local workflows
- Model Inspector with recommendation, benchmark and fallback drill
- Trust Center with audit log, network counter, SQLite status, trust export and reset controls

## Run locally

```bash
npm install
npm run dev
```

## Optional local model setup

Install Ollama, then run:

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
3. Click **AI Presenter** in the sidebar.
4. Use **Auto play all** or run each step manually.
5. End in **Trust Center** to show audit logs, SQLite status, data export and reset controls.

Manual path:

1. Show the top proof strip: model/fallback status, external request counter, CPU/RAM.
2. Click the always-on-top Luna Orb or press `Ctrl/Cmd + Shift + L`.
3. Run: `Create a presentation from my local research notes`.
4. Go to **Attachments** and import demo files or user files.
5. Run **Job Mission** to generate PDF/DOCX/ZIP.
6. Run **Artifact Studio** to generate PPTX/PDF/HTML/ZIP.
7. Run **Automation** to preview file moves, approve, then undo.
8. Show **Knowledge Vault** evidence-based Q&A.
9. Show **Luna Skill Creator** and **Mission Hub**.
10. Close with **Trust Center**.

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

- Judge Showcase
- Capabilities
- Command
- Voice
- Attachments
- Mission Hub
- Job Mission
- Artifact Studio
- Luna Lens
- Knowledge Vault
- Memory
- Automation
- Model Inspector
- Trust Center
- Settings
- Help
- Luna Skill Creator

## Data and privacy

Luna stores local app data inside its local workspace, including:

- `luna.db`
- audit log
- memories
- vault chunks
- skills
- settings
- attachments metadata
- generated artifacts
- undo manifests

Trust Center lets the user inspect activity, export trust data, and reset local data.

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

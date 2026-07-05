# Luna Release Notes

## Version 0.1.0 — Hackathon MVP

### Added

- Local-first Electron desktop app
- Onboarding and Settings
- Always-on-top Luna Orb
- Global command palette
- AI Demo Presenter mode
- Judge Showcase mode
- Voice command/transcript mode
- Feminine voice preference where supported
- Unified Attachments system
- Job Application Mission
- Research-to-Presentation Artifact Studio
- Mission Hub
  - Meeting Notes
  - Invoice / Expense
  - Study Pack
  - Codebase Explainer
- Luna Lens
  - desktop context metadata
  - manual screenshot/image import
  - local OCR
- Knowledge Vault
  - document indexing
  - evidence cards
  - embedding retrieval when available
  - keyword fallback
- Personal Memory
  - memory search
  - adaptive context builder
  - memory toggle
- Safe file automation
  - preview
  - approval
  - manifest
  - full undo
- Luna Skill Creator
  - generate skill from plain English
  - save local skills
  - run built-in skills
- Model Inspector
  - model recommendation
  - benchmark
  - fallback drill
- Trust Center
  - external request counter
  - audit log
  - SQLite database status
  - trust export
  - delete/reset local data
- SQLite-backed data layer
- Demo assets pack
- App icon
- Install guide
- Demo script
- Pitch deck
- Submission checklist
- Preflight script
- IPC checker
- Windows release builder script

### Security / reliability

- Removed vulnerable optional `active-win` dependency
- `npm audit --omit=dev` reports 0 vulnerabilities
- Added UI error boundary
- Added orb/main-window recovery handling
- Added preflight and IPC validation

### Known notes

- Full `.exe` installer should be built on Windows using `npm run dist` or `scripts/build-windows-release.ps1`.
- The app is unsigned, so Windows SmartScreen may show a warning.
- Ollama is optional; Luna can run in transparent fallback mode.
- Semantic embeddings require an installed embedding model such as `nomic-embed-text`; otherwise Luna uses keyword fallback.

# Luna Document Index

Use this as the main navigation file for Luna’s documentation and submission materials.

## Product / developer docs

- `README.md` — main product/developer README
- `docs/ARCHITECTURE.md` — technical architecture
- `docs/FEATURE_MATRIX.md` — feature list grouped by area
- `docs/ONE_PAGE_PITCH.md` — concise product pitch
- `docs/FINAL_SUMMARY.md` — final product summary
- `docs/RELEASE_NOTES.md` — release notes for v0.1.0

## Demo docs

- `docs/DEMO_SCRIPT.md` — 5-minute demo script
- `docs/FINAL_DEMO_PROMPTS.md` — prompts to use during manual demo
- `docs/FINAL_QA_SHORTLIST.md` — final recording/submission QA checklist
- `docs/LUNA_PITCH_DECK.pptx` — optional pitch deck

## QA / engineering docs

- `docs/QA_REPORT.md` — QA status and manual checklist
- `docs/PREFLIGHT_REPORT.md` — automated preflight summary
- `docs/IPC_QA_REPORT.md` — IPC channel verification
- `docs/SECURITY_HARDENING.md` — dependency/security hardening notes

## Installation / release docs

- `docs/INSTALL_GUIDE.md` — setup and build instructions
- `submission/WINDOWS_RELEASE_INSTRUCTIONS.md` — Windows packaging instructions
- `scripts/build-windows-release.ps1` — Windows release builder
- `scripts/build-windows-release.bat` — Windows release builder launcher

## Submission docs

- `submission/SUBMISSION_CHECKLIST.md` — submission checklist
- `submission/FINAL_UPLOAD_PACKAGE.md` — final upload guide
- `submission/TELEGRAM_MESSAGE.md` — draft Telegram submission message

## Demo assets

- `demo-assets/README.md` — how to use demo assets
- `demo-assets/demo_user_resume.docx`
- `demo-assets/job_description.txt`
- `demo-assets/portfolio_notes.md`
- `demo-assets/local_ai_research.pdf`
- `demo-assets/meeting_transcript.txt`
- `demo-assets/invoice_demo_electronics.txt`
- `demo-assets/luna_ocr_demo.png`

## Useful commands

```bash
npm run dev
npm run build
npm run dist:win-dir
npm run preflight
npm run ipc-check
npm run bundle:submission
```

On Windows for final executable/installer:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows-release.ps1
```

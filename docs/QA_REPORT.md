# Luna QA Report

## Latest automated checks

Passed:

```bash
npm run build
npm run dist:win-dir
```

The unpacked Windows build succeeds and rebuilds native dependencies:

- `active-win`
- `better-sqlite3`

## Fix applied in QA pass

### Resilient Luna Orb / command palette

Issue found:

If the main Luna window was closed while the always-on-top orb stayed alive, clicking the orb could try to focus a destroyed `BrowserWindow`.

Fix:

- `mainWindow` is now cleared on close.
- `openMainCommandPalette()` recreates the main window if missing/destroyed.
- App activation recreates missing/destroyed main/orb windows.
- Global shortcut wraps async command-palette opening safely.

## Manual QA checklist

Run these before final recording/submission:

- [ ] Launch Luna from clean install
- [ ] Complete onboarding
- [ ] Click always-on-top Luna Orb
- [ ] Press `Ctrl/Cmd + Shift + L`
- [ ] Run AI Presenter one step at a time
- [ ] Run AI Presenter autoplay
- [ ] Run Judge Showcase
- [ ] Run Job Mission
- [ ] Run Artifact Studio
- [ ] Import attachments and summarize
- [ ] Add attachments to Vault
- [ ] Ask Vault with evidence
- [ ] Add/search/delete Memory
- [ ] Run Automation cleanup and undo
- [ ] Run Model Inspector benchmark/fallback drill
- [ ] Run Luna Lens context capture
- [ ] Run Voice transcript mode
- [ ] Run Mission Hub missions
- [ ] Generate/save/run Luna Skill Creator skill
- [ ] Export Trust data
- [ ] Delete/reset local data
- [ ] Close main window and reopen from orb
- [ ] Relaunch app and verify state loads

## Known packaging note

`npm run dist:win-dir` works in this Linux workspace.

For final `.exe`/installer, run on Windows:

```bash
npm install
npm run dist
```

Because this is unsigned, Windows SmartScreen may show a warning. The install guide explains this.

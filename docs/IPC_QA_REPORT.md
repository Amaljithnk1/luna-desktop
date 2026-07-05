# Luna IPC QA Report

## Command

```bash
npm run ipc-check
```

## Latest result

```txt
Luna IPC Check
============================================================
Renderer invoke channels: 47
Main handle channels:      47

✅ All exposed invoke channels have main handlers.
```

## Why this matters

Luna uses Electron IPC heavily. A missing handler would cause a runtime failure when a UI button calls the backend.

The IPC check parses:

- `ipcRenderer.invoke(...)` calls in `src/electron/preload.ts`
- `ipcMain.handle(...)` registrations in `src/electron/main.ts`

and fails if any exposed renderer command does not have a main-process handler.

## Preflight integration

`npm run preflight` now runs both:

```bash
node scripts/preflight.mjs
npm run ipc-check
```

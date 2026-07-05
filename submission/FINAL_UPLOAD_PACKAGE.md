# Final Upload Package

## Required upload

1. **Demo video** — 3–5 minutes
2. **Windows executable / installer** — generated on Windows using:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows-release.ps1
```

or:

```powershell
npm install
npm run dist
```

## Recommended optional attachments / links

- `docs/ONE_PAGE_PITCH.md`
- `docs/FEATURE_MATRIX.md`
- `docs/INSTALL_GUIDE.md`
- `docs/LUNA_PITCH_DECK.pptx`

## Suggested Telegram message

Use:

```txt
submission/TELEGRAM_MESSAGE.md
```

## Final demo video flow

Best option:

1. Open Luna
2. Complete/skip onboarding
3. Click **AI Presenter**
4. Run presenter steps
5. Show Trust Center at end
6. Mention offline/local/fallback behavior
7. Close with the one-line positioning

## One-line positioning

```txt
Luna is a private local AI operating layer for your desktop.
```

## SmartScreen note

Because this is an unsigned hackathon build, Windows may show:

```txt
Windows protected your PC
```

Tell judges/users:

```txt
Click More info → Run anyway
```

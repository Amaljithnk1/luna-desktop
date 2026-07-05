# Windows Release Instructions

Run these steps on a Windows machine for the final `.exe` / installer build.

## Option A: Automated script

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows-release.ps1
```

or double-click / run:

```bat
scripts\build-windows-release.bat
```

The script runs:

1. `npm install`
2. `npm run preflight`
3. `npm run build`
4. `npm run dist`
5. Creates `release/LUNA_RELEASE_MANIFEST.txt`

## Option B: Manual commands

```powershell
npm install
npm run preflight
npm run build
npm run dist
```

Release files appear in:

```txt
release/
```

## SmartScreen warning

This is an unsigned hackathon prototype. Windows may show:

```txt
Windows protected your PC
```

Click:

```txt
More info → Run anyway
```

## Recommended final upload contents

- `Luna-0.1.0-x64.exe` installer/portable from `release/`
- Demo video
- Optional: `docs/ONE_PAGE_PITCH.md`
- Optional: `docs/FEATURE_MATRIX.md`
- Optional: `docs/INSTALL_GUIDE.md`

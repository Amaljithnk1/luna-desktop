# Luna Security / Dependency Hardening

## Latest hardening pass

Removed the `active-win` dependency.

Reason:

- `npm audit --omit=dev` reported high-severity vulnerabilities through `active-win`'s dependency chain.
- Luna Lens can still operate through running-process context, manual screenshot/image import, OCR, and fallback active-window messaging.
- Removing the dependency reduces native packaging complexity and vulnerability noise.

## Current audit result

```bash
npm audit --omit=dev
```

Result:

```txt
found 0 vulnerabilities
```

## Build verification

Passed:

```bash
npm run build
npm run dist:win-dir
npm run preflight
```

## Current native dependency note

The unpacked Windows build now rebuilds only:

```txt
better-sqlite3
```

This is better than rebuilding both `active-win` and `better-sqlite3`.

## Luna Lens behavior after hardening

Luna Lens still supports:

- running app/process context
- manual screenshot/image import
- local OCR
- context explanation
- privacy trace

Active-window title may show as unavailable on some platforms, which is acceptable and safer than relying on a vulnerable/fragile dependency.

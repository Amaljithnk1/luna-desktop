# Luna Installation Guide

## Recommended demo machine

- Windows 10/11
- 8 GB RAM minimum, 16 GB+ recommended
- Optional: Ollama installed

## Optional local AI setup

Install Ollama:

```bash
https://ollama.com/download
```

Recommended models:

```bash
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```

Alternative smaller model:

```bash
ollama pull phi3:mini
```

If Ollama is not installed, Luna still runs using transparent fallback mode.

## Running from source

```bash
npm install
npm run dev
```

## Building

Development build:

```bash
npm run build
```

Windows unpacked smoke-test build:

```bash
npm run dist:win-dir
```

Windows installer/portable build on Windows:

```bash
npm run dist
```

## Windows SmartScreen note

This is an unsigned hackathon prototype. Windows may show:

```txt
Windows protected your PC
```

Click:

```txt
More info → Run anyway
```

This happens because the app is not code-signed with a paid certificate.

## Demo reset

Inside Luna, use:

```txt
Reset demo
```

or in Trust Center:

```txt
Delete/reset local data
```

This restores seeded files, memory, skills, vault, audit logs and demo workspace.

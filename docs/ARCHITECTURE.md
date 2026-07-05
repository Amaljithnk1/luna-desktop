# Luna Architecture

```txt
Luna Desktop App
│
├── Electron Main Process
│   ├── Window manager
│   │   ├── Main app window
│   │   └── Always-on-top Luna Orb window
│   ├── IPC handlers
│   ├── Ollama client
│   ├── Fallback AI path
│   ├── Command Router
│   ├── Mission runtime
│   ├── Artifact exporters
│   ├── File automation + undo manifests
│   ├── Knowledge Vault ingestion
│   ├── Memory/context builder
│   ├── Luna Lens context/OCR
│   ├── Model Inspector
│   ├── Audit logger
│   └── SQLite/JSON persistence
│
├── React Renderer
│   ├── Judge Showcase
│   ├── Command Palette
│   ├── Voice
│   ├── Attachments
│   ├── Mission Hub
│   ├── Job Mission
│   ├── Artifact Studio
│   ├── Luna Lens
│   ├── Knowledge Vault
│   ├── Memory
│   ├── Automation
│   ├── Model Inspector
│   ├── Trust Center
│   ├── Settings
│   └── Luna Skill Creator
│
├── Local Data
│   ├── luna.db
│   ├── audit-log.json
│   ├── memory.json
│   ├── vault.json
│   ├── skills.json
│   ├── settings.json
│   ├── attachments.json
│   ├── lens-snapshots.json
│   ├── artifacts/
│   ├── attachments/
│   ├── manifests/
│   └── demo-codebase/
│
└── Local AI
    ├── Ollama chat models
    ├── Ollama embedding models
    └── transparent fallback mode
```

## Command Router

Natural language commands are routed to local tools:

```txt
User command
↓
Intent detection
↓
Mission / Vault / Lens / Skill / Automation / Model Inspector / Memory / Chat+
↓
Artifact output + trace + privacy log
```

## Retrieval

Knowledge Vault and Memory use hybrid retrieval:

```txt
Ollama embedding similarity if available
+
keyword-vector fallback
+
exact keyword boost
```

## Automation safety

File automation follows:

```txt
Plan
↓
Preview
↓
Approval
↓
Execute
↓
Manifest
↓
Undo
```

## Privacy model

Luna tracks:

- AI calls
- file access
- artifact writes
- automation actions
- memory updates
- vault indexing
- lens captures
- model benchmarks
- network attempts
- system resets/settings

These events appear in Trust Center and can be exported.

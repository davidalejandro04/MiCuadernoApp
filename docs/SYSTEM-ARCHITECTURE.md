# TutorMate System Architecture

## Overview

TutorMate is a Spanish-language math tutoring desktop application for grades 3-5. It runs as an Electron app with a local LLM backend (llama.cpp serving `gemma3-4b.gguf`). All inference is offline — no cloud calls.

```
npm install        # install dependencies
npm run dev        # launch the Electron app
npm test           # run tests
npm run build      # package for distribution
```

---

## Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                     ELECTRON SHELL                          │
│                                                             │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │   Main Process   │◄──IPC──►│    Renderer Process      │  │
│  │  electron/main.cjs│        │    src/renderer.mjs      │  │
│  │                  │         │    src/index.html         │  │
│  │  - LLM proxy    │         │    src/styles.css         │  │
│  │  - Persistence  │         │                          │  │
│  │  - Lesson load  │         │  window.bridge (preload)  │  │
│  │  - RAG index    │         └──────────────────────────┘  │
│  │  - Window mgmt  │                                       │
│  └────────┬─────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                       │
│  │  llama.cpp server │  bin/llama-server.exe                │
│  │  localhost:8080   │  models/gemma3-4b.gguf               │
│  │  OpenAI-compat API│  (spawned on bootstrap)              │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Main Process (`electron/main.cjs`)

Responsibilities:
- Spawns and manages the llama.cpp subprocess (port 8080, 4096 ctx, 99 GPU layers)
- Proxies all LLM chat requests via OpenAI-compatible `/v1/chat/completions` (streaming)
- Manages request cancellation with `AbortController` map keyed by `requestId`
- Reads/writes JSON persistence to `%APPDATA%/.TutorMate/` (`profile.json`, `settings.json`, `machine-id`)
- Loads the lesson catalog from `data/lesson-catalog/` at startup
- Builds the RAG index over lesson content at startup
- Handles window capture for vision features

### Preload (`electron/preload.cjs`)

Exposes `window.bridge` to the renderer via `contextBridge`:

| Method | IPC Channel | Purpose |
|--------|------------|---------|
| `bootstrap()` | `app:bootstrap` | Load lessons, profile, settings, start LLM server |
| `saveProfile(p)` | `profile:save` | Persist profile to disk |
| `resetProfile()` | `profile:reset` | Reset to defaults |
| `saveSettings(s)` | `settings:save` | Persist settings to disk |
| `chat(opts)` | `llm:chat` | Send prompt to LLM (streaming) |
| `cancelChat(id)` | `llm:cancel-chat` | Abort in-flight request |
| `listModels(url)` | `llm:list` | List available models |
| `pullModel(opts)` | `llm:pull` | Download model (no-op currently) |
| `captureRegion(rect)` | `window:capture-region` | Screenshot region as base64 PNG |
| `wipeData()` | `data:wipe` | Delete all user data |

### Renderer (`src/renderer.mjs`)

Single-page app with notebook metaphor UI. Communicates with main process exclusively through `window.bridge`. Manages all views, navigation, chat, exercises, flashcards, and analytics.

---

## Bootstrap Sequence

```
app.whenReady()
    │
    ▼
createWindow() ──► loads src/index.html
    │
    ▼
renderer calls window.bridge.bootstrap()
    │
    ▼
┌─ Main Process Bootstrap ─────────────────────────┐
│ 1. Ensure machine-id file exists                  │
│ 2. Spawn llama.cpp server (gemma3-4b.gguf)        │
│ 3. Poll /health up to 45s (500ms intervals)       │
│ 4. Load lesson catalog from data/lesson-catalog/  │
│ 5. Build RAG index (chunk lessons → BM25 index)   │
│ 6. Read profile.json + settings.json (or defaults)│
│ 7. Return { lessons, profile, settings, models }  │
└───────────────────────────────────────────────────┘
    │
    ▼
Renderer initializes state, renders home page
```

---

## IPC Channel Reference

### Invoke (request-response)

| Channel | Payload | Response | Description |
|---------|---------|----------|-------------|
| `app:bootstrap` | — | `{lessons, profile, settings, availableModels, llm, machineId, dataPath}` | Full app initialization |
| `profile:save` | profile object | `{ok}` | Write profile to disk |
| `profile:reset` | — | default profile | Reset profile |
| `settings:save` | settings object | `{ok}` | Write settings to disk |
| `llm:chat` | `{messages, model, maxTokens, temperature, forceJson, useRAG, requestId}` | `{content}` | LLM chat completion |
| `llm:cancel-chat` | `{requestId}` | `{ok}` | Cancel active request |
| `llm:list` | — | `[{name, size}]` | Available models (hardcoded to gemma4:e2b) |
| `llm:pull` | `{model}` | `{ok}` | No-op |
| `rag:search` | `{query}` | search results | Query RAG index |
| `data:wipe` | — | — | Delete all user data (with confirmation dialog) |
| `data:path` | — | string | Returns userData directory path |
| `window:capture-region` | `{x, y, width, height}` | base64 PNG | Screenshot of window region |

### Events (pub-sub)

| Channel | Payload | Direction |
|---------|---------|-----------|
| `llm:chat-token` | `{requestId, token}` | main → renderer |
| `ollama:pull-progress` | progress data | main → renderer (registered but unused) |

---

## LLM Integration

### Server Configuration

```
Binary:    bin/llama-server.exe
Model:     models/gemma3-4b.gguf
Port:      8080
Context:   4096 tokens
GPU:       99 layers offloaded
Threads:   4
Flags:     --no-mmap
```

### Chat Request Flow

```
Renderer                    Main Process                 llama.cpp
   │                            │                            │
   │── bridge.chat(opts) ──────►│                            │
   │                            │── POST /v1/chat/completions│
   │                            │   stream: true             │
   │                            │   model: gemma4:e2b        │
   │                            │──────────────────────────►│
   │                            │                            │
   │                            │◄─── SSE token stream ─────│
   │◄── llm:chat-token ────────│                            │
   │◄── llm:chat-token ────────│                            │
   │◄── llm:chat-token ────────│                            │
   │                            │                            │
   │◄── { content } ───────────│  (accumulated full text)   │
```

- If `useRAG: true`, the system prompt is augmented with retrieved lesson context before sending
- The model name is hardcoded to `gemma4:e2b` regardless of settings
- Cancellation: `cancelChat(requestId)` → `AbortController.abort()` → `"Solicitud cancelada."`

---

## Persistence

### Data Directory

`%APPDATA%/.TutorMate/` (Windows)

### Files

| File | Content | Default |
|------|---------|---------|
| `profile.json` | Student learning profile | See Profile Schema below |
| `settings.json` | App configuration | See Settings Schema below |
| `machine-id` | UUID string | `crypto.randomUUID()` |

### Default Settings

```json
{
  "currentModel": "gemma4:e2b",
  "ollamaBaseUrl": "http://127.0.0.1:11434",
  "responseMode": "coach",
  "theme": "light",
  "agentMode": true,
  "agentRouterModel": "gemma4:e2b",
  "agentTutorModel": "gemma4:e2b",
  "agentFunctionModel": "gemma4:e2b"
}
```

---

## Window Configuration

- Size: 1500x960 (min: 1200x760)
- Background: `#f6f1e8`
- Security: `contextIsolation: true`, `nodeIntegration: false`
- Menu: auto-hidden
- Entry: `src/index.html`

---

## Build & Distribution

```
npm run build  →  electron-builder --config electron-builder.json
```

- App ID: `com.tutormate.electron`
- Windows: NSIS installer (x64)
- Bundles: `OllamaSetup.exe` for first-time setup
- ASAR packaging enabled
- Includes: `electron/`, `src/`, `assets/`, `data/`, `package.json`

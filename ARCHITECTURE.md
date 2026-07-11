# Jarvis Architecture

## Processes

- **Electron main:** canonical state, request routing, capability registry, safety, OAuth, scheduling, coordination, persistence, and privileged IPC.
- **Sandboxed renderers:** full Jarvis window and floating assistant. They render previews and send schema-bounded IPC only.
- **JarvisNativeBridge:** optional signed Swift stdio companion for EventKit, Contacts, Speech, Vision OCR, Accessibility, and native permissions. It exits with Jarvis and is not a daemon.
- **Chrome extension:** optional Manifest V3 extension with per-origin grants. A native-messaging host forwards JSON to a mode-0600 Unix socket owned by the running app.

## Request pipeline

1. Normalize input and run deterministic parsing.
2. Return exact social phrases locally, or execute an exact deterministic capability through its normal preview policy.
3. Classify unmatched input as ordinary conversation or an action candidate. Conversation streams directly without an approval step; only strongly action-shaped requests enter AI planning.
4. Validate every proposed action capability and field against the registry.
5. Recompute risk independently from the model.
6. Show the exact plan and required confirmation.
7. Execute serially with cancellation, bounded output, timeouts, and step history.
8. Persist actual outcomes and return a result grounded in those outcomes.

The parser and model cannot execute. High-risk policy cannot be weakened by preferences. Renderer and extension messages are untrusted input.

Voice input asks the native Speech framework for the current locale's on-device recognizer first. macOS System Dictation is a separate service and can remain functional even when `SFSpeechRecognizer.supportsOnDeviceRecognition` is false. That condition never causes silent network use: Jarvis falls back to local whisper.cpp or offers a clearly labeled, persisted opt-in to Apple's Speech service. Local recognition wins whenever available. Voice is push-to-talk only; Jarvis has no always-listening wake word.

AI routing is also policy-bound. A deterministic weighted classifier selects one of seven task profiles only above its confidence and ambiguity thresholds. The selected verified-free model is prepended to a deduplicated free waterfall; only quota, timeout, removed-model, and transient failures advance. Streaming fallback is allowed only before the first emitted token. Free-model eligibility is recomputed from a conservative registry, user-confirmed free account modes, and live provider catalogs; stale routes are disabled rather than replaced. Cloud adapters cover Gemini, Groq, Mistral, OpenRouter, and NVIDIA NIM. Ollama and LM Studio are loopback-only.

Quick-answer and summarization lanes default to a constrained local Ollama model. A main-process resource monitor grants an exclusive inference lease only when macOS thermal state and CPU speed are healthy, the machine is on an allowed power source, total CPU utilization is below the configured ceiling, and memory pressure has enough margin. The lease continuously rechecks pressure and owns the abort signal. Ollama is loopback-only, receives bounded context/output and two CPU threads, and is explicitly unloaded after each response. Resource-gate failures are safe availability failures and may advance to the verified-free waterfall; malformed configuration and authentication failures remain visible and stop routing.

## Persistence

Node's built-in SQLite is canonical, using WAL, synchronous full writes, FTS5, and numbered schema metadata. Existing `state.json` is imported on first migration and retained as a portable compatibility snapshot. The store keeps conversations, messages, routines, schedules, memories, notes, activity, action runs/steps, connections, trusted roots, aliases, preferences, and timers. `memory.md` remains an atomic readable mirror.

API and OAuth secrets use Electron `safeStorage` and macOS Keychain. Exports deliberately omit secrets. Private Mode bypasses saved memory, conversation writes, and activity writes.

Optional connectors use one registry for identity, granted features, capability bindings, and health. Startup performs bounded checks for Google Workspace, Spotify, Tavily, GitHub, Microsoft 365, Notion, and Todoist. Authentication failures require reconnection; transient failures retain the credential in a degraded state. Only healthy granted features enter AI tool schemas.

## Capability and safety boundary

Each capability owns an input schema, preview, permission requirements, connection requirements, deterministic risk, dry run, and executor. Fixed executable paths and argument arrays are used for local processes. Developer work is constrained to canonical trusted roots and approved recipes. Browser page content, files, command output, and AI responses are always treated as untrusted.

Routine and AI plans use the same serial coordinator. Completed steps remain visible after cancellation or partial failure. Scheduled routines run only while Jarvis is available; missed or confirmation-required schedules generate suggestions rather than silently running.

# Privacy and Data

Jarvis is a single-user local application. It has no Jarvis account, analytics service, advertising SDK, or background daemon.

## Local storage

`~/Library/Application Support/Jarvis/` contains the SQLite database, WAL, versioned snapshots/backups, the append-only action journal, structured redacted logs, and `memory.md`. API keys and OAuth tokens are stored only as macOS Keychain-backed `safeStorage` ciphertext. JSON exports omit secrets.

Automatic memory accepts clearly durable, non-sensitive preferences, aliases, people, projects, workflows, trusted locations, and deadlines. It rejects credentials, financial data, authentication codes, copied private text, health details, temporary tasks, raw documents, and uncertain model guesses. Every memory records its source and reason and can be edited, pinned, forgotten, exported, or excluded by category. SQLite is authoritative; `memory.md` is an atomic readable mirror.

Private sessions write no conversation, memory, attachment, or activity data. Disabling activity tracking keeps only visible session history in memory.

## Audio and documents

Voice is push-to-talk. Audio is held in a temporary file, limited to one recording, deleted after transcription, and never written to memory or activity. Jarvis tries Apple on-device Speech, verified local whisper.cpp, then Apple online Speech only after explicit opt-in.

Document extraction is local. Original files remain in place. Jarvis treats document and web text as untrusted content, never as authority to run an action. Attachment text is sent to a cloud provider only after a per-request approval identifying the files and destination provider.

## External services

Deterministic commands and exact social replies never use AI. Ollama and LM Studio are loopback-only and pass the local resource gate. Gemini, Groq, Mistral, OpenRouter, and NVIDIA NIM receive only the current conversational request and bounded relevant context. Mistral and NVIDIA routes require explicit free-access confirmation; uncertain or potentially paid routes are blocked.

Google Workspace, Spotify, Tavily, GitHub, Microsoft 365, Notion, Todoist, and the Chrome bridge are optional and independently revocable. Connector health records contain only account labels, granted features, status, latency, and remediation—not tokens. Browser, research, and document content remains untrusted and cannot authorize device actions. Provider behavior remains governed by each provider’s policy.

Use Connections to disconnect services and Settings to export or remove local data. Revoke macOS permissions in System Settings → Privacy & Security.

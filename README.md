# Jarvis

Jarvis is an open-source, private-first desktop assistant. It combines safe native automation, local memory, optional local models, and bring-your-own cloud services. It has no bundled API keys, no Jarvis account, no telemetry service, and no arbitrary shell execution.

> **Early project:** Jarvis is useful today, but integrations and macOS permission behavior still need testing across more machines. Review action previews, start in Demo Mode, and report problems without attaching private data.

## Run and package

## Downloads

Installers and packaged builds are published on the [GitHub Releases page](https://github.com/vivaanseth/jarvis/releases). Each release supplies a universal macOS `.dmg`, `.zip`, and `.app.tar.gz`; Windows x64 `.exe` and `.msi`; and Linux x64 `.AppImage`, `.deb`, `.rpm`, and `.tar.gz`, plus `SHA256SUMS.txt` and `latest.json`. GitHub automatically provides **Source code (zip)** and **Source code (tar.gz)** at the bottom of every release.

The shared Electron interface, conversations, local files, timers, notes, browser opening, connectors, and BYOK AI work on macOS, Windows, and Linux. The signed Swift companion, Apple permissions, Mac app/window control, Shortcuts, AppleScript media control, and floating-orb placement are macOS-only and show an explicit unavailable state elsewhere.

Requirements: macOS 13+, Node.js 20+, and full Xcode for the native companion.

```bash
npm install
./script/build_and_run.sh
./script/build_and_run.sh --verify
./script/build_and_run.sh --package
./script/build_and_run.sh --install
```

`--verify` runs syntax checks, the complete Electron suite, the Swift native build, hardened-runtime packaging, signature verification, and a packaged launch smoke test. `--install` keeps the previous release under `dist-previous/`, installs to `/Applications/Jarvis.app` when writable or the no-admin `~/Applications/Jarvis.app` fallback, and launches it. The development command remains `npm start`.

Electron is the sole product UI and orchestration runtime. Swift is limited to the signed native companion. The obsolete SwiftUI app and its Xcode project are intentionally not part of the repository. Build the companion through the Swift package with full Xcode selected:

```bash
./script/build_native_bridge.sh
```

The companion enables native EventKit, Contacts, push-to-talk speech, OCR, Accessibility window actions, and permission status. Speech uses the app-facing Speech framework's on-device recognizer when Apple exposes one. System Dictation can work even when that separate API reports no on-device support; in that case Jarvis falls back to verified local whisper.cpp models or offers an explicit Apple Speech transcription opt-in without consuming AI API credits. Network fallback is never enabled silently. Jarvis has no always-listening wake word. Until the companion is built, Calendar, Reminders, and Mail use bounded Apple-event fallbacks and voice controls explain the missing prerequisite.

On first launch, the setup assistant walks through the installed app identity, native permissions, offline speech and AI, optional providers/connectors, and a final readiness check. Every stage can be skipped and revisited from Settings.

## What works locally

- Launch, switch, hide, and quit applications.
- Open known, favorite, and trusted folders; search files with Spotlight.
- Web, YouTube, Wikipedia, GitHub, ChatGPT, and Spotify searches.
- Weather through Open-Meteo, arithmetic, Maps directions, timers, screenshots, volume, settings, battery status, disk space, screen saver/display sleep, installed-app listing, current Spotify track, and screen locking.
- Exact approved developer recipes inside canonical trusted project roots; no arbitrary shell execution.
- Local notes, conversations, routines, schedules, activity, insights, and automatic important memory.
- SQLite persistence with WAL, atomic JSON compatibility snapshots, database backups, FTS search, import/export, and a mode-0600 `memory.md` mirror.
- The floating Orion orb, direct mini-deck opening, eight desktop snap anchors, menu-bar recovery, and global shortcuts.

## Optional connections

Open **Connections** inside Jarvis.

### AI

Jarvis supports verified-free OpenRouter, Groq, Mistral, Gemini, NVIDIA NIM developer endpoints, local Ollama, and local LM Studio. In Connections, load each provider's live catalog and arrange exact provider/model pairs into a draggable waterfall. A key that successfully loads its provider catalog is saved immediately with macOS Keychain encryption; **Save keys** also persists credentials independently from routing, and sensitive fields clear after saving. Gemini remains one waterfall item while securely pooling and rotating through as many as five individually confirmed, unbilled Free Tier API keys. Mistral requires Free mode confirmation. NVIDIA requires confirmation that the key is being used under its free Developer Program prototyping access. LM Studio is restricted to a loopback `/v1` endpoint and passes the same CPU, memory, power, and thermal gate as other local inference. Quota-limited credentials cool down before Jarvis advances. Unverifiable custom cloud endpoints and non-zero OpenRouter models are blocked by Free-Only Lock.

Task-specific routes are classified locally without spending tokens. Quick answers, deep reasoning, coding, research, writing, summarization, and action planning each start with an exact verified-free model, then recover through the ordered free waterfall on quota or provider availability failures. Ordinary conversation starts immediately and streams real provider tokens without an action-preview button. Only strongly action-shaped unmatched requests enter AI tool planning. A refreshed catalog disables stale routes instead of silently changing models. API keys are provider-scoped and encrypted with Electron `safeStorage`, backed by macOS Keychain. Deterministic commands do not call AI. AI answers and plans receive only relevant non-sensitive memory snippets; Private Mode sends no memory and stores no transcript or activity.

Quick answers and short summaries default to local Ollama `qwen2.5:1.5b`. Jarvis checks whole-system CPU utilization, macOS memory pressure, AC/battery state, macOS thermal state, and CPU speed limiting before loading it. Local work is skipped while another local request is active, CPU is at least 55%, free memory-pressure budget is below 30%, thermal state is not nominal, CPU speed is limited below 90%, the input exceeds the 3,000-character low-heat budget, or the Mac is on battery (unless explicitly allowed). An active request is cancelled if pressure becomes unsafe. The request uses two CPU threads, a 2K context, bounded history/output, and `keep_alive: 0`, so Ollama unloads the model after every reply. A skipped or interrupted local request continues through the configured free cloud waterfall.

The Connections screen shows this safety gate and has controls to disable local AI, optionally allow it on battery, or refresh the resource check. macOS exposes a supported thermal-pressure state rather than an exact sensor temperature; Jarvis deliberately uses that system signal instead of unsupported sensor scraping.

The recommended waterfall is Gemini `gemini-3.5-flash`, Groq `llama-3.3-70b-versatile`, Mistral `mistral-small-latest`, then OpenRouter `openrouter/free`. Writing uses Mistral Small directly. Multiple Gemini keys created under one Google project may share project-level quota.

AI may propose only registered capability schemas. Jarvis independently validates fields, assigns risk, shows the plan, and executes it. A model cannot introduce a command, lower risk, or call privileged IPC directly.

Typed input, finalized speech, the floating orb, and contextual buttons share one dispatcher. Obvious low-risk actions resolve locally and run immediately; medium/high-risk actions and model-planned device work retain previews and confirmation. Natural variants such as “please open ChatGPT” resolve to the same site capability as the contextual action, while questions such as “how do I open ChatGPT?” remain conversation.

### Spotify

Create a Spotify developer application and register `http://127.0.0.1/callback` as a redirect URI, then enter its Client ID. Jarvis uses Authorization Code with PKCE; no client secret is stored. Spotify’s Web API may limit on-demand playback by account or device, but Jarvis can still open Spotify URIs and use supported desktop media controls without treating Premium as a setup requirement.

### Google

Create a Google OAuth **Desktop app** client, enable the APIs you want, and enter its Client ID. Jarvis requests selected Gmail, Calendar, Drive, Contacts, and Tasks scopes through PKCE. Refresh tokens are encrypted locally. Email sending and calendar writes retain confirmation requirements.

### Research and productivity connectors

- **Tavily:** optional grounded search with citations and browser fallback. A free-plan confirmation is required before the key can run.
- **GitHub:** a fine-grained personal access token can expose selected repository, issue, pull-request, workflow, and notification capabilities. Grant only the repositories and permissions you need.
- **Microsoft 365:** a public desktop-app client ID connects Outlook, Calendar, OneDrive, People, and Microsoft To Do through PKCE.
- **Notion:** an internal integration token can access only pages explicitly shared with that integration.
- **Todoist:** a personal API token enables project and task workflows.

Connector capabilities are omitted from AI planning unless the required account feature is actually healthy. External writes and sends never inherit trust from webpages, documents, or model output.

### Chrome bridge

Choose **Open extension setup**. Jarvis installs a per-user native-messaging manifest and opens the bundled extension folder. In `chrome://extensions`, enable Developer mode and choose **Load unpacked**.

The extension has a stable local ID, asks for each site origin separately, and does not request cookies, saved passwords, or browsing history. It blocks password, payment, one-time-code, recovery, token, and CAPTCHA fields, and refuses consequential submit controls without a separate final-confirmation path.

## Data and privacy

Data lives in `~/Library/Application Support/Jarvis/`:

- `jarvis.sqlite` — canonical versioned data.
- `state.json` — portable compatibility snapshot.
- `memory.md` — human-readable memory mirror.
- `secrets.json` — only Keychain-encrypted ciphertext.

Automatic memory classifies durable identity, preference, person, project, workflow, and deadline facts locally. Passwords, keys, tokens, payment details, OTPs, recovery codes, and ordinary transient commands are rejected. Every saved memory is editable and removable.

## Before publishing a fork

Run `npm run security:secrets` before the first commit and before every release. The scanner checks tracked and untracked source files for common provider keys, OAuth tokens, and private-key blocks. Also review `git log -p --all` if your fork has prior history. If a real credential has ever been committed, revoke it first; removing the file or rewriting Git history is not sufficient by itself.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [MIT license](LICENSE). GitHub Actions runs JavaScript checks, secret scanning, Electron tests, and Swift tests on every push and pull request.

## Safety model

- Unambiguous low risk: run immediately with visible progress and an activity result.
- AI-inferred low risk: show the proposed plan before execution.
- Medium risk: confirmation by default.
- High risk: exact confirmation at execution and never downgradeable.
- Calendar and reminder writes always expose Save confirmation.
- Email, messages, purchases, bookings, posts, account changes, Trash, restart, and shutdown are high risk.
- Permanent deletion, `sudo`, covert capture, CAPTCHA solving, private security APIs, arbitrary shell text, and silent external communication are unsupported.

See [architecture](ARCHITECTURE.md), [capabilities](Docs/CAPABILITIES.md), [privacy](Docs/PRIVACY.md), [permissions](Docs/PERMISSIONS.md), [troubleshooting](Docs/TROUBLESHOOTING.md), [release workflow](Docs/RELEASE.md), and the [acceptance checklist](Docs/ACCEPTANCE_CHECKLIST.md).

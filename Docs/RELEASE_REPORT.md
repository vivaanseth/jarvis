# Release Report — Jarvis 1.3.0

Date: 2026-07-10

## Automated result

- JavaScript syntax and repository secret checks: pass.
- Electron tests: 135 passed, 0 failed.
- Dependency audit: 0 known vulnerabilities.
- Native helper: release compile passed for x86_64 and arm64.
- Native protocol: version 2 helper launched successfully in the packaged application.
- Package: hardened runtime enabled; deep strict signature verification passed.
- Bundle privacy audit: no local username, home-directory path, email address, API key, OAuth token, or application-data directory was found in packaged app resources.
- Window smoke test: version 1.3.0 main process, normal Dock policy, and native helper remained running after packaged launch.
- Connector health: bounded live checks distinguish ready, degraded, reconnect-required, and optional states without exposing credentials.

## Public-source readiness

The repository includes MIT licensing, contribution and security policies, a code of conduct, issue templates, Dependabot, macOS CI, release/acceptance checklists, and a source secret scanner. The obsolete SwiftUI application, stale Xcode scheme, and unusable SwiftUI test target were removed; Electron is the only product UI and SwiftPM builds only the native companion.

No Git commit exists in this workspace yet, so there is no credential-bearing Git history to rewrite. The first publisher must still review the staged file list and run `npm run security:secrets` before committing.

## Product changes

- Added resumable six-stage onboarding and public degraded-mode guidance.
- Added NVIDIA NIM and loopback-only LM Studio alongside Gemini, Groq, Mistral, OpenRouter, and Ollama.
- Added Tavily, GitHub, Microsoft 365, Notion, and Todoist connection flows with per-feature health.
- Unified typed, voice, orb, button, and routine requests behind one capability dispatcher.
- Added contextual live state for plans, research sources, local tasks, focus sessions, and local-compute gating.
- Preserved immediate local replies, immediate unambiguous low-risk actions, and confirmation for inferred or consequential actions.

## Migration and data

Storage schema version 3 and AI routing version 4 preserve routines, schedules, activity, notes, memory, AI routes, encrypted provider secrets, trusted paths, orb placement, conversations, and preferences. SQLite is canonical. Compatibility snapshots, last-known-good backup, action journal, and atomic `memory.md` regeneration remain enabled.

## Known release prerequisite

No Apple Development identity is currently installed in the active keychain, so this workspace produced an ad-hoc hardened-runtime development signature. Before publishing a binary intended to retain stable macOS permissions, configure `.jarvis-signing.env`, rebuild, reinstall Jarvis, and complete the manual permission matrix.

The Electron runtime in `dist/Jarvis.app` is x86_64. Publish architecture-specific packages built on their target architecture unless a verified universal Electron runtime is introduced.

## Rollback

`script/install_local.sh` retains the previous installed app under `dist-previous/`. Restore that bundle and the pre-migration database backup if a release regression is found.

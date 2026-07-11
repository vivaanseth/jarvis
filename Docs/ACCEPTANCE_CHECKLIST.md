# Release Acceptance Checklist

## Core and windows

- [ ] Launch the signed `dist/Jarvis.app`; verify the main window, white tray icon, corner orb, menu recovery, and single-instance behavior.
- [ ] Click the orb to open the mini deck; use open-main, voice, collapse, hide, and Quit.
- [ ] Submit the same low-risk action through typed input, voice, the orb, and a contextual button; confirm all resolve to the same capability and make no AI request.
- [ ] Verify “Please open ChatGPT” opens the site immediately while “How do I open ChatGPT?” remains a conversation.
- [ ] Speak one local command, one confirmation-required command, and one conversational request; confirm the local command runs, the consequential command waits for confirmation, and conversation answers without a second click.
- [ ] Type and speak “hi”; confirm the local reply appears without an AI call, action preview, or second click.
- [ ] Ask a factual question and a writing request; confirm both start immediately and stream, while an action-shaped unmatched request still produces a validated preview.
- [ ] Drag the orb to every corner and edge midpoint across each display; relaunch and verify restoration.
- [ ] Verify Option-Space and Option-Shift-Space behavior.

## Local capabilities

- [ ] Open/switch/hide/quit an app; open a favorite folder; search Spotlight; open HTTPS, Maps, weather, and web searches.
- [ ] Start, pause, restore, complete, and stop timers.
- [ ] Exercise volume, screenshot, settings, lock, restart, shutdown, and denied confirmations safely.
- [ ] Enable Developer Mode, trust a project, inspect Git status/log, run an approved recipe, and reject escape/arbitrary-shell attempts.
- [ ] Create Calendar/Reminder items after Save confirmation and send a test email only after exact high-risk confirmation.

## Conversation and memory

- [ ] Connect OpenRouter and Groq independently, load only verified-free models, drag to reorder the waterfall, and confirm a mocked 429/402 advances while a 401 stops.
- [ ] Save five Gemini keys, confirm Free Tier/no billing independently for each slot, and verify only confirmed keys rotate without exposing credentials in activity or status.
- [ ] Save a Mistral key, confirm Free mode/no Scale billing, load chat-capable models, and verify the Writing lane plus third waterfall position use `mistral-small-latest`.
- [ ] Exercise quick, deep reasoning, coding, research, writing, summarization, and action-planning classification; confirm ambiguous and unmatched prompts use waterfall order.
- [ ] Confirm a task-model quota failure uses the deduplicated free waterfall and a removed model is disabled without silent replacement.
- [ ] Confirm quick answers and summaries use local `qwen2.5:1.5b` on healthy AC power, unload after completion, and fall through to the free cloud waterfall under high CPU, memory pressure, battery policy, thermal pressure, throttling, or a concurrent local request.
- [ ] Attempt to save a paid OpenRouter model, unverified Gemini/Groq model, and custom cloud endpoint; confirm Free-Only Lock blocks each.
- [ ] Connect each other supported AI provider independently; confirm local commands create no provider traffic.
- [ ] Confirm NVIDIA NIM requires Developer Program prototyping confirmation and LM Studio rejects non-loopback endpoints and obeys the local resource gate.
- [ ] Ask a factual question, a multi-step low-risk action, an ambiguous request, and an unsupported request.
- [ ] Verify AI plans cannot invent capabilities or lower risk.
- [ ] Verify local chat search/relaunch and Private Mode non-persistence.
- [ ] Save automatic identity, preference, project, workflow, person, and deadline memories; reject passwords, keys, OTPs, and payment data.
- [ ] Verify SQLite, JSON snapshot, backup recovery, export/import, and `memory.md` mode/content.

## Connections

- [ ] On a clean TCC state, press the permission action in Setup and confirm separate macOS prompts appear for Microphone and Speech Recognition; verify both become Allowed in Connections.
- [ ] Deny each voice permission once, confirm Jarvis reports the denial, and verify the Microphone/Speech settings buttons open the corresponding Privacy panes.
- [ ] When Apple reports no app-facing on-device recognizer, confirm Speak explains that System Dictation is separate and offers Apple Speech or cancel; verify network-capable use requires explicit opt-in and consumes no AI route.
- [ ] On a Mac where `supportsOnDeviceRecognition` is true, confirm Jarvis automatically prefers it even if Apple Speech fallback remains enabled.

- [ ] Spotify: connect/revoke, search, play/pause/next/previous, active-device error, expired token, non-Premium fallback, and private-playlist write confirmation.
- [ ] Google: connect selected scopes, Gmail search/send, Calendar read/write, Drive search, revoked token, disabled API, and disconnect.
- [ ] Tavily, GitHub, Microsoft 365, Notion, and Todoist: connect, relaunch, verify live health, revoke credentials, and confirm only healthy granted features appear in AI schemas.
- [ ] Chrome: install native host/extension, grant one origin, list tabs, read a page, click/type, revoke origin, and reject sensitive fields and submit controls.
- [ ] Native companion: build/sign, request each permission, push-to-talk, spoken reply, OCR, Contacts, EventKit, and Accessibility denial.

## Routines and resilience

- [ ] Create/edit/delete a routine and optional weekday/daily/weekend schedule.
- [ ] Dry-run, cancel mid-run, verify step history, partial failure, confirmation-required notification, and missed-run suggestion.
- [ ] Disable activity and confirm no action journal writes; verify conversations remain governed by their separate setting.
- [ ] Test offline mode, provider timeouts, OAuth denial, malformed import, database recovery, absent apps, unavailable files, and sleep/wake.

## Quality

- [ ] Run `npm run check`, `npm test`, `npm run package`, and `./script/build_and_run.sh --verify`.
- [ ] Test keyboard-only navigation, VoiceOver labels, WCAG AA contrast, Reduce Motion, narrow window, multi-display, Intel, and Apple Silicon.
- [ ] Inspect the packaged app signature, permission descriptions, local logs, and absence of secrets in exports or renderer state.
- [ ] Run `./script/check_secrets.sh`, inspect the full Git file list, and complete `PUBLIC_RELEASE_CHECKLIST.md` before publishing source or binaries.

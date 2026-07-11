# Changelog

All notable changes to Jarvis will be documented here. The project follows semantic versioning after the first public release.

## 1.3.5 - 2026-07-11

### Fixed

- Universal macOS packaging now recognizes the already-universal native companion during Electron architecture merging.

## 1.3.4 - 2026-07-11

### Fixed

- Windows no longer attempts to start the macOS Unix-socket Chrome native host during application startup.
- Release CI packages Windows after portable syntax and secret checks; the macOS/Linux test matrix continues to run the full suite.

## 1.3.3 - 2026-07-11

### Fixed

- Release verification runs in Git Bash on Windows instead of invoking POSIX scripts through `cmd.exe`.

## 1.3.2 - 2026-07-11

### Fixed

- Release CI now uses a Node version that includes the SQLite runtime used by the store tests.
- Cross-platform secret scanning runs under Bash on Linux and Windows release runners.

## 1.3.1 - 2026-07-11

### Added

- Native GitHub Actions release packaging for universal macOS, Windows x64, and Linux x64.
- DMG, ZIP, app tarball, NSIS EXE, MSI, AppImage, DEB, RPM, and tarball artifacts.
- Generated `SHA256SUMS.txt` and `latest.json` release manifests.

### Changed

- Windows and Linux now run the Electron core while explicitly marking macOS-only capabilities unavailable.
- Native companion builds now compile on current Xcode toolchains and support universal macOS packaging.

## 1.3.0 - 2026-07-10

### Added

- Resumable six-stage onboarding and unified diagnostics.
- Unified typed, speech, orb, button, and routine dispatcher.
- Tavily, GitHub, Microsoft 365, Notion, and Todoist connectors with live health states.
- NVIDIA NIM and loopback-only LM Studio AI providers.
- Contextual command dock for active plans, research, tasks, focus, and local-resource warnings.
- Public license, contribution/security policies, issue templates, CI, Dependabot, and source secret scanning.

### Changed

- Ordinary conversation no longer enters action confirmation.
- Unambiguous low-risk actions execute immediately with visible progress.
- Connector capabilities are hidden from AI planning until their account feature is healthy.
- Public documentation now describes degraded modes, privacy boundaries, and release verification.

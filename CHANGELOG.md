# Changelog

All notable changes to Jarvis will be documented here. The project follows semantic versioning after the first public release.

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

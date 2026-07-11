# Release Guide

Jarvis is open-source under MIT. Electron is the canonical app; `JarvisNativeBridge` is embedded as a narrowly scoped signed helper. GitHub source releases never include credentials, signing identities, local databases, diagnostic exports, or built applications.

## One-time signing setup

1. Sign into Xcode with an Apple ID and create an Apple Development identity.
2. Copy `.jarvis-signing.env.example` to `.jarvis-signing.env`.
3. Set the exact identity printed by `security find-identity -v -p codesigning`.
4. Keep `JARVIS_REQUIRE_PERSONAL_SIGNING=1` for release builds. The file is gitignored.

Ad-hoc signing is accepted only for development. A stable Personal Team identity is important because macOS TCC permissions follow code identity.

## Build, verify, install

```bash
npm install
./script/build_and_run.sh --verify
./script/build_and_run.sh --install
```

Verification runs JavaScript syntax and secret checks, 130+ automated tests, the native Swift companion build, hardened-runtime packaging, strict signature validation, and a packaged launch/helper smoke test. The install script preserves the old application under `dist-previous/Jarvis-<timestamp>.app`, installs to `/Applications/Jarvis.app` when writable or `~/Applications/Jarvis.app` without administrator access, verifies it again, and launches it.

For architecture checks:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release --product JarvisNativeBridge --arch x86_64 --scratch-path .build-x86_64
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release --product JarvisNativeBridge --arch arm64 --scratch-path .build-arm64
```

The Electron runtime packaged on this Intel Mac is architecture-specific. Build the application package on each target architecture unless a universal Electron runtime is introduced.

## Rollback

Quit Jarvis, copy the desired retained `.app` from `dist-previous/` to `/Applications/Jarvis.app`, verify it with `codesign --verify --deep --strict`, and launch it. Database migrations create a pre-migration backup; do not discard that backup until the new release is accepted.

Complete [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md) after any permission, helper, persistence, or capability-registry change.

## Public GitHub release

1. Run `npm ci`, `npm run check`, `npm test`, and `./script/build_and_run.sh --verify`.
2. Review `git status --short` and the output of `./script/check_secrets.sh`. If the repository has history, also review `git log -p --all` and revoke any credential that was ever committed.
3. Keep `.jarvis-signing.env`, `.env*`, `secrets.json`, certificates, databases, logs, `dist/`, and `dist-previous/` untracked.
4. Complete [PUBLIC_RELEASE_CHECKLIST.md](PUBLIC_RELEASE_CHECKLIST.md), then create a signed source tag. Attach binaries only after verifying their hardened-runtime signature on the matching architecture.

The package remains marked `private` to prevent accidental npm publication; this does not limit GitHub distribution under the MIT license.

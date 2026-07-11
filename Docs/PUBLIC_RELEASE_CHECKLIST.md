# Public Release Checklist

## Source and identity

- [ ] Choose the public GitHub owner/repository name and update any future repository URLs.
- [ ] Confirm the MIT license, security policy, contribution guide, code of conduct, and issue templates are present.
- [ ] Review every file reported by `git status --short`; exclude local databases, logs, diagnostics, screenshots with private data, and build artifacts.
- [ ] Run `./script/check_secrets.sh`. If Git history exists, inspect it separately and revoke any credential that ever entered a commit.
- [ ] Confirm `.jarvis-signing.env`, certificates, provisioning profiles, `.env*`, and `secrets.json` remain ignored.

## Quality and security

- [ ] Run `npm ci`, `npm run check`, `npm test`, and `npm audit --audit-level=high`.
- [ ] Run `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release --product JarvisNativeBridge`.
- [ ] Run `./script/build_and_run.sh --verify` and inspect the generated signature report.
- [ ] Confirm renderer sandboxing, restrictive navigation, sender-validated IPC, capability coverage, and high-risk confirmation tests pass.
- [ ] Export diagnostics and application data once; confirm credentials, prompts, private memory, and document contents are absent where promised.

## User experience

- [ ] Complete onboarding from a clean application-data directory with no providers configured.
- [ ] Confirm typed input works when voice, native helper, local AI, cloud AI, browser bridge, and every connector are unavailable.
- [ ] Confirm the Dock, menu bar, and floating orb can all recover the main window and Quit works from the mini deck.
- [ ] Test VoiceOver labels, keyboard navigation, increased contrast, reduced motion, and a narrow supported window.

## Publication

- [ ] Publish source before binaries and clearly label the project as early-stage macOS software.
- [ ] Build each binary on its target architecture unless a verified universal package is produced.
- [ ] Attach checksums and a release report; never upload local app data or signing configuration.
- [ ] Enable GitHub private vulnerability reporting, Dependabot, and branch protection after repository creation.

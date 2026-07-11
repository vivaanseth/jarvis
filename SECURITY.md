# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose credentials, private local data, or unsafe device actions. Use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, contact the repository owner privately before disclosing details.

Include the affected version, macOS version, reproduction steps, impact, and any suggested mitigation. Do not include real API keys, OAuth tokens, private documents, memory exports, or diagnostic bundles containing personal information.

## Security boundaries

- Renderer processes are sandboxed and communicate through sender-validated IPC.
- Credentials are entered at runtime and stored as macOS Keychain-backed encrypted values. No credential belongs in source, issues, screenshots, or logs.
- AI output cannot execute arbitrary code or invent capabilities. Device actions must pass the capability registry, schema validation, risk policy, and confirmation rules.
- File and developer actions are confined to canonical user-approved roots.
- Browser/document content is untrusted data and cannot authorize actions.

Run `npm run security:secrets` before every commit and rotate a credential immediately if it is ever committed, even if the commit is later removed.

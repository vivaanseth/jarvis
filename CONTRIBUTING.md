# Contributing to Jarvis

Thanks for helping improve Jarvis. This project prioritizes user control, privacy, predictable macOS behavior, and honest degraded states.

## Development

1. Use macOS 13 or newer, Node.js 20 or newer, and full Xcode for native-companion work.
2. Run `npm ci`.
3. Run `npm test` and `npm run check` before submitting changes.
4. Keep credentials out of the repository. Enter test credentials only in the running app and use mocks in automated tests.

## Pull requests

- Explain the user-visible behavior and security impact.
- Add tests for new capability aliases, schemas, risks, connector failures, and IPC methods.
- Never weaken a risk classification or permission boundary to make a test pass.
- Do not add arbitrary shell execution, generated-code execution, covert capture, credential fields, or coordinate-based UI automation.
- Keep optional services optional; typed local functionality must remain usable when they fail.

By contributing, you agree that your contribution is licensed under the MIT License.

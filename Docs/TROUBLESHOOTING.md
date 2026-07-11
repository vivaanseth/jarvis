# Troubleshooting

## Jarvis does not appear in the Dock

Run `./script/build_and_run.sh --install`, then open `/Applications/Jarvis.app` or the no-admin `~/Applications/Jarvis.app` fallback. The release bundle sets `LSUIElement` to false. The menu-bar item and floating orb remain recovery paths if the main window is closed.

## The orb receives focus but does not open

Install the current packaged build and quit older Electron/Jarvis processes. The collapsed orb handles the native mouse stream as well as its DOM button, so the first click expands the 76×76 orb to the command deck. Escape collapses it; double-click hides it. Run `./script/build_and_run.sh --verify` to exercise the packaged lifecycle.

## Microphone or Speech does not appear in System Settings

Install and launch the same signed `/Applications/Jarvis.app` that you intend to use, then press **Request permissions** in Setup or Connections. macOS attributes TCC permission to code identity; switching between ad-hoc builds may create stale entries. If access was denied, use Jarvis’s direct Settings buttons or reset the development entry with `tccutil reset Microphone com.local.Jarvis` and `tccutil reset SpeechRecognition com.local.Jarvis`, then request again.

System Dictation and `SFSpeechRecognizer` use different assets. If Apple reports no app-facing on-device recognizer, install local Whisper in Connections. Jarvis can also use Apple online Speech only after explicit opt-in.

## Jarvis says no AI route is connected

Save the key before loading models, complete the provider’s free-access confirmation where shown, load the live catalog, then apply or save a verified-free route. Authentication errors stop visibly; quota, timeout, and transient failures may advance through the waterfall. Ollama requires the app running at `127.0.0.1:11434` and `qwen2.5:1.5b` installed. LM Studio must use a loopback `/v1` endpoint.

## A connector stays on Checking, Degraded, or Reconnect

Jarvis validates saved connectors on startup and during Diagnostics. **Checking** is temporary. **Degraded** means a network or service failure kept the saved connection intact; retry when the service is reachable. **Reconnect** means authentication or free-plan verification failed and the credential must be replaced. Diagnostics and exported status never contain the credential itself.

## Native companion unavailable

Run `xcode-select -p`, then `./script/build_native_bridge.sh`. Full Xcode should be selected. The helper protocol must match the Electron app. Diagnostics reports its executable, protocol version, and last error.

## Diagnostics and logs

Open Settings → Diagnostics and run all checks. Exported reports redact keys, tokens, prompts, memory, and document contents. Local structured logs are at `~/Library/Application Support/Jarvis/jarvis.log.jsonl`.

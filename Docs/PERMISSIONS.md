# Permissions and Connections

Jarvis requests access only when the corresponding feature is used.

- **Accessibility:** focused-window controls through the signed native companion.
- **Automation:** Apple Events for Calendar/Reminders/Mail fallbacks and supported apps. macOS authorizes each target independently.
- **Notifications:** completed timers, scheduled routines, and missed-run suggestions.
- **Microphone and Speech Recognition:** Jarvis requests both only after the user presses the permission action in Setup or **Connections → Voice & Native Mac**. The native helper embeds its own privacy usage descriptions so macOS can register the requests. Audio is active only during a visible push-to-talk session, is deleted after transcription, and is never added to memory. Jarvis prefers Apple on-device recognition, then local whisper.cpp. If neither is available, the user may explicitly opt into Apple online Speech, which may send microphone audio to Apple but uses no AI-provider credits. If access was previously denied, use the direct Microphone/Speech settings buttons because macOS will not display the prompt twice.
- **Calendar and Reminders:** native EventKit when the companion is built; bounded Apple-event fallback otherwise. Writes always require Save confirmation.
- **Contacts:** recipient resolution through the native companion.
- **Screen Recording:** explicit one-shot screen OCR only. Jarvis never captures silently or continuously.
- **Chrome site access:** requested one origin at a time by the optional extension. No cookies, history, or password permissions.
- **Spotify/Google:** OAuth PKCE with incremental scopes. Tokens are Keychain-encrypted and removable from Connections.

Jarvis does not request Input Monitoring, Full Disk Access, administrator access, Keychain item enumeration, or a background daemon. Revoke native permissions in System Settings → Privacy & Security, extension origins in Chrome, and account access through Connections or the provider account page.

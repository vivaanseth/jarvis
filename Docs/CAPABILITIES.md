# Capability Matrix

Every executable action enters the main-process capability registry. The parser, AI planner, buttons, and routines cannot bypass its validation or risk calculation.

| Area | Included actions | Boundary |
|---|---|---|
| Apps and windows | Open, switch, hide, quit, list, minimize, maximize, close | Accessibility is requested only for window controls |
| Files | Find, read text, create text, rename, move, duplicate, reveal, Trash | Writes stay inside canonical trusted or favorite roots; broad targets and symlink escapes are rejected |
| Web, research, and Maps | HTTPS URLs, site searches, Tavily research with citations, maps and directions | Search/page content is untrusted; browser search remains available without Tavily |
| Chrome bridge | List tabs, read page text, click, fill, reviewed submit | Per-origin grant; passwords, payments, OTPs, secrets, CAPTCHA, and sensitive identity fields are blocked |
| Spotify | Search/open URI, play, pause/resume, next/previous | Desktop playback works without Premium; Web API features remain optional |
| Productivity | Timers, notifications, calculations, Calendar, Reminders, Contacts, local notes, Apple Notes | Calendar and Reminder writes require Save; Apple Notes must be named explicitly |
| Connected work | Gmail, Google Drive/Contacts/Tasks, GitHub, Microsoft 365, Notion, and Todoist | Optional least-privilege connection and live feature health; writes keep the capability risk policy |
| Local tasks and focus | Create/list/complete tasks and restorable focus timers | Stored only on this Mac unless a connector action is explicitly selected |
| Communication | Draft/send Mail and Messages | Exact recipient/content preview and final high-risk confirmation; ambiguous or bulk recipients are blocked |
| System | Volume, battery, disk, screen saver, display sleep, lock, screenshot interface, Settings panes | Brightness and Focus open System Settings; no private APIs |
| Developer | Git status/log and fixed approved project recipes | Fixed executable URLs and argument arrays inside trusted project roots; never a shell string |
| Shortcuts | List and run a user-selected macOS Shortcut | Jarvis-computed risk can increase and cannot be lowered by Shortcut metadata |
| Documents | Text, Markdown, source, JSON, CSV, PDF text, image OCR | Local extraction; cloud content requires per-request file/provider approval |

Unsupported by design: arbitrary shell or generated-code execution, silent screen capture, coordinate-based browser control, passwords, payments, CAPTCHA solving, permanent deletion, administrator changes, remote access, wake words, and background listening.

Routines may use only capabilities explicitly marked routine-safe. Dry runs never execute. Medium-risk steps are confirmed at start and any high-risk step must be confirmed again when reached. Typed input, finalized speech, the orb, contextual controls, and routines all resolve through this same registry.

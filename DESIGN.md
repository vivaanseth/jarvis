# Jarvis Design System

## Direction

Late-night homework and coding on a MacBook: an original cinematic aerospace command deck with a deep cobalt surface, bright blue telemetry, and sparse semantic warning states. The central circular core uses concentric instrumentation inspired by practical screen graphics, with no planetary orbit motif and no copied film artwork.

The core identity carries forward the strongest parts of the earlier Orion assistant: a 24-tick main graticule, twin rotating sweep arcs, three quiet guide rings, a breathing energy field, and a compact nucleus. The floating version reduces this to 12 ticks while preserving the same silhouette. Animation speed communicates reviewing and processing; nucleus color communicates success or error.

## Color

The source palette is expressed in OKLCH and converted to sRGB in native color assets/tokens.

- Background: `oklch(0.18 0.09 260)`
- Raised surface: `oklch(0.24 0.11 255)`
- Primary ink: `oklch(0.975 0.015 205)`
- Secondary ink: `oklch(0.74 0.035 210)`
- Cyan accent: `oklch(0.82 0.13 210)`
- Amber warning: `oklch(0.78 0.15 65)`
- Success: `oklch(0.715 0.125 155)`
- Warning: `oklch(0.79 0.14 78)`
- Error: `oklch(0.67 0.18 25)`

Bright blue is reserved for primary actions, selection, focus, live telemetry, and assistant state. Amber appears only for warnings. The main console uses a compact navigation rail, one dominant circular core, real local state on the left, and only recent activity plus quick routines on the right. Full data stays on its dedicated page.

## Typography

Use the macOS system font throughout. Titles use semibold weight rather than an alternate display face. Monospaced system type is reserved for exact command previews, paths, and developer output.

## Layout

- Native source-list sidebar with one icon and one label per row.
- Detail content width stays readable; information-dense lists may fill the window.
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Surface corner radii: 14–16 points. Pills and the orb may be fully rounded.
- Materials are limited to the floating panel, menu utility surfaces, and rare overlays.

## Components

Every control supports default, hover, focus, active, disabled, and loading states. Empty states teach one next action. Confirmation surfaces show the exact target and consequence. Errors use a short explanation plus a concrete recovery action.

## Motion

State transitions run 220–300 ms with ease-out or a restrained spring. The idle orb breathes slowly; listening, processing, success, warning, and error each have distinct state motion. Reduced motion replaces scaling and movement with short crossfades.

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"
APP="$OUT_DIR/Jarvis.app"
ELECTRON_APP="$ROOT_DIR/node_modules/electron/dist/Electron.app"
BRIDGE="$ROOT_DIR/.build/release/JarvisNativeBridge"
ENTITLEMENTS="$ROOT_DIR/electron/entitlements.plist"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"

if [[ -f "$ROOT_DIR/.jarvis-signing.env" ]]; then
  # Local, untracked Personal Team configuration.
  source "$ROOT_DIR/.jarvis-signing.env"
fi
SIGN_IDENTITY="${JARVIS_SIGN_IDENTITY:-}"
if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$SIGN_IDENTITY" ]]; then SIGN_IDENTITY="-"; fi
if [[ "${JARVIS_REQUIRE_PERSONAL_SIGNING:-0}" == "1" && "$SIGN_IDENTITY" == "-" ]]; then
  echo "Personal Team signing is required but no Apple Development identity is available." >&2
  echo "Sign into Xcode, create .jarvis-signing.env, and retry." >&2
  exit 1
fi

BRIDGE_STALE=false
if [[ ! -x "$BRIDGE" ]] || find "$ROOT_DIR/Sources/JarvisNativeBridge" -type f -newer "$BRIDGE" -print -quit | grep -q . || [[ "$ROOT_DIR/Package.swift" -nt "$BRIDGE" ]] || [[ "$ROOT_DIR/script/build_native_bridge.sh" -nt "$BRIDGE" ]]; then
  BRIDGE_STALE=true
fi
if [[ -d /Applications/Xcode.app/Contents/Developer && "$BRIDGE_STALE" == true ]]; then
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer "$ROOT_DIR/script/build_native_bridge.sh"
fi

if [[ ! -d "$ELECTRON_APP" ]]; then
  echo "Electron runtime is missing. Run npm install first." >&2
  exit 1
fi

rm -rf "$APP"
mkdir -p "$OUT_DIR"
cp -R "$ELECTRON_APP" "$APP"

PLIST="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Jarvis" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Jarvis" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.local.Jarvis" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion 2" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :LSUIElement false" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :LSUIElement bool false" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :LSBackgroundOnly false" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :LSBackgroundOnly bool false" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :NSMicrophoneUsageDescription Jarvis uses the microphone only for on-device voice commands you initiate." "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string Jarvis uses the microphone only for on-device voice commands you initiate." "$PLIST"
/usr/libexec/PlistBuddy -c "Set :NSSpeechRecognitionUsageDescription Jarvis transcribes voice commands on this Mac." "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :NSSpeechRecognitionUsageDescription string Jarvis transcribes voice commands on this Mac." "$PLIST"
/usr/libexec/PlistBuddy -c "Set :NSCalendarsUsageDescription Jarvis reads and saves calendar items only when you request it." "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :NSCalendarsUsageDescription string Jarvis reads and saves calendar items only when you request it." "$PLIST"
/usr/libexec/PlistBuddy -c "Set :NSRemindersUsageDescription Jarvis reads and saves reminders only when you request it." "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :NSRemindersUsageDescription string Jarvis reads and saves reminders only when you request it." "$PLIST"
/usr/libexec/PlistBuddy -c "Set :NSContactsUsageDescription Jarvis resolves contacts only for actions you preview." "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :NSContactsUsageDescription string Jarvis resolves contacts only for actions you preview." "$PLIST"

RESOURCES="$APP/Contents/Resources"
rm -f "$RESOURCES/default_app.asar"
mkdir -p "$RESOURCES/app"
cp "$ROOT_DIR/package.json" "$RESOURCES/app/package.json"
cp -R "$ROOT_DIR/electron" "$RESOURCES/app/electron"
rm -rf "$RESOURCES/app/electron/tests" "$RESOURCES/app/electron/entitlements.plist"
cp -R "$ROOT_DIR/browser-extension" "$RESOURCES/browser-extension"
cp "$ROOT_DIR/electron/browser-host.cjs" "$RESOURCES/browser-host.cjs"
chmod +x "$RESOURCES/browser-host.cjs"
cp "$ROOT_DIR/Sources/Jarvis/Resources/Jarvis.icns" "$RESOURCES/Jarvis.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile Jarvis.icns" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string Jarvis.icns" "$PLIST"

if [[ -x "$BRIDGE" ]]; then
  mkdir -p "$RESOURCES/native"
  cp "$BRIDGE" "$RESOURCES/native/JarvisNativeBridge"
  chmod +x "$RESOURCES/native/JarvisNativeBridge"
fi

xattr -cr "$APP"
if [[ -x "$RESOURCES/native/JarvisNativeBridge" ]]; then
  codesign --force --options runtime --timestamp=none --sign "$SIGN_IDENTITY" --identifier com.local.Jarvis.NativeBridge "$RESOURCES/native/JarvisNativeBridge"
fi
codesign --force --deep --options runtime --timestamp=none --entitlements "$ENTITLEMENTS" --sign "$SIGN_IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"
if [[ "$SIGN_IDENTITY" == "-" ]]; then
  echo "Packaged with hardened runtime and ad-hoc development signing: $APP"
  echo "Configure .jarvis-signing.env for stable Personal Team permissions."
else
  echo "Packaged with hardened runtime and Personal Team identity: $SIGN_IDENTITY"
fi

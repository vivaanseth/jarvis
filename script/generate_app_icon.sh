#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSET_DIR="$ROOT_DIR/Sources/Jarvis/Resources/Assets.xcassets/AppIcon.appiconset"
TMP_ICONSET="${TMPDIR:-/tmp}/Jarvis.iconset"
rm -rf "$TMP_ICONSET"
mkdir -p "$TMP_ICONSET"
python3 "$ROOT_DIR/script/generate_app_icon.py" "$ASSET_DIR/icon_1024.png"
for size in 16 32 64 128 256 512; do
  sips -z "$size" "$size" "$ASSET_DIR/icon_1024.png" --out "$ASSET_DIR/icon_${size}.png" >/dev/null
done
cp "$ASSET_DIR/icon_16.png" "$TMP_ICONSET/icon_16x16.png"
cp "$ASSET_DIR/icon_32.png" "$TMP_ICONSET/icon_16x16@2x.png"
cp "$ASSET_DIR/icon_32.png" "$TMP_ICONSET/icon_32x32.png"
cp "$ASSET_DIR/icon_64.png" "$TMP_ICONSET/icon_32x32@2x.png"
cp "$ASSET_DIR/icon_128.png" "$TMP_ICONSET/icon_128x128.png"
cp "$ASSET_DIR/icon_256.png" "$TMP_ICONSET/icon_128x128@2x.png"
cp "$ASSET_DIR/icon_256.png" "$TMP_ICONSET/icon_256x256.png"
cp "$ASSET_DIR/icon_512.png" "$TMP_ICONSET/icon_256x256@2x.png"
cp "$ASSET_DIR/icon_512.png" "$TMP_ICONSET/icon_512x512.png"
cp "$ASSET_DIR/icon_1024.png" "$TMP_ICONSET/icon_512x512@2x.png"
iconutil -c icns "$TMP_ICONSET" -o "$ROOT_DIR/Sources/Jarvis/Resources/Jarvis.icns"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d /Applications/Xcode.app/Contents/Developer ]]; then
  echo "A full Xcode installation is required to build the universal macOS companion." >&2
  exit 1
fi

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release --product JarvisNativeBridge --arch x86_64 --arch arm64 --scratch-path .build-universal
BRIDGE="$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift build -c release --product JarvisNativeBridge --arch x86_64 --arch arm64 --scratch-path .build-universal --show-bin-path)/JarvisNativeBridge"
[[ -x "$BRIDGE" ]] || { echo "Universal JarvisNativeBridge was not produced." >&2; exit 1; }
mkdir -p "$ROOT_DIR/.build/release"
cp "$BRIDGE" "$ROOT_DIR/.build/release/JarvisNativeBridge"
lipo "$ROOT_DIR/.build/release/JarvisNativeBridge" -verify_arch x86_64 arm64
echo "Built universal native companion: $ROOT_DIR/.build/release/JarvisNativeBridge"

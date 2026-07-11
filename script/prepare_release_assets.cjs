#!/usr/bin/env node
'use strict';

// Prepares only generated package assets. Credentials and local app state are
// deliberately not read or copied into distributable bundles.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'build-resources');
const sourceIcon = path.join(root, 'Sources', 'Jarvis', 'Resources', 'Assets.xcassets', 'AppIcon.appiconset', 'icon_512.png');
const sourceIcns = path.join(root, 'Sources', 'Jarvis', 'Resources', 'Jarvis.icns');
const nativeDir = path.join(resources, 'native');

fs.mkdirSync(nativeDir, { recursive: true });
fs.copyFileSync(sourceIcon, path.join(resources, 'icon.png'));
fs.copyFileSync(sourceIcns, path.join(resources, 'icon.icns'));

// ICO accepts PNG payloads. Keeping the source artwork intact avoids a
// platform-specific image converter in Windows and Linux release CI.
const png = fs.readFileSync(sourceIcon);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6); header.writeUInt8(0, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(resources, 'icon.ico'), Buffer.concat([header, png]));

const bridge = path.join(root, '.build', 'release', 'JarvisNativeBridge');
const packagedBridge = path.join(nativeDir, 'JarvisNativeBridge');
if (process.platform === 'darwin' && fs.existsSync(bridge)) {
  fs.copyFileSync(bridge, packagedBridge);
  fs.chmodSync(packagedBridge, 0o755);
} else if (fs.existsSync(packagedBridge)) {
  fs.rmSync(packagedBridge);
}

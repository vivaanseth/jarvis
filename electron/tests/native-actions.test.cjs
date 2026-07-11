const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { safeTrashTarget, inside, approvedFilePath, APPROVED_COMMANDS } = require('../services/native-actions.cjs');

test('blocks broad trash targets', () => { assert.throws(() => safeTrashTarget('/'), /refuses/); assert.throws(() => safeTrashTarget(os.homedir()), /refuses/); assert.throws(() => safeTrashTarget('/System'), /refuses/); });
test('canonical containment rejects sibling prefixes', () => { const root = path.join(os.tmpdir(), 'project'); assert.equal(inside(root, path.join(root, 'src')), true); assert.equal(inside(root, `${root}-evil`), false); });
test('developer command set is exact and shell-free', () => { assert.ok(APPROVED_COMMANDS['git status']); assert.equal(APPROVED_COMMANDS['rm -rf /'], undefined); for (const [executable,args] of Object.values(APPROVED_COMMANDS)) { assert.ok(executable.startsWith('/')); assert.ok(Array.isArray(args)); } });
test('file writes resolve only inside explicitly trusted or favorite roots', () => { const root = path.join(os.tmpdir(), 'jarvis-trusted'); const state = { trustedProjects: [{ path: root }], favoriteFolders: [] }; assert.equal(approvedFilePath(path.join(root, 'notes.md'), state), path.join(root, 'notes.md')); assert.throws(() => approvedFilePath('/tmp/outside.txt', state), /Trusted projects or Favorites/); });

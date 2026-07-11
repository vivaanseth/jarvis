const test = require('node:test');
const assert = require('node:assert/strict');
const { orbAnchors, nearestAnchor } = require('../services/orb-placement.cjs');

const area = { x: 0, y: 24, width: 1440, height: 876 };

test('offers all four corners and all four edge midpoints', () => {
  const anchors = orbAnchors(area, 76, 16);
  assert.equal(anchors.length, 8);
  assert.deepEqual(anchors.map(({ row, column }) => [row, column]), [[0,0],[0,1],[0,2],[1,0],[1,2],[2,0],[2,1],[2,2]]);
});

test('snaps to the nearest desktop anchor', () => {
  const topLeft = nearestAnchor({ x: 20, y: 28, width: 76, height: 76 }, area);
  assert.equal(topLeft.x, 16); assert.equal(topLeft.y, 40);
  const bottomMiddle = nearestAnchor({ x: 680, y: 820, width: 76, height: 76 }, area);
  assert.equal(bottomMiddle.row, 2); assert.equal(bottomMiddle.column, 1);
});

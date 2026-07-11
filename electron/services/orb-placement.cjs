function orbAnchors(area, size = 76, margin = 16) {
  const xs = [area.x + margin, area.x + Math.round((area.width - size) / 2), area.x + area.width - size - margin];
  const ys = [area.y + margin, area.y + Math.round((area.height - size) / 2), area.y + area.height - size - margin];
  return ys.flatMap((y, row) => xs.map((x, column) => ({ x, y, row, column }))).filter(point => !(point.row === 1 && point.column === 1));
}

function nearestAnchor(bounds, area, size = 76, margin = 16) {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  return orbAnchors(area, size, margin).reduce((nearest, point) => {
    const distance = Math.hypot(point.x + size / 2 - center.x, point.y + size / 2 - center.y);
    return !nearest || distance < nearest.distance ? { ...point, distance } : nearest;
  }, null);
}

module.exports = { orbAnchors, nearestAnchor };

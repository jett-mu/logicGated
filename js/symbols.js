// Electronic symbols as plain scene primitives (no DOM).
//   {t:'l',x1,y1,x2,y2}  line        {t:'poly',pts,closed,fill}  polygon/polyline
//   {t:'o',x,y,r}        circle      {t:'d',x,y}  junction dot
//   {t:'hop',x,y,r}      hop arc     {t:'t',x,y,s,a}  text
const l = (x1, y1, x2, y2) => ({ t: 'l', x1, y1, x2, y2 });
export const text = (s, x, y, a = 'start') => ({ t: 't', x, y, s, a });
export const dot = (x, y) => ({ t: 'd', x, y });
export const hop = (x, y, r = 5) => ({ t: 'hop', x, y, r });
export const line = l;

// MOSFET. gate lead on the left (or right when mirrored); drain/source vertical.
// PMOS: bubble on the gate, arrow out, body tied to the top (source) terminal.
export function mos(x, y, { p = false, mir = false, label = '' } = {}) {
  const s = mir ? -1 : 1, X = (d) => x + s * d;
  const o = [];
  if (p) { o.push(l(X(-30), y, X(-21), y), { t: 'o', x: X(-18), y, r: 3 }); } else o.push(l(X(-30), y, X(-12), y));
  o.push(
    l(X(-12), y - 10, X(-12), y + 10),
    l(X(-7), y - 12, X(-7), y - 6), l(X(-7), y - 3, X(-7), y + 3), l(X(-7), y + 6, X(-7), y + 12),
    l(X(-7), y - 9, X(8), y - 9), l(X(8), y - 9, X(8), y - 20),
    l(X(-7), y + 9, X(8), y + 9), l(X(8), y + 9, X(8), y + 20),
    l(X(-7), y, X(8), y), l(X(8), y, X(8), y + (p ? -9 : 9)),
  );
  o.push({ t: 'poly', fill: true, closed: true, pts: p
    ? [[X(-6), y - 3], [X(-6), y + 3], [X(0), y]]
    : [[X(-7), y], [X(-1), y - 3], [X(-1), y + 3]] });
  if (label) o.push(text(label, X(8) + s * 6, y + 3, s > 0 ? 'start' : 'end'));
  return { prims: o, g: { x: X(-30), y }, top: { x: X(8), y: y - 20 }, bot: { x: X(8), y: y + 20 } };
}

// NPN BJT: base left, collector up, emitter down (arrow out).
export function npn(x, y, label = '') {
  const o = [
    l(x - 30, y, x - 10, y), l(x - 10, y - 12, x - 10, y + 12),
    l(x - 10, y - 5, x + 8, y - 14), l(x + 8, y - 14, x + 8, y - 20),
    l(x - 10, y + 5, x + 8, y + 14), l(x + 8, y + 14, x + 8, y + 20),
    { t: 'o', x: x - 1, y, r: 17 },
    { t: 'poly', fill: true, closed: true, pts: [[x + 7, y + 13.5], [x - 0.5, y + 12.9], [x + 2, y + 7.9]] },
  ];
  if (label) o.push(text(label, x + 20, y + 4));
  return { prims: o, b: { x: x - 30, y }, c: { x: x + 8, y: y - 20 }, e: { x: x + 8, y: y + 20 } };
}

// IEC box resistor, 40 long. vertical: a=top b=bottom; else a=left b=right.
export function resistor(cx, cy, { vertical = true, label = '' } = {}) {
  if (vertical) {
    return { prims: [l(cx, cy - 20, cx, cy - 12), l(cx, cy + 12, cx, cy + 20),
      { t: 'poly', closed: true, pts: [[cx - 4, cy - 12], [cx + 4, cy - 12], [cx + 4, cy + 12], [cx - 4, cy + 12]] },
      ...(label ? [text(label, cx + 8, cy + 3)] : [])],
    a: { x: cx, y: cy - 20 }, b: { x: cx, y: cy + 20 } };
  }
  return { prims: [l(cx - 20, cy, cx - 12, cy), l(cx + 12, cy, cx + 20, cy),
    { t: 'poly', closed: true, pts: [[cx - 12, cy - 4], [cx + 12, cy - 4], [cx + 12, cy + 4], [cx - 12, cy + 4]] },
    ...(label ? [text(label, cx, cy - 8, 'middle')] : [])],
  a: { x: cx - 20, y: cy }, b: { x: cx + 20, y: cy } };
}

export const supply = (x, y, name = 'VDD') => [l(x, y, x, y - 8), l(x - 7, y - 8, x + 7, y - 8), text(name, x, y - 12, 'middle')];
export const ground = (x, y) => [l(x, y, x, y + 6), l(x - 8, y + 6, x + 8, y + 6), l(x - 5, y + 9, x + 5, y + 9), l(x - 2, y + 12, x + 2, y + 12)];

export function shift(prims, dx, dy) {
  return prims.map((p) => {
    const q = { ...p };
    if ('x' in q) q.x += dx;
    if ('y' in q) q.y += dy;
    if ('x1' in q) { q.x1 += dx; q.x2 += dx; q.y1 += dy; q.y2 += dy; }
    if (q.pts) q.pts = q.pts.map(([x, y]) => [x + dx, y + dy]);
    return q;
  });
}

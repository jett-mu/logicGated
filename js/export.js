// Professional schematic export: clean white sheet, border, title block.
import { dims } from './model.js';
import { el, renderCircuit, SVG_CSS } from './render.js';
import { buildNetlist } from './netlist.js';
import { renderSchematic } from './schematic.js';

const PRINT_VARS = '--ink:#111827;--body:#ffffff;--off:#9ca3af;--on:#15803d;--dim:#6b7280;--accent:#2563eb;--bulbOff:#ffffff;--bulbOn:#facc15;';

export function buildSchematic(circ, out) {
  let minX = 0, minY = 0, maxX = 360, maxY = 140;
  if (circ.components.length) {
    minX = Math.min(...circ.components.map((c) => c.x)) - 50;
    minY = Math.min(...circ.components.map((c) => c.y)) - 50;
    maxX = Math.max(...circ.components.map((c) => c.x + dims(c).w)) + 50;
    maxY = Math.max(...circ.components.map((c) => c.y + dims(c).h)) + 50;
  }
  const tbW = 330, tbH = 66;
  maxX = Math.max(maxX, minX + tbW + 40);
  maxY += tbH + 10;
  const W = maxX - minX, H = maxY - minY;

  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: W, height: H, viewBox: `${minX} ${minY} ${W} ${H}`, style: PRINT_VARS });
  svg.append(el('style', {}, []));
  svg.lastChild.textContent = SVG_CSS;
  svg.append(el('rect', { x: minX, y: minY, width: W, height: H, fill: '#fff' }));
  svg.append(el('rect', { x: minX + 8, y: minY + 8, width: W - 16, height: H - 16, fill: 'none', stroke: '#111827', 'stroke-width': 1.5 }));
  const g = el('g');
  renderCircuit(g, circ, out, { interactive: false });
  svg.append(g);

  const tx = maxX - 8 - tbW, ty = maxY - 8 - tbH;
  const t = (s, x, y, size, weight = 600, fill = '#111827') => {
    const e = el('text', { x: tx + x, y: ty + y, 'font-family': 'ui-monospace,Menlo,Consolas,monospace', 'font-size': size, 'font-weight': weight, fill });
    e.textContent = s; return e;
  };
  // Title block as a small table: header row, label row, value row.
  svg.append(el('rect', { x: tx, y: ty, width: tbW, height: tbH, fill: '#fff', stroke: '#111827', 'stroke-width': 1.5 }));
  svg.append(el('line', { x1: tx, y1: ty + 26, x2: tx + tbW, y2: ty + 26, stroke: '#111827' }));
  svg.append(el('line', { x1: tx, y1: ty + 44, x2: tx + tbW, y2: ty + 44, stroke: '#9ca3af' }));
  svg.append(t('GATEWRIGHT — LOGIC SCHEMATIC', 10, 18, 12, 700));
  const cols = [['DATE', new Date().toISOString().slice(0, 10), 130], ['PARTS', String(circ.components.length), 100], ['WIRES', String(circ.wires.length), 100]];
  let off = 0;
  for (const [label, value, w] of cols) {
    if (off) svg.append(el('line', { x1: tx + off, y1: ty + 26, x2: tx + off, y2: ty + tbH, stroke: '#111827' }));
    svg.append(t(label, off + 8, 39, 9, 600, '#6b7280'));
    svg.append(t(value, off + 8, 57, 11, 700));
    off += w;
  }
  return { svg: new XMLSerializer().serializeToString(svg), width: W, height: H };
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportSVG(circ, out) {
  const { svg } = buildSchematic(circ, out);
  download(new Blob([svg], { type: 'image/svg+xml' }), 'gatewright-schematic.svg');
}

function rasterize(svg, width, height, name, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    // Browsers cap canvas size; keep huge schematics inside ~16k px.
    const k = Math.min(scale, 16000 / Math.max(width, height));
    cv.width = Math.round(width * k);
    cv.height = Math.round(height * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    cv.toBlob((b) => download(b, name), 'image/png');
  };
  img.src = url;
}

export function exportPNG(circ, out, scale = 2) {
  const { svg, width, height } = buildSchematic(circ, out);
  rasterize(svg, width, height, 'gatewright-schematic.png', scale);
}

// ---- transistor-level circuit export ------------------------------------
export function circuitSchematic(circ, tech) {
  const nl = buildNetlist(circ);
  return { nl, ...renderSchematic(nl, tech) };
}

export function exportCircuitSVG(circ, tech) {
  download(new Blob([circuitSchematic(circ, tech).svg], { type: 'image/svg+xml' }), `gatewright-circuit-${tech}.svg`);
}

export function exportCircuitPNG(circ, tech) {
  const { svg, width, height } = circuitSchematic(circ, tech);
  rasterize(svg, width, height, `gatewright-circuit-${tech}.png`, 2);
}

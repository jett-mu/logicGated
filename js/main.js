import { Circuit, DEFS, GROUPS, defaultState, dims, pinPos } from './model.js';
import { simulate } from './sim.js';
import { el, renderCircuit, drawComponent, SVG_CSS } from './render.js';
import { autosave, restore, saveFile, loadFile } from './storage.js';
import { circuitSchematic, exportCircuitPNG, exportCircuitSVG, exportPNG, exportSVG } from './export.js';
import { EXAMPLES } from './examples.js';

const $ = (s) => document.querySelector(s);
const svg = $('#ws'), world = $('#world'), grid = $('#grid'), hint = $('#hint');
const circ = new Circuit();
let out = {};
let view = { x: 40, y: 60, k: 1 };
let sel = null;   // {kind:'c'|'w', id}
let drag = null;

const snap = (v) => Math.round(v / 10) * 10;
const toWorld = (e) => {
  const r = svg.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
};

// ---- drawing ------------------------------------------------------------
function tempWire() {
  if (drag?.type !== 'wire') return null;
  const at = (e, side) => (e.c === undefined ? e : pinPos(circ.get(e.c), side, e.p));
  if (drag.side === 'out') {
    return { a: at(drag.from, 'out'), b: drag.pos, on: drag.from.c !== undefined && out[`${drag.from.c}:${drag.from.p}`] };
  }
  return { a: drag.pos, b: at(drag.to, 'in'), on: false };
}

function draw() {
  world.replaceChildren();
  renderCircuit(world, circ, out, { interactive: true, selected: sel, temp: tempWire() });
  world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  const s = 20 * view.k;
  grid.setAttribute('width', s); grid.setAttribute('height', s);
  grid.setAttribute('patternTransform', `translate(${view.x},${view.y})`);
  hint.hidden = circ.components.length > 0;
  updateInspector();
}

// Undo/redo: snapshots of the circuit, recorded whenever its structure
// (parts, positions, wires) changes. Switch/key states don't create entries.
const hist = [];
let hi = -1;
const structKey = () => JSON.stringify([circ.components.map((c) => [c.id, c.type, c.x, c.y, c.state.bits, c.state.base, c.state.min, c.state.max]), circ.wires]);

function record() {
  const key = structKey();
  if (hist[hi]?.key === key) return;
  hist.length = hi + 1;
  hist.push({ key, json: JSON.stringify(circ.toJSON()) });
  if (hist.length > 100) hist.shift();
  hi = hist.length - 1;
}

function stepHistory(dir) {
  const n = hi + dir;
  if (n < 0 || n >= hist.length) return;
  hi = n;
  const states = new Map(circ.components.map((c) => [c.id, [c.type, c.state]]));
  circ.load(JSON.parse(hist[hi].json));
  const live = ['on', 'down', 'value', 'running']; // runtime state survives undo; settings come from the snapshot
  for (const c of circ.components) {
    const old = states.get(c.id);
    if (old && old[0] === c.type) for (const k of live) if (k in old[1]) c.state[k] = old[1][k];
    if (c.type === 'numpad') c.state.value = Math.min(c.state.max, Math.max(c.state.min, c.state.value));
  }
  sel = null;
  inspKey = undefined;
  refresh(false);
  autosave(circ);
}

function refresh(save = true) {
  out = simulate(circ, out);
  draw();
  if (save) { record(); autosave(circ); }
}

function fit() {
  if (!circ.components.length) { view = { x: 40, y: 60, k: 1 }; return; }
  const r = svg.getBoundingClientRect();
  const xs = circ.components.flatMap((c) => [c.x, c.x + dims(c).w]);
  const ys = circ.components.flatMap((c) => [c.y, c.y + dims(c).h]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(1.5, Math.max(0.3, Math.min((r.width - 120) / (x1 - x0), (r.height - 120) / (y1 - y0))));
  view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
}

// ---- canvas interaction -------------------------------------------------
svg.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const t = e.target, p = toWorld(e);
  const pin = t.closest('[data-pin]'), ctl = t.closest('[data-ctl]');
  const comp = t.closest('[data-comp]'), wire = t.closest('[data-wire]');
  const endH = t.closest('[data-wireend]');

  if (endH) { // grab an open wire end: re-drag it from the pinned end
    const w = circ.wires.find((x) => x.id === +endH.dataset.wire);
    circ.removeWire(w.id);
    drag = endH.dataset.wireend === 'to'
      ? { type: 'wire', side: 'out', from: w.from, pos: p }
      : { type: 'wire', side: 'in', to: w.to, pos: p };
    sel = null;
  } else if (pin) {
    const c = +pin.dataset.c, pi = +pin.dataset.p;
    if (pin.dataset.pin === 'out') drag = { type: 'wire', side: 'out', from: { c, p: pi }, pos: p };
    else {
      const w = circ.wires.find((x) => x.to.c === c && x.to.p === pi);
      if (w) { // pick the wire back up from its input end
        circ.removeWire(w.id);
        drag = { type: 'wire', side: 'out', from: w.from, pos: p };
      } else drag = { type: 'wire', side: 'in', to: { c, p: pi }, pos: p };
    }
    sel = null;
  } else if (ctl) {
    const c = circ.get(+ctl.dataset.c);
    sel = { kind: 'c', id: c.id };
    const a = ctl.dataset.ctl;
    if (a === 'toggle') c.state.on = !c.state.on;
    else if (a === 'press') { c.state.down = true; drag = { type: 'press', c }; }
    else if (a === 'num') c.state.value = +ctl.dataset.v;
    else if (a === 'step') c.state.value = Math.min(c.state.max, Math.max(c.state.min, c.state.value + +ctl.dataset.v));
    else if (a === 'run') c.state.running = !c.state.running;
    refresh();
    if (drag) addDragListeners();
    return;
  } else if (comp) {
    const c = circ.get(+comp.dataset.comp);
    sel = { kind: 'c', id: c.id };
    drag = { type: 'move', c, dx: p.x - c.x, dy: p.y - c.y };
  } else if (wire) {
    const w = circ.wires.find((x) => x.id === +wire.dataset.wire);
    const at = (e, side) => (e.c === undefined ? e : pinPos(circ.get(e.c), side, e.p));
    const a = at(w.from, 'out'), b = at(w.to, 'in');
    const da = Math.hypot(a.x - p.x, a.y - p.y), db = Math.hypot(b.x - p.x, b.y - p.y);
    const reach = 30 / view.k;
    if (Math.min(da, db) < reach) { // grabbed near an end: detach that end
      circ.removeWire(w.id);
      drag = da <= db
        ? { type: 'wire', side: 'in', to: w.to, pos: p }
        : { type: 'wire', side: 'out', from: w.from, pos: p };
      sel = null;
    } else {
      sel = { kind: 'w', id: w.id };
      if (w.from.c === undefined && w.to.c === undefined) {
        drag = { type: 'movewire', w, p0: p, a: { ...w.from }, b: { ...w.to } };
      }
    }
  } else {
    sel = null;
    drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  }
  draw();
  if (drag) addDragListeners();
});

function addDragListeners() {
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function onMove(e) {
  if (!drag) return;
  if (drag.type === 'move') {
    const p = toWorld(e);
    drag.c.x = snap(p.x - drag.dx); drag.c.y = snap(p.y - drag.dy);
    draw();
  } else if (drag.type === 'pan') {
    view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy;
    draw();
  } else if (drag.type === 'wire') {
    drag.pos = toWorld(e);
    draw();
  } else if (drag.type === 'movewire') {
    const p = toWorld(e), dx = snap(p.x - drag.p0.x), dy = snap(p.y - drag.p0.y);
    drag.w.from = { x: drag.a.x + dx, y: drag.a.y + dy };
    drag.w.to = { x: drag.b.x + dx, y: drag.b.y + dy };
    draw();
  }
}

// Find the pin a dropped wire should land on: the exact pin if hit, else the
// nearest matching pin on the component under the cursor; none on empty canvas.
function pinAt(e, side) {
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const exact = hit?.closest?.('[data-pin]');
  if (exact && exact.dataset.pin === side) return { c: +exact.dataset.c, p: +exact.dataset.p };
  const over = hit?.closest?.('[data-comp]');
  const overId = over ? +over.dataset.comp : null;
  const w = toWorld(e);
  let best = null, bestD = Infinity;
  for (const c of circ.components) {
    if (overId !== null && c.id !== overId) continue;
    const n = side === 'in' ? dims(c).ins : dims(c).outs;
    for (let i = 0; i < n; i++) {
      const q = pinPos(c, side, i), dist = Math.hypot(q.x - w.x, q.y - w.y);
      if (dist < bestD) { bestD = dist; best = { c: c.id, p: i }; }
    }
  }
  return overId !== null ? best : null; // empty canvas → open-ended wire
}

function onUp(e) {
  window.removeEventListener('pointermove', onMove);
  const d = drag; drag = null;
  if (d?.type === 'press') d.c.state.down = false;
  if (d?.type === 'wire') {
    const target = pinAt(e, d.side === 'out' ? 'in' : 'out');
    const free = (() => { const w = toWorld(e); return { x: snap(w.x), y: snap(w.y) }; })();
    if (d.side === 'out') circ.connect(d.from, target ?? free);
    else circ.connect(target ?? free, d.to);
  }
  refresh();
}

svg.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const comp = e.target.closest('[data-comp]'), wire = e.target.closest('[data-wire]');
  if (comp) circ.remove(+comp.dataset.comp);
  else if (wire) circ.removeWire(+wire.dataset.wire);
  else return;
  sel = null;
  refresh();
});

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = Math.min(2.5, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0015)));
  view.x = mx - ((mx - view.x) / view.k) * k;
  view.y = my - ((my - view.y) / view.k) * k;
  view.k = k;
  draw();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
    e.preventDefault();
    if (sel.kind === 'c') circ.remove(sel.id); else circ.removeWire(sel.id);
    sel = null;
    refresh();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    stepHistory(e.shiftKey ? 1 : -1);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    stepHistory(1);
  } else if (e.key === 'Escape') { sel = null; draw(); }
});

// ---- palette (drag parts onto the canvas) -------------------------------
const palette = $('#palette');
let spawnN = 0;
for (const group of GROUPS) {
  const sect = document.createElement('section');
  sect.innerHTML = `<h3>${group}</h3>`;
  const row = document.createElement('div');
  row.className = 'items';
  for (const [type, def] of Object.entries(DEFS).filter(([, d]) => d.group === group)) {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.type = type;
    item.title = `Drag onto the canvas (or click) — ${def.label}`;
    const pv = el('svg', { viewBox: `-14 -18 ${def.w + 28} ${def.h + 32}`, class: 'pv' });
    pv.append(el('style')); pv.firstChild.textContent = SVG_CSS;
    pv.append(drawComponent({ id: 0, type, x: 0, y: 0, state: type === 'numpad' ? { ...defaultState(type), value: 5 } : defaultState(type) }, {}, new Map()));
    item.append(pv);
    item.insertAdjacentHTML('beforeend', `<span>${def.label}</span>`);
    row.append(item);
  }
  sect.append(row);
  palette.append(sect);
}

{
  const sect = document.createElement('section');
  sect.innerHTML = '<h3>Wiring</h3>';
  const item = document.createElement('div');
  item.className = 'item';
  item.dataset.type = 'wire';
  item.title = 'Free wire with two open ends — drag its ends onto pins';
  const pv = el('svg', { viewBox: '-14 -18 108 50', class: 'pv' });
  pv.append(el('style')); pv.firstChild.textContent = SVG_CSS;
  pv.append(el('path', { class: 'wire', d: 'M0,10 C30,10 50,10 80,10' }));
  pv.append(el('circle', { class: 'endpt', cx: 0, cy: 10, r: 5 }), el('circle', { class: 'endpt', cx: 80, cy: 10, r: 5 }));
  item.append(pv);
  item.insertAdjacentHTML('beforeend', '<span>Wire</span>');
  const row = document.createElement('div');
  row.className = 'items';
  row.append(item);
  sect.append(row);
  palette.append(sect);
}

palette.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('.item');
  if (!item || e.button !== 0) return;
  e.preventDefault();
  const type = item.dataset.type, def = type === 'wire' ? { w: 80, h: 0 } : DEFS[type];
  const ghost = item.querySelector('svg').cloneNode(true);
  ghost.classList.add('ghost');
  ghost.style.width = `${def.w * view.k}px`;
  document.body.append(ghost);
  let moved = false;
  const place = (ev) => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
  place(e);
  const move = (ev) => { moved = true; place(ev); };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    ghost.remove();
    const r = svg.getBoundingClientRect();
    let x, y;
    const inside = ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom;
    if (moved && inside) {
      const p = toWorld(ev); x = p.x - def.w / 2; y = p.y - def.h / 2;
    } else if (!moved) { // plain click: drop near the centre, staggered
      const p = toWorld({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      x = p.x - def.w / 2 + (spawnN % 5) * 20; y = p.y - def.h / 2 + (spawnN++ % 5) * 20;
    } else return;
    if (type === 'wire') {
      circ.connect({ x: snap(x), y: snap(y) }, { x: snap(x) + 80, y: snap(y) });
      sel = { kind: 'w', id: circ.wires.at(-1).id };
    } else sel = { kind: 'c', id: circ.add(type, snap(x), snap(y)).id };
    refresh();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
});

// ---- inspector (number pad / display settings) ---------------------------
const insp = $('#inspector');
let inspKey = null, inspFields = null;

function updateInspector() {
  const c = sel?.kind === 'c' ? circ.get(sel.id) : null;
  const key = c && (c.type === 'numpad' || c.type === 'display') ? c.id : null;
  if (key !== inspKey) {
    inspKey = key;
    insp.replaceChildren();
    insp.hidden = key === null;
    inspFields = null;
    if (key === null) return;
    const field = (label, input) => {
      const l = document.createElement('label');
      l.append(Object.assign(document.createElement('span'), { textContent: label }), input);
      insp.append(l);
      return input;
    };
    const num = (min, max) => Object.assign(document.createElement('input'), { type: 'number', min, max, step: 1 });
    const base = document.createElement('select');
    for (const [v, t] of [['bin', 'Binary'], ['dec', 'Decimal'], ['hex', 'Hex']]) base.append(new Option(t, v));
    insp.append(Object.assign(document.createElement('h3'), { textContent: c.type === 'numpad' ? 'Number pad' : 'Display' }));
    inspFields = { base: field('Format', base), bits: field('Bits', num(1, 8)) };
    if (c.type === 'numpad') { inspFields.min = field('Min', num(0, 255)); inspFields.max = field('Max', num(0, 255)); }
    for (const [k, input] of Object.entries(inspFields)) {
      input.addEventListener('change', () => {
        const part = circ.get(key);
        circ.configure(part, { [k]: k === 'base' ? input.value : +input.value });
        refresh();
      });
    }
  }
  if (inspFields) {
    const s = circ.get(inspKey).state;
    for (const [k, input] of Object.entries(inspFields)) if (document.activeElement !== input) input.value = s[k];
  }
}

// ---- toolbar ------------------------------------------------------------
function loadExample(name) {
  circ.clear(); out = {}; sel = null;
  EXAMPLES[name](circ);
  fit(); refresh();
}

const exSel = $('#examples');
for (const name of Object.keys(EXAMPLES)) exSel.append(new Option(name, name));
exSel.addEventListener('change', () => { if (exSel.value) loadExample(exSel.value); exSel.value = ''; });

$('#btn-new').onclick = () => {
  if (circ.components.length && !confirm('Clear the whole workspace?')) return;
  circ.clear(); out = {}; sel = null; refresh();
};
$('#btn-save').onclick = () => saveFile(circ);
$('#btn-open').onclick = () => $('#file').click();
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { out = {}; await loadFile(circ, f); sel = null; fit(); refresh(); }
  catch (err) { alert(`Could not open file: ${err.message}`); }
});
$('#btn-undo').onclick = () => stepHistory(-1);
$('#btn-redo').onclick = () => stepHistory(1);
$('#btn-fit').onclick = () => { fit(); draw(); };
$('#btn-png').onclick = () => exportPNG(circ, out);
$('#btn-svg').onclick = () => exportSVG(circ, out);

// ---- transistor-level circuit export -------------------------------------
const dlg = $('#circuit-dlg'), cTech = $('#c-tech'), cZoom = $('#c-zoom'), cPrev = $('#c-preview');
function renderCircuitDialog() {
  const r = circuitSchematic(circ, cTech.value);
  const empty = r.nl.stages.length === 0;
  cPrev.className = cZoom.value === 'fit' ? 'fit' : '';
  if (empty) cPrev.innerHTML = '<div class="empty">Nothing to expand yet — add some logic gates and wire them up.</div>';
  else cPrev.innerHTML = r.svg;
  $('#c-stats').textContent = empty ? '' : `${r.transistors} transistors · ${r.stages} stages`;
  $('#c-svg').disabled = $('#c-png').disabled = empty;
}
$('#btn-circuit').onclick = () => { renderCircuitDialog(); dlg.showModal(); };
cTech.addEventListener('change', renderCircuitDialog);
cZoom.addEventListener('change', renderCircuitDialog);
$('#c-close').onclick = () => dlg.close();
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
$('#c-svg').onclick = () => exportCircuitSVG(circ, cTech.value);
$('#c-png').onclick = () => exportCircuitPNG(circ, cTech.value);

// ---- clock ticks --------------------------------------------------------
setInterval(() => {
  let any = false;
  for (const c of circ.components) if (c.type === 'clock' && c.state.running) { c.state.on = !c.state.on; any = true; }
  if (any) refresh(false);
}, 500);

// ---- boot ---------------------------------------------------------------
if (restore(circ)) { fit(); refresh(false); record(); } else loadExample('Half adder');
window.addEventListener('resize', draw);

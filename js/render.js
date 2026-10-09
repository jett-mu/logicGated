// SVG rendering for components and wires. Shared by the live canvas,
// the palette previews and the PNG/SVG exporter.
import { dims, fmt, localPin, pinPos } from './model.js';
import { buildSrc } from './sim.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, kids = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  for (const k of [].concat(kids)) if (k != null) e.append(k);
  return e;
}
const text = (s, x, y, cls = 'txt') => { const t = el('text', { x, y, class: cls }); t.textContent = s; return t; };

// Colours come from CSS variables so the same markup themes for screen and print.
export const SVG_CSS = `
.wire{fill:none;stroke:var(--off);stroke-width:3;stroke-linecap:round}
.wire.on{stroke:var(--on)}
.wiresel{fill:none;stroke:var(--accent);stroke-width:8;opacity:.45;stroke-linecap:round}
.wirehit{fill:none;stroke:transparent;stroke-width:16;pointer-events:stroke;cursor:pointer}
.endpt{fill:var(--body);stroke:var(--off);stroke-width:2}
.endpt.on{stroke:var(--on)}
.endhit{fill:transparent;cursor:grab}
.wire.temp{stroke-dasharray:6 5;pointer-events:none}
.body{fill:var(--body);stroke:var(--ink);stroke-width:2;stroke-linejoin:round}
.stub{fill:none;stroke:var(--ink);stroke-width:2;stroke-linecap:round}
.bubble{fill:var(--body);stroke:var(--ink);stroke-width:2}
.pin{fill:var(--off);stroke:var(--ink);stroke-width:1.5}
.pin.on{fill:var(--on)}
.pinhit{fill:transparent;cursor:crosshair}
.selbox{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-dasharray:5 4}
.txt{fill:var(--ink);font:600 11px ui-monospace,Menlo,Consolas,monospace;text-anchor:middle;pointer-events:none;user-select:none}
.txt.dim{fill:var(--dim);font-size:10px;letter-spacing:.08em}
.txt.big{font-size:40px;font-weight:700}
.txt.big.on{fill:var(--on)}
.track{fill:var(--bulbOff);stroke:var(--ink);stroke-width:1.5;cursor:pointer}
.track.on{fill:var(--on)}
.knob{fill:var(--ink);cursor:pointer}
.key{fill:var(--bulbOff);stroke:var(--ink);stroke-width:1.5;cursor:pointer}
.key.on{fill:var(--on)}
.nkey{fill:var(--bulbOff);stroke:var(--off);stroke-width:1;cursor:pointer}
.nkey.on{fill:var(--on);stroke:var(--ink)}
.nkey.on + .txt{fill:#04210f}
.led{fill:var(--bulbOff);stroke:var(--ink);stroke-width:1.5}
.led.on{fill:var(--on)}
.glass{fill:var(--bulbOff);stroke:var(--ink);stroke-width:2}
.glass.on{fill:var(--bulbOn)}
.halo{fill:var(--bulbOn);opacity:.28}
`;

const SHAPES = {
  and:  { d: 'M0,0 H32 A30,30 0 0 1 32,60 H0 Z', tip: 62 },
  or:   { d: 'M0,0 C25,0 50,8 65,30 C50,52 25,60 0,60 C14,42 14,18 0,0 Z', tip: 65 },
  not:  { d: 'M0,0 L58,30 L0,60 Z', tip: 58 },
};
const GATE_STYLE = {
  and: ['and'], nand: ['and', true], or: ['or'], nor: ['or', true],
  xor: ['or', false, true], xnor: ['or', true, true], not: ['not', true], buf: ['not'],
};

function drawGate(g, c, def) {
  const [shape, inv, extra] = GATE_STYLE[c.type];
  const { d, tip } = SHAPES[shape];
  const ys = Array.from({ length: def.ins }, (_, i) => localPin(def, 'in', i).y);
  const my = def.h / 2;
  for (const y of ys) g.append(el('line', { class: 'stub', x1: 0, y1: y, x2: 22, y2: y }));
  const outStart = 10 + tip + (inv ? 10 : 0);
  g.append(el('line', { class: 'stub', x1: outStart, y1: my, x2: def.w, y2: my }));
  g.append(el('path', { class: 'body', d, transform: 'translate(10,0)' }));
  if (extra) g.append(el('path', { class: 'stub', d: 'M-6,0 C8,18 8,42 -6,60', transform: 'translate(10,0)' }));
  if (inv) g.append(el('circle', { class: 'bubble', cx: 10 + tip + 5, cy: my, r: 5 }));
  g.append(text(def.label, 45, -7, 'txt dim'));
}

function drawBody(g, c, def, val) {
  const { w, h } = def;
  const box = () => g.append(el('rect', { class: 'body', x: 0, y: 0, width: w, height: h, rx: 8 }));
  switch (c.type) {
    case 'switch': {
      const on = c.state.on, ctl = { 'data-ctl': 'toggle', 'data-c': c.id };
      box(); g.append(text('SWITCH', 40, 14, 'txt dim'));
      g.append(el('rect', { class: 'track' + (on ? ' on' : ''), x: 20, y: 22, width: 40, height: 20, rx: 10, ...ctl }));
      g.append(el('circle', { class: 'knob', cx: on ? 50 : 30, cy: 32, r: 7, ...ctl }));
      break;
    }
    case 'button':
      box(); g.append(text('BUTTON', 35, 14, 'txt dim'));
      g.append(el('circle', { class: 'key' + (c.state.down ? ' on' : ''), cx: 35, cy: 36, r: 16, 'data-ctl': 'press', 'data-c': c.id }));
      break;
    case 'clock':
      box();
      g.append(text('CLOCK', 40, 14, 'txt dim'));
      // Only the lamp toggles run/pause, so the rest of the body drags the part.
      g.append(el('circle', { class: 'led' + (c.state.on ? ' on' : ''), cx: 20, cy: 33, r: 9, 'data-ctl': 'run', 'data-c': c.id, style: 'cursor:pointer' }));
      g.append(text(c.state.running ? '1 Hz' : 'paused', 52, 37));
      break;
    case 'numpad': {
      const { bits, min, max, base, value } = c.state, n = max - min + 1;
      box(); g.append(text('NUMBER PAD', 66, 16, 'txt dim'));
      const lab = (v) => fmt(v, base, bits);
      const size = (s) => (s.length > 2 ? Math.max(6, Math.floor(26 / (s.length * 0.62))) : 11);
      if (n <= 16) {
        for (let i = 0; i < n; i++) {
          const x = 8 + (i % 4) * 28, y = 26 + Math.floor(i / 4) * 30, l = lab(min + i);
          g.append(el('rect', { class: 'nkey' + (value === min + i ? ' on' : ''), x, y, width: 25, height: 26, rx: 4, 'data-ctl': 'num', 'data-c': c.id, 'data-v': min + i }));
          const t = text(l, x + 12.5, y + 17); t.setAttribute('style', `font-size:${size(l)}px`); g.append(t);
        }
      } else {
        const l = lab(value);
        const t = text(l, 66, 52, 'txt big'); t.setAttribute('style', `font-size:${Math.min(26, Math.floor(110 / (l.length * 0.62)))}px`);
        g.append(t);
        if (base !== 'dec') g.append(text(`= ${value}`, 66, 68, 'txt dim'));
        [[-16, '-16'], [-1, '-1'], [1, '+1'], [16, '+16']].forEach(([d, s], k) => {
          const x = 8 + k * 28;
          g.append(el('rect', { class: 'nkey', x, y: 76, width: 25, height: 26, rx: 4, 'data-ctl': 'step', 'data-c': c.id, 'data-v': d }));
          g.append(text(s, x + 12.5, 93));
        });
      }
      for (let i = 0; i < bits; i++) {
        const t = text(2 ** (bits - 1 - i), w - 10, localPin(def, 'out', i).y + 4, 'txt dim');
        t.setAttribute('style', 'text-anchor:end'); g.append(t);
      }
      break;
    }
    case 'bulb': {
      const on = val(`${c.id}:in`);
      if (on) g.append(el('circle', { class: 'halo', cx: 38, cy: 30, r: 29 }));
      g.append(el('line', { class: 'stub', x1: 0, y1: 30, x2: 21, y2: 30 }));
      g.append(el('circle', { class: 'glass' + (on ? ' on' : ''), cx: 38, cy: 30, r: 17 }));
      g.append(el('path', { class: 'stub', d: 'M31,23 L45,37 M45,23 L31,37' }));
      break;
    }
    case 'display': {
      const { bits, base } = c.state;
      const v = Array.from({ length: bits }, (_, i) => val(`${c.id}:${i}`)).reduce((a, bit) => a * 2 + bit, 0);
      const l = fmt(v, base, bits);
      box();
      const cx = (34 + w - 6) / 2, avail = w - 40; // clear of the weight labels on the left
      const t = text(l, cx, h / 2 + 12, 'txt big' + (v ? ' on' : ''));
      t.setAttribute('style', `font-size:${Math.min(40, Math.floor(avail / (l.length * 0.62)))}px`);
      g.append(t);
      g.append(text(base === 'dec' ? `0x${fmt(v, 'hex', bits)}` : `= ${v}`, cx, h - 14, 'txt dim'));
      for (let i = 0; i < bits; i++) {
        const lb = text(2 ** (bits - 1 - i), 10, localPin(def, 'in', i).y + 4, 'txt dim');
        lb.setAttribute('style', 'text-anchor:start'); g.append(lb);
      }
      break;
    }
    default: drawGate(g, c, def);
  }
}

export function drawComponent(c, out, src, opts = {}) {
  const def = dims(c);
  const g = el('g', { class: 'comp', transform: `translate(${c.x},${c.y})`, 'data-comp': c.id });
  if (opts.selected) g.append(el('rect', { class: 'selbox', x: -8, y: -12, width: def.w + 16, height: def.h + 20, rx: 8 }));
  // Hit area so the whole footprint is draggable.
  g.append(el('rect', { x: 0, y: 0, width: def.w, height: def.h, fill: 'transparent' }));
  const inVal = (i) => (out[src.get(`${c.id}:${i}`)] ? 1 : 0);
  // Display/bulb read their inputs; others read their own outputs.
  const val = (k) => {
    if (k.endsWith(':in')) return inVal(0);
    const [, p] = k.split(':');
    return c.type === 'display' ? inVal(+p) : out[k] ? 1 : 0;
  };
  drawBody(g, c, def, val);
  for (const side of ['in', 'out']) {
    const n = side === 'in' ? def.ins : def.outs;
    for (let i = 0; i < n; i++) {
      const p = localPin(def, side, i);
      const on = side === 'in' ? inVal(i) : out[`${c.id}:${i}`];
      g.append(el('circle', { class: 'pin' + (on ? ' on' : ''), cx: p.x, cy: p.y, r: 5 }));
      if (opts.interactive) g.append(el('circle', { class: 'pinhit', cx: p.x, cy: p.y, r: 11, 'data-pin': side, 'data-c': c.id, 'data-p': i }));
    }
  }
  return g;
}

export function wirePath(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

// opts: {interactive, selected: {kind,id}|null, temp: {a,b,on}|null}
export function renderCircuit(g, circ, out, opts = {}) {
  const src = buildSrc(circ);
  const at = (e, side) => {
    if (e.c === undefined) return { x: e.x, y: e.y };
    const c = circ.get(e.c);
    return c ? pinPos(c, side, e.p) : null;
  };
  for (const w of circ.wires) {
    const a = at(w.from, 'out'), b = at(w.to, 'in');
    if (!a || !b) continue;
    const d = wirePath(a, b);
    const on = w.from.c !== undefined && out[`${w.from.c}:${w.from.p}`];
    if (opts.selected?.kind === 'w' && opts.selected.id === w.id) g.append(el('path', { class: 'wiresel', d }));
    g.append(el('path', { class: 'wire' + (on ? ' on' : ''), d }));
    if (opts.interactive) g.append(el('path', { class: 'wirehit', d, 'data-wire': w.id }));
    // Open ends get a visible, draggable handle.
    for (const [side, e, pt] of [['from', w.from, a], ['to', w.to, b]]) {
      if (e.c !== undefined) continue;
      g.append(el('circle', { class: 'endpt' + (on ? ' on' : ''), cx: pt.x, cy: pt.y, r: 5 }));
      if (opts.interactive) g.append(el('circle', { class: 'endhit', cx: pt.x, cy: pt.y, r: 11, 'data-wireend': side, 'data-wire': w.id }));
    }
  }
  if (opts.temp) g.append(el('path', { class: 'wire temp' + (opts.temp.on ? ' on' : ''), d: wirePath(opts.temp.a, opts.temp.b) }));
  for (const c of circ.components) {
    g.append(drawComponent(c, out, src, { interactive: opts.interactive, selected: opts.selected?.kind === 'c' && opts.selected.id === c.id }));
  }
}

// Gate-level circuit -> inverting stages (NOT / NAND2 / NOR2) + terminals.
// Pure data, no DOM, so it can be unit-tested in Node.
import { buildSrc } from './sim.js';

const PRIMARY = { switch: 'SW', button: 'BTN', clock: 'CLK' };

export function buildNetlist(circ) {
  const src = buildSrc(circ);
  const stages = [];
  let tmp = 0;
  const inNet = (c, i) => src.get(`${c.id}:${i}`) ?? '0'; // '0' = tied to ground
  const emit = (kind, ins, out) => {
    const o = out ?? `t${++tmp}`;
    stages.push({ id: stages.length, kind, ins, out: o });
    return o;
  };

  for (const c of circ.components) {
    const key = `${c.id}:0`;
    const a = inNet(c, 0), b = inNet(c, 1);
    switch (c.type) {
      case 'not': emit('not', [a], key); break;
      case 'buf': emit('not', [emit('not', [a])], key); break;
      case 'nand': emit('nand2', [a, b], key); break;
      case 'nor': emit('nor2', [a, b], key); break;
      case 'and': emit('not', [emit('nand2', [a, b])], key); break;
      case 'or': emit('not', [emit('nor2', [a, b])], key); break;
      case 'xor': case 'xnor': {
        const n1 = emit('nand2', [a, b]);
        const x = emit('nand2', [emit('nand2', [a, n1]), emit('nand2', [b, n1])], c.type === 'xor' ? key : undefined);
        if (c.type === 'xnor') emit('not', [x], key);
        break;
      }
      default: break;
    }
  }

  // Outputs (bulbs, display bits) and the primary inputs that feed anything.
  const outputs = [];
  let led = 0, disp = 0;
  for (const c of circ.components) {
    if (c.type === 'bulb') {
      const n = inNet(c, 0);
      led++;
      if (n !== '0') outputs.push({ net: n, label: `LED${led}` });
    } else if (c.type === 'display') {
      disp++;
      for (let i = 0; i < c.state.bits; i++) {
        const n = inNet(c, i);
        if (n !== '0') outputs.push({ net: n, label: `D${disp}[${c.state.bits - 1 - i}]` });
      }
    }
  }
  const used = new Set([...stages.flatMap((s) => s.ins), ...outputs.map((o) => o.net)]);
  const inputs = [];
  const counts = {};
  let pad = 0;
  for (const c of circ.components) {
    const base = PRIMARY[c.type];
    if (base) {
      counts[base] = (counts[base] ?? 0) + 1;
      if (used.has(`${c.id}:0`)) inputs.push({ net: `${c.id}:0`, label: `${base}${counts[base]}` });
    } else if (c.type === 'numpad') {
      const name = String.fromCharCode(65 + pad++);
      for (let p = 0; p < c.state.bits; p++) {
        const k = `${c.id}:${p}`;
        if (used.has(k)) inputs.push({ net: k, label: c.state.bits > 1 ? `${name}[${c.state.bits - 1 - p}]` : name });
      }
    }
  }
  return { stages, inputs, outputs };
}

const FN = { not: (a) => !a[0], nand2: (a) => !(a[0] && a[1]), nor2: (a) => !(a[0] || a[1]) };

// Evaluate the stage netlist (used by tests to prove the expansion is equivalent).
export function evalNetlist(nl, inputValues, prev = {}) {
  const v = { ...prev, ...inputValues, 0: 0 };
  for (let pass = 0; pass < 100; pass++) {
    let changed = false;
    for (const s of nl.stages) {
      const r = FN[s.kind](s.ins.map((n) => !!v[n])) ? 1 : 0;
      if (v[s.out] !== r) { v[s.out] = r; changed = true; }
    }
    if (!changed) break;
  }
  return v;
}

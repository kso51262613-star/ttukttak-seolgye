import { getTemplate } from './templates/index.js';
import { MATERIALS } from './materials.js';

let seq = 0;
export function makeId(prefix = 'd') {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export function defaultParams(t) {
  return Object.fromEntries(t.params.map(p => [p.key, p.default]));
}

export function newDesign(templateId) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`없는 템플릿: ${templateId}`);
  return {
    id: makeId('d'),
    title: t.name,
    templateId,
    params: defaultParams(t),
    materials: {},
    extraParts: [],
    moved: {},
    removed: [],
    checked: {},
    aiSteps: null,
    aiHardware: null,
    laborHours: t.laborHours ?? 4,
    hourlyRate: 15000,
    updatedAt: Date.now()
  };
}

// 템플릿 자재 칸(frame, top...)마다 실제 자재 키
export function resolveMaterials(t, design) {
  const out = {};
  for (const [slot, options] of Object.entries(t.materialOptions || {})) {
    const chosen = design.materials?.[slot];
    out[slot] = options.includes(chosen) ? chosen : options[0];
  }
  return out;
}

export function clampParams(t, params) {
  const out = {};
  const adjusted = [];
  for (const p of t.params) {
    let v = Number(params?.[p.key]);
    if (!Number.isFinite(v)) { v = p.default; adjusted.push(p.key); }
    else if (v < p.min) { v = p.min; adjusted.push(p.key); }
    else if (v > p.max) { v = p.max; adjusted.push(p.key); }
    if (p.step >= 1) v = Math.round(v);
    out[p.key] = v;
  }
  return { params: out, adjusted };
}

export function buildParts(design) {
  const t = getTemplate(design.templateId);
  if (!t) return [];
  const { params } = clampParams(t, design.params);
  const mats = resolveMaterials(t, design);
  const removed = new Set(design.removed || []);
  const moved = design.moved || {};
  const base = t.build(params, mats)
    .filter(p => !removed.has(p.id))
    .map(p => {
      const d = moved[p.id];
      return d ? { ...p, pos: p.pos.map((v, i) => v + (d[i] || 0)) } : p;
    });
  const extra = (design.extraParts || [])
    .filter(p => MATERIALS[p.material])
    .map(p => ({ shape: 'box', note: '', ...p, extra: true }));
  return [...base, ...extra];
}

export function bounds(parts) {
  if (!parts.length) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.pos[i] - p.size[i] / 2);
      max[i] = Math.max(max[i], p.pos[i] + p.size[i] / 2);
    }
  }
  const size = max.map((v, i) => Math.round(v - min[i]));
  return { min, max, size };
}

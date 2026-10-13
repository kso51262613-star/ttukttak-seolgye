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

// 만들지 않는 참고용 부품 (자재 kind 'ref'). 화면에는 흐리게 나오고 계산에는 안 들어간다
export const isRef = p => MATERIALS[p?.material]?.kind === 'ref';

// ---------- 부품 기울이기 ----------
// 부품의 rot = [x, y, z] (도). size 는 기울기 전 상자 크기 그대로라 재단표·무게는 바뀌지 않는다
const DEG = Math.PI / 180;
// 기울기 세 값을 숫자로 (백업 파일에 이상한 값이 있어도 0 으로 본다)
export const rotOf = p => [0, 1, 2].map(i => Number(p?.rot?.[i]) || 0);
export const hasRot = p => Array.isArray(p?.rot) && rotOf(p).some(Boolean);

// three.js 의 Euler 'XYZ' (행렬 Rx·Ry·Rz) 와 같은 회전 행렬
function rotMatrix([x = 0, y = 0, z = 0]) {
  const a = Math.cos(x * DEG), b = Math.sin(x * DEG);
  const c = Math.cos(y * DEG), d = Math.sin(y * DEG);
  const e = Math.cos(z * DEG), f = Math.sin(z * DEG);
  return [
    [c * e, -c * f, d],
    [a * f + b * e * d, a * e - b * f * d, -b * c],
    [b * f - a * e * d, b * e + a * f * d, a * c]
  ];
}

// 상자 꼭짓점 8개 (기울기 반영)
export function partCorners(p) {
  const half = p.size.map(v => v / 2);
  const m = hasRot(p) ? rotMatrix(rotOf(p)) : null;
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = [sx * half[0], sy * half[1], sz * half[2]];
    const r = m ? m.map(row => row[0] * c[0] + row[1] * c[1] + row[2] * c[2]) : c;
    out.push(r.map((v, i) => v + p.pos[i]));
  }
  return out;
}

// 기울기까지 넣은 부품의 범위
export function partBox(p) {
  if (!hasRot(p)) return { min: p.pos.map((v, i) => v - p.size[i] / 2), max: p.pos.map((v, i) => v + p.size[i] / 2) };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const c of partCorners(p)) {
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], c[i]); max[i] = Math.max(max[i], c[i]); }
  }
  return { min, max };
}

// 가장 낮은 곳이 바닥 아래면 바닥까지 올린다 (같은 부품을 고쳐서 돌려준다)
export function liftToFloor(p) {
  const low = partBox(p).min[1];
  if (low < 0) p.pos[1] -= low;
  return p;
}

// 크기나 기울기를 바꾼 뒤에도 가장 낮은 곳을 그대로 둔다 (바닥에 놓인 부품이 뜨지 않게).
// before = 바꾸기 전 { size, rot }. rot 이 없으면 기울지 않았던 것으로 본다.
// 기울지 않은 부품은 아랫면을 유지하는 것과 같다
export function keepLowest(p, before = {}) {
  const low = partBox({ ...p, size: before.size || p.size, rot: before.rot }).min[1];
  p.pos[1] += low - partBox(p).min[1];
  return liftToFloor(p);
}

// 참고용 부품은 기본으로 뺀다 (전부 참고용이면 그대로). includeRef 는 도면 배치처럼 다 넣을 때
export function bounds(all, { includeRef = false } = {}) {
  const real = includeRef ? all : all.filter(p => !isRef(p));
  const parts = real.length ? real : all;
  if (!parts.length) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const box = partBox(p);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], box.min[i]);
      max[i] = Math.max(max[i], box.max[i]);
    }
  }
  const size = max.map((v, i) => Math.round(v - min[i]));
  return { min, max, size };
}

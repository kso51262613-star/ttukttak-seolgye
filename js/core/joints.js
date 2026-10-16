// js/core/joints.js
// 연결부: 어디를 무엇으로 붙이나. 맞닿은 부품을 찾아 자재 조합 규칙으로 방법·부속·구멍을 정한다.
// 우선순위: 사용자 수정(design.jointEdits) > 템플릿 지정(t.joints) > 템플릿 규칙(t.jointRules) > 자동 판정.
import { MATERIALS } from './materials.js';
import { partBox, isRef, hasRot, clampParams, resolveMaterials } from './model.js';
import { getTemplate } from './templates/index.js';

// 부속표 (단가는 2026-10 온라인 판매가 추정). dia = 구멍 지름, len = 길이
export const FASTENERS = {
  screw_38: { name: '목공 피스 38mm', unit: '개', price: 12, dia: 3, len: 38 },
  screw_50: { name: '목공 피스 50mm', unit: '개', price: 13, dia: 3, len: 50 },
  screw_65: { name: '목공 피스 65mm', unit: '개', price: 15, dia: 3, len: 65 },
  screw_75: { name: '목공 피스 75mm', unit: '개', price: 18, dia: 3, len: 75 },
  screw_90: { name: '목공 피스 90mm', unit: '개', price: 22, dia: 3, len: 90 },
  truss_25: { name: '철재용 트러스 피스 4.2x25', unit: '개', price: 30, dia: 4, len: 25 },
  truss_32: { name: '철재용 트러스 피스 4.2x32', unit: '개', price: 32, dia: 4, len: 32 },
  truss_38: { name: '철재용 트러스 피스 4.2x38', unit: '개', price: 35, dia: 4, len: 38 },
  truss_50: { name: '철재용 트러스 피스 4.2x50', unit: '개', price: 40, dia: 4, len: 50 },
  truss_65: { name: '철재용 트러스 피스 4.2x65', unit: '개', price: 50, dia: 4, len: 65 },
  bolt_m6:  { name: 'M6 볼트·너트·와셔 세트', unit: '세트', price: 200, dia: 7, len: 40 },
  bolt_m8:  { name: 'M8 볼트·너트·와셔 세트', unit: '세트', price: 600, dia: 9, len: 60 },
  bolt_m10: { name: 'M10 볼트·너트·와셔 세트', unit: '세트', price: 1000, dia: 11, len: 100 },
  pin_8:    { name: '스프링 락핀 8mm', unit: '개', price: 3000, dia: 9, len: 60 },
  jclamp:   { name: 'J클램프 (철 턱 무는 것)', unit: '개', price: 8000, dia: 0, len: 0 },
  hinge_75: { name: '경첩 75mm', unit: '개', price: 1500, dia: 4, len: 25 },
  glue:     { name: '목공 본드', unit: '통', price: 5000, dia: 0, len: 0 },
  rod:      { name: '용접봉 2.6mm', unit: '봉지(1kg)', price: 8000, dia: 0, len: 0 }
};
export const TYPE_NAMES = { screw: '피스', bolt: '볼트', weld: '용접', pin: '핀', clamp: '클램프', hinge: '경첩', glue: '본드', none: '없음' };

const TOL = 0.6;         // 맞닿음 판정 여유 (mm)
const MIN_FACE = 8;      // 이보다 좁으면 모서리·점 접촉으로 보고 무시 (얇은 부품은 그 두께까지)
const OVERLAP_OK = 3;    // 이만큼 파고든 것은 모델링 오차로 보고 맞닿음으로 친다
const SLEEVE_MIN = 30;   // 끼움으로 보는 최소 겹침
const SCREW_LENS = [38, 50, 65, 75, 90];
const SKIP_KINDS = new Set(['masonry', 'cast', 'wrap', 'ref']);
const AXIS = 'xyz';

const r1 = v => Math.round(v * 10) / 10;
const others = k => [(k + 1) % 3, (k + 2) % 3];
const groupOf = p => MATERIALS[p.material]?.group;
const kindOf = p => MATERIALS[p.material]?.kind;
const pairKey = (a, b) => [a, b].sort().join('|');

// 자동 판정 대상: 참고용·벽돌류·기울인 부품은 뺀다
export function joinable(p) {
  return !!p && !isRef(p) && !hasRot(p) && !SKIP_KINDS.has(kindOf(p));
}

export function fastenerOf(key, qty = 1) {
  const f = typeof key === 'string' ? FASTENERS[key] : key;
  if (!f) return null;
  return { key: typeof key === 'string' ? key : (f.key || ''), name: f.name, qty, unit: f.unit || '개', price: f.price || 0, dia: f.dia || 0, len: f.len || 0 };
}

// 면 맞닿음: 어떤 축에서 한쪽 끝면과 다른 쪽 끝면이 붙어 있고, 나머지 두 축의 겹침이 8mm 이상
export function faceContact(A, B) {
  // 좁은 접촉 기준: 8mm, 단 두 부품 중 가장 얇은 치수가 그보다 얇으면 그 두께까지 (평철·철판 모서리 접촉)
  const thin = Math.min(...[0, 1, 2].map(k => A.max[k] - A.min[k]), ...[0, 1, 2].map(k => B.max[k] - B.min[k]));
  const minFace = Math.max(1, Math.min(MIN_FACE, thin));
  for (let k = 0; k < 3; k++) {
    for (const [lo, hi, sign] of [[A, B, 1], [B, A, -1]]) {
      const gap = hi.min[k] - lo.max[k];
      if (gap > TOL || gap < -OVERLAP_OK) continue;
      const [i, j] = others(k);
      const min = [0, 0, 0];
      const max = [0, 0, 0];
      min[i] = Math.max(A.min[i], B.min[i]); max[i] = Math.min(A.max[i], B.max[i]);
      min[j] = Math.max(A.min[j], B.min[j]); max[j] = Math.min(A.max[j], B.max[j]);
      if (max[i] - min[i] < minFace || max[j] - min[j] < minFace) continue;
      min[k] = max[k] = r1((lo.max[k] + hi.min[k]) / 2);
      return { kind: 'face', axis: k, sign, min: min.map(r1), max: max.map(r1), center: min.map((v, n) => r1((v + max[n]) / 2)) };
    }
  }
  return null;
}

// 끼움: 한 상자가 다른 상자 속에 들어가(단면 전체가 겹치고) 긴 축으로 30mm 이상 겹침.
// 속에 든 쪽은 부피가 작은 쪽부터 본다. 짧은 소켓 속을 긴 각재가 지나가면(해먹 거치대 연결쇠) 부피가 큰 쪽이 속이라 둘 다 본다
export function sleeveContact(A, B) {
  const ov = [0, 1, 2].map(k => Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k]));
  if (ov.some(v => v <= TOL)) return null;
  const sizeA = [0, 1, 2].map(k => A.max[k] - A.min[k]);
  const sizeB = [0, 1, 2].map(k => B.max[k] - B.min[k]);
  const volA = sizeA[0] * sizeA[1] * sizeA[2];
  const volB = sizeB[0] * sizeB[1] * sizeB[2];
  const order = volA <= volB ? [['A', sizeA], ['B', sizeB]] : [['B', sizeB], ['A', sizeA]];
  for (const [name, inner] of order) {
    const axis = inner.indexOf(Math.max(...inner));
    if (ov[axis] < SLEEVE_MIN) continue;
    const [i, j] = others(axis);
    if (ov[i] < inner[i] - TOL || ov[j] < inner[j] - TOL) continue;
    const min = [0, 1, 2].map(k => r1(Math.max(A.min[k], B.min[k])));
    const max = [0, 1, 2].map(k => r1(Math.min(A.max[k], B.max[k])));
    return { kind: 'sleeve', axis, sign: 0, min, max, center: min.map((v, n) => r1((v + max[n]) / 2)), inner: name };
  }
  return null;
}

function contactOf(pa, pb) {
  const A = partBox(pa);
  const B = partBox(pb);
  return faceContact(A, B) || sleeveContact(A, B);
}

// id: 두 부품 id(글자순) + 맞닿은 축 + 방향. 같은 쌍·같은 면이면 슬라이더를 바꿔도 같은 id
function jointId(ida, idb, c) {
  const sorted = ida <= idb;
  const sign = c.kind === 'sleeve' ? 's' : c.kind === 'declared' ? 'd' : ((sorted ? c.sign : -c.sign) > 0 ? '+' : '-');
  return `${pairKey(ida, idb)}|${AXIS[c.axis]}${sign}`;
}

const perimeter = c => { const [i, j] = others(c.axis); return r1(2 * ((c.max[i] - c.min[i]) + (c.max[j] - c.min[j]))); };
const longSide = c => Math.max(...others(c.axis).map(k => c.max[k] - c.min[k]));

const TRUSS_LENS = [25, 32, 38, 50, 65];
function pickTruss(need) {
  const len = TRUSS_LENS.find(l => l >= need) ?? 65;
  return `truss_${len}`;
}

function pickScrew(need) {
  const len = SCREW_LENS.find(l => l >= need) ?? 90;
  return `screw_${len}`;
}

// 면 맞닿음의 구멍 자리: 짧은 변 가운데 선 위에, 긴 변을 따라 고르게. 끝 여유 = min(20, 긴 변/4)
function spreadHoles(c, n, dia, parts, depth = 'through') {
  const [i, j] = others(c.axis);
  const along = (c.max[i] - c.min[i]) >= (c.max[j] - c.min[j]) ? i : j;
  const L = c.max[along] - c.min[along];
  const inset = Math.min(20, L / 4);
  const holes = [];
  for (let t = 0; t < n; t++) {
    const at = [...c.center];
    at[along] = n === 1 ? c.center[along] : r1(c.min[along] + inset + t * (L - 2 * inset) / (n - 1));
    holes.push({ at, axis: c.axis, dia, depth, parts: [...parts] });
  }
  return holes;
}

// 완제품(캐스터) 받침: 상대 부품 면의 네 모서리 안쪽 15mm (작으면 가운데 쪽으로)
function cornerHoles(c, other, dia, parts) {
  const [i, j] = others(c.axis);
  const B = partBox(other);
  const ci = Math.max(5, Math.min(35, (B.max[i] - B.min[i]) / 2 - 15));
  const cj = Math.max(5, Math.min(35, (B.max[j] - B.min[j]) / 2 - 15));
  const holes = [];
  for (const si of [-1, 1]) for (const sj of [-1, 1]) {
    const at = [...c.center];
    at[i] = r1(c.center[i] + si * ci);
    at[j] = r1(c.center[j] + sj * cj);
    holes.push({ at, axis: c.axis, dia, depth: 'through', parts: [...parts] });
  }
  return holes;
}

// 끼움의 핀 구멍: 긴 축과 수직(가로 방향 우선), 겹친 구간 가운데(150 이상이면 양 끝 30 안쪽 2개)
function sleeveHoles(c, n, dia, parts) {
  const holeAxis = others(c.axis).find(k => k !== 1) ?? others(c.axis)[0];
  const len = c.max[c.axis] - c.min[c.axis];
  const holes = [];
  for (let t = 0; t < n; t++) {
    const at = [...c.center];
    at[c.axis] = n === 1 ? c.center[c.axis] : r1(c.min[c.axis] + 30 + t * (len - 60) / (n - 1));
    holes.push({ at, axis: holeAxis, dia, depth: 'through', parts: [...parts] });
  }
  return holes;
}

// 피스를 받는 쪽(b)에 들어가는 방향 검사: 판재는 두께 방향(넓은 면)으로 받는 게 기본.
// 단, 나무 판(a)이 자기 두께 방향으로 다른 판(b)의 가장자리(15mm 이상)에 박는 상자 짜임은 허용 (옆판을 바닥판 가장자리에).
// 철이나 기둥 옆에 판 가장자리만 닿은 것은 피스를 만들지 않는다. 각재는 어느 면이든 가능 (2x4 옆 모서리 피스는 흔한 방법).
// 겹쳐 쌓은 넓은 판끼리는 MAX_THROUGH 로 걸러진다
const MAX_THROUGH = 90;  // 피스가 지나가는 쪽(a) 두께 상한
function screwable(b, k, a, c) {
  if (kindOf(b) !== 'sheet') return true;
  if (b.size[k] === Math.min(...b.size)) return true;
  const shortSide = Math.min(...others(k).map(i => c.max[i] - c.min[i]));
  return kindOf(a) === 'sheet' && a.size[k] === Math.min(...a.size) && shortSide >= 15;
}

// 자재 조합별 기본 연결법 (스펙 4.3)
function autoJoint(pa, pb, c) {
  const ga = groupOf(pa);
  const gb = groupOf(pb);
  const ka = kindOf(pa);
  const kb = kindOf(pb);
  if (c.kind === 'sleeve') {
    const n = (c.max[c.axis] - c.min[c.axis]) >= 150 ? 2 : 1;
    return { a: pa.id, b: pb.id, type: 'pin', fastener: fastenerOf('bolt_m8', n), holes: sleeveHoles(c, n, 9, [pa.id, pb.id]), weldLen: null };
  }
  const mountable = p => kindOf(p) === 'item' && (p.shape === 'caster' || p.shape === 'wheel');
  if (mountable(pa) || mountable(pb)) {
    const [item, other] = mountable(pa) ? [pa, pb] : [pb, pa];
    return { a: item.id, b: other.id, type: 'bolt', fastener: fastenerOf('bolt_m8', 4), holes: cornerHoles(c, other, 9, [other.id]), weldLen: null };
  }
  const long = longSide(c);
  if (ga === 'wood' && gb === 'wood') {
    const [a, b] = pa.size[c.axis] <= pb.size[c.axis] ? [pa, pb] : [pb, pa];
    if (a.size[c.axis] > MAX_THROUGH || !screwable(b, c.axis, a, c)) return null;
    const need = a.size[c.axis] + Math.min(b.size[c.axis] * 0.7, 60);
    const n = long < 50 ? 1 : Math.max(2, Math.ceil(long / 150));
    // 피스가 지나가는 쪽이 굵으면(65 초과: 90 각재, 눕힌 2x4) 90mm 피스도 모자라 M10 관통 볼트로
    if (a.size[c.axis] > 65) return { a: a.id, b: b.id, type: 'bolt', fastener: fastenerOf('bolt_m10', Math.max(1, Math.min(n, 2))), holes: spreadHoles(c, Math.max(1, Math.min(n, 2)), 11, [a.id, b.id]), weldLen: null };
    return { a: a.id, b: b.id, type: 'screw', fastener: fastenerOf(pickScrew(need), n), holes: spreadHoles(c, n, 3, [a.id]), weldLen: null };
  }
  if (ga === 'metal' && gb === 'metal') {
    return { a: pa.id, b: pb.id, type: 'weld', fastener: null, holes: [], weldLen: perimeter(c) };
  }
  if ((ga === 'wood' && gb === 'metal') || (ga === 'metal' && gb === 'wood')) {
    const [a, b] = ga === 'metal' ? [pa, pb] : [pb, pa];
    if (a.size[c.axis] > MAX_THROUGH || !screwable(b, c.axis, a, c)) return null;
    const n = Math.max(2, Math.ceil(long / 400));
    const key = pickTruss(a.size[c.axis] + Math.min(b.size[c.axis] * 0.7, 25));
    return { a: a.id, b: b.id, type: 'screw', fastener: fastenerOf(key, n), holes: spreadHoles(c, n, 4, [a.id]), weldLen: null };
  }
  return null;
}

// 방법을 바꿀 때(사용자 수정·규칙) 부속과 구멍을 다시 정한다
function retype(j, type, byId) {
  const c = j.face;
  const pa = byId.get(j.a);
  const pb = byId.get(j.b);
  const n = j.fastener?.qty || (j.holes.length || 2);
  const face = c.kind === 'face';
  switch (type) {
    case 'none': return null;
    case 'weld': return { ...j, type, fastener: null, holes: [], weldLen: face ? perimeter(c) : null };
    case 'glue': return { ...j, type, fastener: fastenerOf('glue', 1), holes: [], weldLen: null };
    case 'clamp': return { ...j, type, fastener: fastenerOf('jclamp', Math.max(1, Math.min(n, 4))), holes: [], weldLen: null };
    case 'bolt': return { ...j, type, fastener: fastenerOf('bolt_m8', n), holes: face ? spreadHoles(c, n, 9, [j.a, j.b]) : c.kind === 'sleeve' ? sleeveHoles(c, n, 9, [j.a, j.b]) : j.holes.map(h => ({ ...h, dia: 9 })), weldLen: null };
    case 'pin': return { ...j, type, fastener: fastenerOf('pin_8', n), holes: face ? spreadHoles(c, n, 9, [j.a, j.b]) : c.kind === 'sleeve' ? sleeveHoles(c, n, 9, [j.a, j.b]) : j.holes.map(h => ({ ...h, dia: 9 })), weldLen: null };
    case 'hinge': return { ...j, type, fastener: fastenerOf('hinge_75', Math.max(1, Math.min(n, 2))), holes: [], weldLen: null };
    case 'screw': {
      if (!pa || !pb) return { ...j, type };
      const metal = groupOf(pa) === 'metal' || groupOf(pb) === 'metal';
      const key = metal ? 'truss_25' : pickScrew(pa.size[c.axis] + Math.min(pb.size[c.axis] * 0.7, 60));
      return { ...j, type, fastener: fastenerOf(key, n), holes: face ? spreadHoles(c, n, metal ? 4 : 3, [j.a]) : j.holes.map(h => ({ ...h, dia: metal ? 4 : 3 })), weldLen: null };
    }
    default: return { ...j, type };
  }
}

function applyOverride(j, o, byId) {
  if (!o) return j;
  let out = j;
  if (o.type && o.type !== j.type) {
    out = retype(out, o.type, byId);
    if (!out) return null;
  }
  if (Number.isFinite(o.qty) && o.qty > 0 && out.fastener) {
    const qty = Math.max(1, Math.min(50, Math.round(o.qty)));
    out = { ...out, fastener: { ...out.fastener, qty } };
    if (out.face.kind === 'face' && out.holes.length) out.holes = spreadHoles(out.face, qty, out.holes[0].dia, out.holes[0].parts);
    else if (out.face.kind === 'sleeve' && out.holes.length) out.holes = sleeveHoles(out.face, qty, out.holes[0].dia, out.holes[0].parts);
  }
  if (typeof o.note === 'string') out = { ...out, note: o.note };
  if (o.step !== undefined) out = { ...out, step: o.step };
  return out;
}

// 템플릿 지정 → 연결부. 맞닿음이 없어도(참고용·기울인 부품) 두 부품 가운데를 자리로 삼는다
function fromDeclared(d, byId) {
  const pa = byId.get(d.a);
  const pb = byId.get(d.b);
  if (!pa || !pb) return null;
  if (d.type === 'none') return { suppress: true };
  const c = (joinable(pa) && joinable(pb)) ? contactOf(pa, pb) : null;
  let face = c;
  if (!face) {
    const mid = d.at ? d.at.map(r1) : pa.pos.map((v, k) => r1((v + pb.pos[k]) / 2));
    face = { kind: 'declared', axis: d.axis ?? 2, sign: 1, min: mid, max: mid, center: mid };
  }
  const qty = d.qty ?? (Array.isArray(d.holes) && d.holes.length ? d.holes.length : 1);
  const fastener = d.fastener ? fastenerOf(d.fastener, qty) : null;
  let holes = (d.holes || []).map(h => ({ at: h.at.map(r1), axis: h.axis ?? face.axis, dia: h.dia ?? fastener?.dia ?? 0, depth: h.depth ?? 'through', parts: h.parts || [d.a, d.b] }));
  const drilled = fastener && fastener.dia > 0 && !['weld', 'clamp', 'glue', 'hinge'].includes(d.type);
  if (!holes.length && drilled && c?.kind === 'face') holes = spreadHoles(c, qty, fastener.dia, [d.a, d.b]);
  if (!holes.length && drilled && c?.kind === 'sleeve') holes = sleeveHoles(c, qty, fastener.dia, [d.a, d.b]);
  return {
    id: jointId(d.a, d.b, face), a: d.a, b: d.b, kind: c ? c.kind : 'declared', type: d.type, auto: false, face, holes, fastener,
    weldLen: d.type === 'weld' && c?.kind === 'face' ? perimeter(c) : null, note: d.note || '', step: d.step ?? null
  };
}

// 같은 종류 묶기: 이름 쌍 + 방법 + 면 축 + 맞닿은 크기(5mm 단위) + 구멍 개수·지름
function groupKey(j, byId) {
  const [i, k] = others(j.face.axis);
  const ext = [j.face.max[i] - j.face.min[i], j.face.max[k] - j.face.min[k]].map(v => Math.round(v / 5) * 5).sort((p, q) => q - p);
  return [byId.get(j.a)?.name, byId.get(j.b)?.name, j.type, j.face.kind, j.face.axis, ext.join('x'), j.holes.length, j.holes[0]?.dia || 0].join('|');
}

export function groupLetter(n) {
  let s = '';
  let v = n + 1;
  while (v > 0) {
    const r = (v - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

export function findJoints(parts, { declared = [], rules = null, edits = {} } = {}) {
  const byId = new Map(parts.map(p => [p.id, p]));
  const out = [];
  const taken = new Set();
  for (const d of declared || []) {
    if (!d || !d.a || !d.b) continue;
    const r = fromDeclared(d, byId);
    if (!r) continue;
    taken.add(pairKey(d.a, d.b));
    if (!r.suppress && !out.some(x => x.id === r.id)) out.push(r);
  }
  const list = parts.filter(joinable);
  for (let x = 0; x < list.length; x++) {
    for (let y = x + 1; y < list.length; y++) {
      const pa = list[x];
      const pb = list[y];
      if (taken.has(pairKey(pa.id, pb.id))) continue;
      const c = contactOf(pa, pb);
      if (!c) continue;
      const auto = autoJoint(pa, pb, c);
      if (!auto) continue;
      let j = { id: jointId(pa.id, pb.id, c), kind: c.kind, auto: true, face: c, note: '', step: null, ...auto };
      if (rules) {
        const r = rules(byId.get(j.a), byId.get(j.b), j);
        if (r === false) continue;
        if (r && typeof r === 'object') { j = applyOverride(j, r, byId); if (!j) continue; j = { ...j, auto: false }; }
      }
      out.push(j);
    }
  }
  const edited = [];
  for (const j of out) {
    const e = edits?.[j.id];
    if (!e) { edited.push(j); continue; }
    if (e.hidden) continue;
    const o = applyOverride(j, e, byId);
    if (o) edited.push({ ...o, auto: false });
  }
  edited.sort((p, q) => p.id.localeCompare(q.id, 'ko'));
  const keys = new Map();
  for (const j of edited) {
    const k = groupKey(j, byId);
    if (!keys.has(k)) keys.set(k, groupLetter(keys.size));
    j.group = keys.get(k);
  }
  return edited;
}

// 설계(템플릿 지정·규칙·사용자 수정)를 모아 연결부를 만든다
export function designJoints(design, parts) {
  const t = getTemplate(design?.templateId);
  let declared = [];
  if (t && typeof t.joints === 'function') {
    const { params } = clampParams(t, design.params || {});
    declared = t.joints(parts, params, resolveMaterials(t, design)) || [];
  }
  // 템플릿 규칙은 원래 이름으로 판단한다 (부품 이름을 바꿔도 "들리는 상판은 틀에 붙이지 않음" 같은 규칙이 그대로 먹게)
  const orig = p => (p && p.origName && p.origName !== p.name ? { ...p, name: p.origName } : p);
  const rules = typeof t?.jointRules === 'function' ? (a, b, j) => t.jointRules(orig(a), orig(b), j) : null;
  return findJoints(parts, { declared, rules, edits: design?.jointEdits || {} });
}

export const jointsOfPart = (joints, id) => joints.filter(j => j.a === id || j.b === id);
export const hasType = (joints, type) => joints.some(j => j.type === type);

// 부속 합계 (이름별). 본드·용접봉은 연결부마다 한 통이 아니라 설계에 한 통
const CONSUMABLES = new Set([FASTENERS.glue.name, FASTENERS.rod.name]);
export function fastenerTotals(joints) {
  const map = new Map();
  for (const j of joints || []) {
    const f = j.fastener;
    if (!f || !(f.qty > 0)) continue;
    const prev = map.get(f.name);
    const once = CONSUMABLES.has(f.name);
    if (prev) prev.qty = once ? Math.max(prev.qty, f.qty) : prev.qty + f.qty;
    else map.set(f.name, { name: f.name, qty: f.qty, unit: f.unit || '개', price: f.price || 0 });
  }
  return [...map.values()];
}

// 지정 연결부의 순서 번호(1부터)에 "(연결부 A, B)" 를 붙인다
export function annotateSteps(steps, joints) {
  return (steps || []).map((s, i) => {
    const letters = [...new Set((joints || []).filter(j => j.step === i + 1 && j.group).map(j => j.group))];
    return letters.length ? `${s} (연결부 ${letters.join(', ')})` : s;
  });
}

// 표·카드용 글: 방법·부속
export function describeMethod(j) {
  const f = j.fastener;
  const each = f ? ` · ${f.name} ${f.qty}${f.unit || '개'}씩` : '';
  if (j.type === 'weld') return `용접${j.weldLen ? ` (약 ${Math.round(j.weldLen)}mm)` : ''}`;
  if (j.type === 'glue') return '본드';
  return `${TYPE_NAMES[j.type] || j.type}${each}`;
}

// 표·카드용 글: 구멍
export function describeHoles(j, byId) {
  if (!j.holes?.length) return '없음';
  const groups = new Map();
  for (const h of j.holes) {
    const k = `${h.dia}|${h.depth}|${(h.parts || []).join(',')}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  return [...groups.entries()].map(([k, n]) => {
    const [dia, depth, ids] = k.split('|');
    const names = ids.split(',').filter(Boolean).map(id => byId?.get?.(id)?.name || id).join('·');
    const allMetal = ids.split(',').filter(Boolean).every(id => MATERIALS[byId?.get?.(id)?.material]?.group === 'metal');
    const kindWord = j.type === 'screw' && !allMetal ? '선구멍' : '관통';
    return `⌀${dia} ${depth === 'through' ? kindWord : `${depth}mm 깊이`} ${n}개${names ? ` (${names}에)` : ''}`;
  }).join(', ');
}

// 무료 모드 "말로 설계": 문장에서 종류·치수·자재를 찾아 템플릿에 적용한다.
import { TEMPLATES, getTemplate } from './templates/index.js';
import { MATERIALS } from './materials.js';
import { clampParams, defaultParams } from './model.js';

const WOOD_WORDS = ['원목', '나무', '구조목', '집성목', '합판', '목재', '우드', '방부목'];
const METAL_WORDS = ['철제', '철', '스틸', '각파이프', '파이프', '아이언', '금속', '용접', '각관'];

// 문장 속 단어 → 자재 키
const MATERIAL_WORDS = [
  ['20각', 'sq_tube_20'], ['20x20', 'sq_tube_20'],
  ['25각', 'sq_tube_25'], ['25x25', 'sq_tube_25'],
  ['30각', 'sq_tube_30'], ['30x30', 'sq_tube_30'],
  ['40각', 'sq_tube_40'], ['40x40', 'sq_tube_40'],
  ['3.2t', 'steel_plate_32'], ['1.6t', 'steel_plate_16'],
  ['24t', 'pine_board_24'], ['18t', 'pine_board_18'],
  ['자작합판', 'birch_ply_18'], ['자작', 'birch_ply_18'], ['합판', 'birch_ply_18'],
  ['집성목', 'pine_board_18'],
  ['방부목', 'treated_2x4'], ['방부목', 'treated_2x6'],
  ['2x6', 'treated_2x6'], ['2x4', 'spf_2x4'], ['2x2', 'spf_2x2'], ['1x4', 'spf_1x4']
];

const LABELS = [
  // "수납칸 깊이" 를 먼저 읽어야 아래 "깊이" 가 작품 깊이로 잘못 읽지 않는다
  ['boxDepth', '(?:수납칸\\s*깊이|수납\\s*깊이|수납칸)'],
  ['width', '(?:폭|가로|너비|길이|width)'],
  ['depth', '(?:깊이|세로|depth)'],
  ['height', '(?:높이|키|height)'],
  ['hole', '(?:구멍|hole)']
];
const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '\\s*(mm|cm|m|미리|밀리|센티)?';

export function toMM(value, unit = '') {
  const v = Number(value);
  const u = (unit || '').toLowerCase();
  if (u === 'mm' || u === '미리' || u === '밀리') return Math.round(v);
  if (u === 'cm' || u === '센티') return Math.round(v * 10);
  if (u === 'm') return Math.round(v * 1000);
  if (v <= 5) return Math.round(v * 1000);
  if (v < 300) return Math.round(v * 10);
  return Math.round(v);
}

function templateGroup(t) {
  const first = Object.values(t.materialOptions || {}).map(o => MATERIALS[o[0]]?.group);
  return first.includes('metal') ? 'metal' : 'wood';
}

function scoreTemplates(compact) {
  const hasWood = WOOD_WORDS.some(w => compact.includes(w));
  const hasMetal = METAL_WORDS.some(w => compact.includes(w));
  const list = TEMPLATES.filter(t => t.id !== 'custom');
  const matched = list.map(t => t.keywords.map(k => k.toLowerCase()).filter(k => compact.includes(k)));
  return list.map((t, order) => {
    // 다른 템플릿이 더 긴 단어로 같은 부분을 맞혔으면 짧은 단어는 세지 않는다 (예: 테이블 < 커피테이블)
    const others = matched.filter((_, j) => j !== order).flat();
    const hits = matched[order].filter(k => !others.some(o => o !== k && o.includes(k))).length;
    let score = hits * 10;
    if (hits > 0) {
      const g = templateGroup(t);
      if ((g === 'metal' && hasMetal) || (g === 'wood' && hasWood && !hasMetal)) score += 5;
      if (t.trend) score += 1;
    }
    return { t, score, order };
  }).sort((a, b) => b.score - a.score || a.order - b.order);
}

// 찾은 부분은 공백으로 지워서 남은 숫자를 "모르는 숫자"로 알려준다
function consume(state, re, fn) {
  state.text = state.text.replace(re, (...m) => {
    fn(m);
    return ' '.repeat(m[0].length);
  });
}

// 단위 없는 숫자: 작품 치수 범위에 맞는 쪽(cm 먼저, 그다음 mm, m)을 고른다
export function resolveLength(h, param) {
  if (h.unit) return toMM(h.v, h.unit);
  const v = Number(h.v);
  if (v >= 300 || !param) return toMM(v, '');
  const fits = x => x >= param.min && x <= param.max;
  if (v <= 5 && fits(Math.round(v * 1000))) return Math.round(v * 1000);
  if (fits(Math.round(v * 10))) return Math.round(v * 10);
  if (fits(Math.round(v))) return Math.round(v);
  return toMM(v, '');
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "40x40" 같은 자재 단어는 "40x40x60" 처럼 치수 줄의 일부일 때는 자재로 보지 않는다
function materialRe(word) {
  const w = escRe(word);
  return /\d/.test(word)
    ? new RegExp(`(?<![\\d.x×*])${w}(?![\\d.]|\\s*[x×*]\\s*\\d)`, 'g')
    : new RegExp(w, 'g');
}

export function parseText(input) {
  // 1,800 처럼 천 단위 쉼표는 없앤다
  const raw = String(input || '').toLowerCase().replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const compact = raw.replace(/\s+/g, '');
  const ranked = scoreTemplates(compact);
  const best = ranked[0]?.score > 0 ? ranked[0].t : null;
  const understood = [];
  const unknown = [];
  const state = { text: raw };

  // 1) 자재 단어
  const foundMats = [];
  for (const [word, key] of MATERIAL_WORDS) {
    if (materialRe(word).test(state.text)) foundMats.push(key);
  }
  for (const [word] of MATERIAL_WORDS) state.text = state.text.replace(materialRe(word), m => ' '.repeat(m.length));

  // 2) 숫자들 (길이는 {v, unit} 로 모아 두고 작품을 정한 뒤 mm 로 바꾼다)
  const hints = {};
  const put = (key, v, unit) => { hints[key] ??= { v: Number(v), unit: unit || '' }; };
  consume(state, new RegExp(`${NUM}${UNIT}\\s*[x×*]\\s*${NUM}${UNIT}\\s*[x×*]\\s*${NUM}${UNIT}`, 'gi'), m => {
    const unit = m[6] || m[4] || m[2] || '';
    put('width', m[1], m[2] || unit);
    put('depth', m[3], m[4] || unit);
    put('height', m[5], m[6] || unit);
  });
  let tiers;
  consume(state, /(\d+)\s*(?:단|층|칸)/g, m => { tiers ??= Number(m[1]); });
  for (const [key, label] of LABELS) {
    consume(state, new RegExp(`${label}\\s*[:=]?\\s*(?:은|는|이|가)?\\s*${NUM}${UNIT}`, 'gi'), m => put(key, m[1], m[2]));
  }
  consume(state, new RegExp(`${NUM}${UNIT}\\s*[x×*]\\s*${NUM}${UNIT}`, 'gi'), m => {
    const unit = m[4] || m[2] || '';
    put('width', m[1], m[2] || unit);
    put('depth', m[3], m[4] || unit);
  });
  for (const m of state.text.matchAll(/\d+(?:\.\d+)?/g)) unknown.push(`'${m[0]}'은(는) 어디에 쓰는 숫자인지 몰라서 뺐어요`);

  if (!best) {
    return {
      templateId: null, params: {}, materials: {}, understood, unknown,
      candidates: ranked.filter(r => r.t.trend).slice(0, 3).map(r => r.t.id)
    };
  }

  understood.push(`종류: ${best.name}`);
  const params = defaultParams(best);
  const byKey = Object.fromEntries(best.params.map(p => [p.key, p]));
  const lengths = Object.fromEntries(Object.entries(hints).map(([k, h]) => [k, resolveLength(h, byKey[k])]));
  if (tiers !== undefined) lengths.tiers = tiers;
  const keys = new Set(best.params.map(p => p.key));
  const mapped = best.fromHints ? best.fromHints(lengths) : {};
  for (const [k, v] of Object.entries(lengths)) {
    if (keys.has(k) && !(k in mapped)) params[k] = v;
  }
  Object.assign(params, mapped);
  // fromHints 는 높이 값을 다른 칸(통 높이, 판 단 수)으로 바꿔 쓴다
  const heightMapped = Object.keys(mapped).length > 0;
  for (const k of Object.keys(lengths)) {
    if (!keys.has(k) && !(k === 'height' && heightMapped)) unknown.push(`${labelOf(k)} 값은 이 작품에 쓰지 않았어요`);
  }
  const { params: clamped, adjusted } = clampParams(best, params);
  const touched = new Set([...Object.keys(lengths).filter(k => keys.has(k)), ...Object.keys(mapped)]);
  for (const p of best.params) {
    if (!touched.has(p.key)) continue;
    const u = p.unit === 'mm' ? 'mm' : p.unit;
    if (adjusted.includes(p.key)) understood.push(`${p.label} ${params[p.key]}${u}는 범위(${p.min}~${p.max}${u})를 벗어나서 ${clamped[p.key]}${u}로 맞췄어요`);
    else understood.push(`${p.label} ${clamped[p.key]}${u}`);
  }

  const materials = {};
  for (const [slot, options] of Object.entries(best.materialOptions)) {
    const hit = foundMats.find(k => options.includes(k));
    if (hit) {
      materials[slot] = hit;
      understood.push(`자재: ${MATERIALS[hit].name}`);
    }
  }
  if (understood.length === 1) understood.push('치수는 기본값으로 시작해요. 오른쪽에서 바꿀 수 있어요.');

  return {
    templateId: best.id, params: clamped, materials, understood, unknown,
    candidates: ranked.slice(0, 3).map(r => r.t.id)
  };
}

function labelOf(k) {
  return { width: '폭', depth: '깊이', height: '높이', hole: '구멍', tiers: '단 수', boxDepth: '수납칸 깊이' }[k] || k;
}

export { getTemplate };

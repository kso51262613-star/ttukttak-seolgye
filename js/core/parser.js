// 무료 모드 "말로 설계": 문장에서 종류·치수·자재를 찾아 템플릿에 적용한다.
import { TEMPLATES, getTemplate } from './templates/index.js';
import { MATERIALS } from './materials.js';
import { clampParams, defaultParams, resolveMaterials } from './model.js';
import { slotLabel } from './prompts.js';

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
  if (!param) return toMM(v, '');
  const fits = x => x >= param.min && x <= param.max;
  // 300 이상은 mm 로 본다. 다만 범위에 안 맞고 cm 로 보면 맞으면 cm (예: 해먹 거치대 길이 450 = 4.5m)
  if (v >= 300) return !fits(Math.round(v)) && fits(Math.round(v * 10)) ? Math.round(v * 10) : toMM(v, '');
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
    consume(state, new RegExp(`${label}\\s*[:=]?\\s*(?:은|는|이|가)?\\s*${NUM}${UNIT}`, 'gi'), m => {
      // "길이 5m 폭 1.5m" 처럼 폭·길이 말이 두 번 나오면 두 번째 값도 받아 두고, 어느 말(길이인지)로 말했는지 기억한다
      const h = { v: Number(m[1]), unit: m[2] || '', len: /길이|length/i.test(m[0]) };
      if (key !== 'width') put(key, m[1], m[2]);
      else if (!hints.width) hints.width = h;
      else hints.width2 ??= h;
    });
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
  // 폭·길이를 둘 다 말했으면 "길이"라고 한 쪽이 길이(width) 칸, 다른 쪽이 깊이 칸.
  // 단, 그렇게 넣었을 때 둘 다 작품 범위에 맞을 때만 ("다리 길이 40" 처럼 다른 말의 길이가 끼면 틀어짐). 아니면 큰 값이 길이
  if (hints.width2 && best.params.some(p => p.key === 'depth') && !hints.depth) {
    const a = hints.width;
    const c = hints.width2;
    const pk = Object.fromEntries(best.params.map(p => [p.key, p]));
    const fits = (h, key) => { const v = resolveLength(h, pk[key]); return v >= pk[key].min && v <= pk[key].max; };
    const guess = h => (h.unit ? toMM(h.v, h.unit) : Number(h.v));
    // 폭 칸 이름이 "길이"인 작품(해먹 거치대, 픽업 랙)은 "길이"라고 한 값이 폭 칸, 그 밖에는 "폭"이라고 한 값이 폭 칸
    const lengthIsWidth = /길이/.test(pk.width?.label || '');
    let [len, wid] = a.len !== c.len ? ((a.len === lengthIsWidth) ? [a, c] : [c, a]) : [null, null];
    if (!len || !(fits(len, 'width') && fits(wid, 'depth'))) [len, wid] = guess(a) >= guess(c) ? [a, c] : [c, a];
    hints.width = len;
    hints.depth = wid;
    delete hints.width2;
  }
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
  return { width: '폭', width2: '두 번째 폭·길이', depth: '깊이', height: '높이', hole: '구멍', tiers: '단 수', boxDepth: '수납칸 깊이' }[k] || k;
}

// ---------- 이 설계 고치기 (무료 규칙) ----------
// 지금 열린 설계를 고치는 짧은 말("폭 1500, 높이 10cm 더 높게, 방부목으로")을 조각마다 읽는다.
// 돌려주는 값 { edit: { params, materials, title? }, lines: 고친 줄, unknown: 못 알아들은 것 }.
// 설계는 바꾸지 않는다 (적용은 edit.js 의 applyEdit). 헷갈리는 말은 고치지 않고 unknown 에 넣어 AI 에 맡긴다

// 앞말 끝소리에 맞는 조사 (받침이 있으면 a, 없으면 b). '으로/로' 는 ㄹ 받침 뒤에도 '로'.
// 숫자는 읽는 소리(1 일, 3 삼, 6 육, 10 십, 100 백 …), 영어는 L·R(ㄹ), M·N(받침) 만 받침으로 본다
export function josa(word, a, b) {
  const s = String(word ?? '').replace(/[\s'"’”)\]]+$/, '');
  const ch = s.at(-1) || '';
  const code = ch.charCodeAt(0) - 0xac00;
  let jong = 0; // 0 받침 없음, 8 ㄹ, 그 밖은 다른 받침
  // 숫자 뒤 mm·cm·m 은 "미터" 로 읽는다
  if (/\d\s*(?:mm|cm|m)$/i.test(s)) jong = 0;
  else if (code >= 0 && code < 11172) jong = code % 28;
  else if (/\d/.test(ch)) jong = ch === '0' ? (/(^|[^\d])0+$/.test(s) ? 21 : 1) : ({ 1: 8, 7: 8, 8: 8, 3: 16, 6: 1 }[ch] || 0);
  else if (/[lr]/i.test(ch)) jong = 8;
  else if (/[mn]/i.test(ch)) jong = 4;
  if (!jong || (a === '으로' && jong === 8)) return b;
  return a;
}

// 치수 칸 이름에서 괄호 설명을 뺀 것 ("뽑은 길이 (0이면 …)" 에서 "뽑은 길이")
export const baseLabel = p => String(p.label).replace(/\s*\([^)]*\)/g, '').trim();
const fmtNum = v => String(Math.round(Number(v) * 10) / 10);

// "폭 1200 에서 1500 으로 (10cm 더)"
export function changeLine(p, from, to, note = '') {
  const t = fmtNum(to);
  return `${baseLabel(p)} ${fmtNum(from)} 에서 ${t} ${josa(t, '으로', '로')}${note ? ` (${note})` : ''}`;
}
// "폭 5000mm는 범위(600~2000mm)를 벗어나서 2000mm로 맞췄어요"
export function clampLine(p, raw, to) {
  const u = p.unit || '';
  const a = `${fmtNum(raw)}${u}`;
  const b = `${fmtNum(to)}${u}`;
  return `${baseLabel(p)} ${a}${josa(a, '은', '는')} 범위(${p.min}~${p.max}${u})를 벗어나서 ${b}${josa(b, '으로', '로')} 맞췄어요`;
}

const KO_NUM = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5 };
// 한글 수. 낱말 안에 든 것은 읽지 않는다: 앞 글자가 한글이면 안 되고(가능한), 한·두·세·네는 개·칸·단·층이나 빈칸 앞에서만
// (두께, 세로, 네모는 아님), 하나·둘·셋·넷·다섯은 빈칸·조사 앞에서만 (둘레는 아님)
const KO_NUM_RE = '(?<![가-힣])(?:(?:한|두|세|네)(?=\\s|개|칸|단|층)|(?:다섯|하나|둘|셋|넷)(?=$|[^가-힣]|으로|로|을|를|은|는|이|가|만|씩|개|칸|단|층))';
// 기본 별명: [말들, 기본 칸 key 들]. 말로 설계(parseText)의 별명(수납 깊이, 구멍)도 같이
const DIM_ALIASES = [
  [['폭', '가로', '너비', '길이', 'width'], ['width']],
  [['깊이', '세로', 'depth'], ['depth']],
  [['높이', '키', 'height'], ['height']],
  [['단', '층', '칸'], ['tiers', 'rows']],
  [['수납 깊이', '수납칸 깊이', '수납칸'], ['boxDepth']],
  [['구멍', 'hole'], ['hole']]
];
const STANDARD_DIMS = new Set(['width', 'depth', 'height']);
// 늘리는 말·줄이는 말. 치수 이름이 없으면 말의 첫 글자로 칸을 고른다 (* = 폭·깊이·높이 모두)
const GROW = ['길게', '길고', '늘려', '늘리', '늘여', '키워', '키우', '높게', '높고', '높여', '높이고', '올려', '올리', '넓게', '넓고', '넓혀', '넓히', '크게', '크고', '깊게', '깊고'];
const SHRINK = ['짧게', '짧고', '줄여', '줄이', '낮게', '낮고', '낮춰', '낮추', '내려', '내리', '좁게', '좁고', '좁혀', '좁히', '작게', '작고', '얕게', '얕고'];
const VERB_DIM = { 높: '높이', 낮: '높이', 올: '높이', 내: '높이', 넓: '폭', 좁: '폭', 깊: '깊이', 얕: '깊이', 길: '길이', 짧: '길이', 늘: '길이', 줄: '길이', 크: '*', 작: '*', 키: '*' };
// 칸이 정해진 말 (높게는 높이 칸)
const SPECIFIC_DIM = { 높: '높이', 낮: '높이', 올: '높이', 내: '높이', 넓: '폭', 좁: '폭', 깊: '깊이', 얕: '깊이' };
// 개수 칸(단 수)에는 늘리기·줄이기 말만. "다리 … 길게" 는 길이 말일 때만 높이
const COUNT_VERB = /^(?:늘|줄)/;
const LENGTH_VERB = /^(?:길|짧|늘|줄)/;
const LEN_UNIT = '(?:mm|cm|m|밀리미터|미리|밀리|센티미터|센티|센치|미터)';
const EDIT_UNIT = '(mm|cm|m|밀리미터|미리|밀리|센티미터|센티|센치|미터)';
const REL_UNIT = '(mm|cm|m|밀리미터|미리|밀리|센티미터|센티|센치|미터|%|퍼센트|프로)';
const FILL = '(?:조금|좀|약간|살짝|정도|쯤|가량|만큼|만|씩|더)';
// 치수 이름 뒤 조사
const PARTICLE = '(?:을|를|은|는|이|가|도|만)';
const UNIT_NAMES = { 미리: 'mm', 밀리: 'mm', 밀리미터: 'mm', 센티: 'cm', 센치: 'cm', 센티미터: 'cm', 미터: 'm' };
const normUnit = u => UNIT_NAMES[u] || u || '';
const compactName = s => String(s).replace(/\s+/g, '').toLowerCase();

// 조각째 못 알아들음으로 두는 말: 하지 말라는 말("늘리지 마"), 곱하기("두 배"), 단마다의 치수("단 높이", "선반 간격")
const NEGATION_RE = /지\s*(?:마|말|않)|말고/;
const TIMES_RE = /(?:\d|(?<![가-힣])(?:두|세|네))\s*배(?:로|만큼|\s|$|[,.!])/;
const PER_TIER_RE = /(?<![가-힣])(?:단|칸|층)\s*(?:높이|간격|사이)|선반\s*(?:간격|사이)/;
// 단 수를 "5단" 처럼 조각 맨 앞에 썼어도 이런 말이 있으면 단 수가 아니다 ("2단 서랍 추가", "1단에 바퀴 달아")
const TIER_BLOCK_RE = /추가|달아|달기|달고|짜리|서랍|빼|없애|넣어|넣기|넣고|붙여|붙이/;
// 이름 바꾸기 조각
const TITLE_RE = /^(?:작품\s*)?(?:이름|제목)(\s*(?:을|를|은|는|이|가)\s*|\s*[:=]\s*|\s+)(.+)$/;

// 자재 이름 첫 낱말로도 찾는다 (구조목으로, 각파이프로 …)
const LOOSE_MATERIAL_WORDS = ['구조목', '방부목', '소나무', '집성목', '자작합판', '합판', 'mdf', '각파이프', '평철', '철판', '환봉', '앵글', '적벽돌', '내화벽돌'];
const realMaterials = () => Object.entries(MATERIALS).filter(([, m]) => m.kind !== 'ref');
// 자재 이름 전체 ("방부목 2x4", "집성목 18t", "각파이프 30x30": 괄호 설명 뺀 이름과 앞 두 낱말). 긴 것부터
const FULL_MATERIAL_NAMES = realMaterials().flatMap(([k, m]) => {
  const words = m.name.replace(/\s*\([^)]*\)/g, '').toLowerCase().split(/\s+/).filter(Boolean);
  return [...new Set([words.join(' '), words.slice(0, 2).join(' ')])].filter(n => n.includes(' ')).map(n => [n, k]);
}).sort((a, b) => b[0].length - a[0].length);
// 자재 낱말 하나가 가리키는 자재들 (2x4 는 구조목도 방부목도, 자재 칸이 고른다). 긴 낱말부터
const EDIT_MATERIAL_WORDS = (() => {
  const map = new Map();
  const put = (w, k) => { if (!map.has(w)) map.set(w, []); if (!map.get(w).includes(k)) map.get(w).push(k); };
  for (const [w, k] of MATERIAL_WORDS) put(w, k);
  put('2x4', 'treated_2x4');
  for (const w of LOOSE_MATERIAL_WORDS) for (const [k, m] of realMaterials()) if (m.name.toLowerCase().startsWith(w)) put(w, k);
  return [...map].sort((a, b) => b[0].length - a[0].length);
})();

// 남은 말 가운데 군말: 조사만 남은 것, 꾸밈말, 고치라는 말 끝, 작품 전체를 부르는 말. 이것 말고 남은 말은 못 알아들은 것
const STOP_WORDS = new Set([
  '좀', '조금', '약간', '살짝', '더', '좀더', '조금더', '정도', '쯤', '가량', '만큼', '씩', '그리고', '및', '또', '또는', '그냥', '제발', '꼭', '딱',
  '대략', '약', '다', '모두', '전부', '전체', '전체적', '많이', '조금씩', '이', '그', '저', '요', '맨',
  '자재', '재료', '재질', '치수', '크기', '사이즈', '설계', '작품', '이거', '이것', '그거', '그것', '저거', '저것', '것', '거', '걸', '부분', '쪽', '모양', '가구',
  '선반', '벤치', '테이블', '식탁', '책상', '의자', '스툴', '탁자', '칸', '단', '층', '판',
  '해', '해줘', '해요', '해서', '해도', '해봐', '해주세요', '해줄래', '해주라', '하고', '하게', '하면', '하자', '할래', '할게', '합니다', '하세요',
  '줘', '줘요', '주세요', '주라', '줄래', '돼', '되게', '됐으면', '됨',
  '그대로', '유지', '두고', '둬', '놔두고', '냅두고', '냅둬'
]);
const STOP_PREFIX = /^(?:바꿔|바꾸|바꿨|변경|수정|고쳐|고치|만들|맞춰|싶|원해|부탁|좋겠)/;
const PARTICLE_END = /(?:을|를|은|는|이|가|도|만|의|에|에서|으로|로|와|과|랑|이랑|까지|부터|처럼|보다)$/;
function isStopToken(tk, extra) {
  if (/\d/.test(tk) || !/[가-힣a-z]/.test(tk)) return true; // 숫자는 따로 알리고, 기호는 군말
  const bare = tk.replace(PARTICLE_END, '');
  return !bare || STOP_WORDS.has(tk) || STOP_WORDS.has(bare) || extra.has(tk) || extra.has(bare) || STOP_PREFIX.test(tk);
}
// 남은 말: 군말이 아닌 첫 낱말부터 마지막 낱말까지 ("등받이 추가해줘" 에서 "등받이 추가", "두께를" 에서 "두께")
function leftoverPhrase(text, extra) {
  const toks = text.split(/\s+/).filter(Boolean);
  const keep = toks.map(tk => !isStopToken(tk, extra));
  const first = keep.indexOf(true);
  if (first < 0) return '';
  const phrase = toks.slice(first, keep.lastIndexOf(true) + 1).join(' ').replace(/\s*(?:해\s*줘|해\s*주세요|해요|해|줘|주세요)$/, '').trim();
  const bare = phrase.replace(/(?:을|를|은|는|으로|로|에서|에|도|만|의)$/, '');
  return bare.split(' ').at(-1).length >= 2 ? bare : phrase;
}

// "1m 50cm", "1m50" 은 1500mm 로
const normalizeLengths = s => s.replace(
  /(?<![\d.])(\d+)\s*(?:m|미터)\s*(\d{1,2})\s*(?:cm|센티미터|센티|센치)?(?![\d.]|\s*(?:mm|m|미리|밀리|미터|개|단|칸|층|%|배))/g,
  (all, a, b) => `${Number(a) * 1000 + Number(b) * 10}mm`
);

// 템플릿 치수 칸을 부르는 이름들 (빈칸 뺀 이름을 열쇠로 { name, key }). 특별 key: '@height' 는 높이 칸이 없는 템플릿의 전체 높이
// (fromHints 로 나눔), '@leg' 는 "다리" (길이 말과 함께면 높이, 그 밖에는 못 알아들음)
function dimNames(t) {
  const names = new Map();
  const params = t?.params || [];
  const add = (name, key) => {
    const n = compactName(name);
    if (n && !names.has(n)) names.set(n, { name: String(name).trim().toLowerCase(), key });
  };
  const words = p => baseLabel(p).split(/\s+/).filter(Boolean);
  // 1) label 전체, 괄호 앞부분, 괄호 안 다른 이름(숫자·쉼표가 없는 것: "적재함 길이")
  for (const p of params) {
    add(p.label, p.key);
    add(baseLabel(p), p.key);
    for (const m of String(p.label).matchAll(/\(([^()]*)\)/g)) if (!/[\d,]/.test(m[1])) add(m[1], p.key);
  }
  // 2) label 첫 낱말과 끝 낱말 (두 글자 이상만. 두 칸이 같은 낱말이면 쓰지 않는다)
  for (const pick of [w => w[0], w => (w.length > 1 ? w.at(-1) : null)]) {
    const seen = new Map();
    for (const p of params) {
      const w = pick(words(p));
      if (w && w.length > 1) seen.set(w, seen.has(w) ? null : p.key);
    }
    for (const [w, key] of seen) if (key) add(w, key);
  }
  // 3) 기본 별명: 그 말이 label 낱말에 든 칸이 하나뿐이면 그 칸 ("틀 폭" 의 폭), 아니면 기본 칸
  for (const [list, keys] of DIM_ALIASES) {
    for (const a of list) {
      const holders = params.filter(p => words(p).includes(a));
      const key = holders.length === 1 ? holders[0].key : keys.find(k => params.some(p => p.key === k));
      if (key) add(a, key);
      else if (a === '높이' && t?.fromHints) add(a, '@height');
    }
  }
  // 4) 다리: 템플릿 칸 이름이 아니면 특별 이름
  add('다리', '@leg');
  add('다리 길이', names.get('다리').key);
  return names;
}

// 이름들을 정규식으로 (긴 이름 먼저). 한 글자 이름(단, 키 …)은 낱말 안에 든 것(하단, 스키)을 읽지 않는다.
// 폭은 "선반폭" 처럼 붙여 써도 읽는다
function namesPattern(names) {
  const list = [...names.values()].map(v => v.name).sort((a, b) => b.length - a.length);
  if (!list.length) return '(?!)';
  return list.map(n => {
    const body = n.split(/\s+/).map(escRe).join('\\s*');
    return [...n.replace(/\s+/g, '')].length === 1 && n !== '폭' ? `(?<![가-힣])${body}` : body;
  }).join('|');
}

// 상대값 크기: 숫자가 없으면 지금 값의 10% (step 에 맞춰 반올림, 적어도 한 step), %, 단위, 단위 없는 300 미만은 cm
function relAmount(p, cur, num, unit) {
  const u = normUnit(unit);
  const step = p.step > 0 ? p.step : 1;
  const ofCur = pct => Math.max(step, Math.round((cur * pct) / 100 / step) * step);
  if (num === undefined) return { delta: ofCur(10), note: '약 10%' };
  const v = Number(num);
  if (u === '%' || u === '퍼센트' || u === '프로') return { delta: ofCur(v), note: `${fmtNum(v)}%` };
  if (p.unit !== 'mm') return { delta: v, note: `${fmtNum(v)}${p.unit || ''}` };
  if (u) return { delta: toMM(v, u), note: `${fmtNum(v)}${u}` };
  const delta = v < 300 ? Math.round(v * 10) : Math.round(v);
  return { delta, note: `${delta}mm` };
}

// 새 이름: 따옴표 안, "이름:" 뒤, 또는 "… 으로/로/라고 (바꿔 줘)" 의 앞부분. 새 이름이 아닌 말(지어 줘, 멋있게)은 빈 글자
function newTitle(sep, rest) {
  const s = String(rest).trim();
  const q = s.match(/["'“‘「『]([^"'”’」』]+)["'”’」』]/);
  if (q) return q[1].trim().slice(0, 40);
  let name;
  if (/[:=]/.test(sep)) name = s.replace(/\s*(?:으로|로|이라고|라고)?\s*(?:바꿔|바꾸어|변경해|변경|정해|해)\s*(?:줘|주세요|줄래|주라|요|라)?\s*[.!]?$/, '').replace(/\s*(?:으로|로|이라고|라고)$/, '');
  else {
    const m = s.match(/^(.+?)\s*(?:으로|로|이라고|라고)(?:\s*(?:바꿔|바꾸어|변경해|변경|정해|해)\s*(?:줘|주세요|줄래|주라|요|라)?)?\s*[.!]?$/);
    if (!m) return '';
    name = m[1];
  }
  name = name.trim().slice(0, 40);
  if (!name || /^(?:지어|짓|바꿔|바꾸|변경|수정|고쳐|그대로|유지)/.test(name) || /게$/.test(name)) return '';
  return name;
}

// 찾은 부분을 공백으로 지운다. fn 이 false 를 돌려주면 그 부분은 남겨 두고, 글자를 돌려주면 그 글자로 바꾼다
function eat(state, re, fn) {
  state.text = state.text.replace(re, (...m) => {
    const r = fn(m);
    return r === false ? m[0] : typeof r === 'string' ? r : ' '.repeat(m[0].length);
  });
}

// 자재 말을 찾아 지운다 (자재 이름 전체 먼저, 그다음 낱말, 긴 것부터). [{ word, keys, full }]
function findMaterials(st) {
  const hits = [];
  for (const [n, k] of FULL_MATERIAL_NAMES) {
    const re = new RegExp(`(?<![\\da-z.])${n.split(' ').map(escRe).join('\\s*')}(?![\\da-z.×*])`, 'g');
    st.text = st.text.replace(re, s => { hits.push({ word: s.replace(/\s+/g, ' '), keys: [k], full: true }); return ' '.repeat(s.length); });
  }
  for (const [w, keys] of EDIT_MATERIAL_WORDS) {
    st.text = st.text.replace(materialRe(w), s => { hits.push({ word: s, keys, full: false }); return ' '.repeat(s.length); });
  }
  return hits;
}

// 자재 칸 이름("옆판을", "틀은")을 찾는 정규식 (한 글자 이름 "살" 이 "살짝" 에 걸리지 않게 뒤에 조사·빈칸이 올 때만)
function slotRe(slot) {
  const body = slotLabel(slot).toLowerCase().split(/\s+/).map(escRe).join('\\s*');
  return new RegExp(`(?<![가-힣])${body}(?=\\s|$|[,.]|을|를|은|는|이|가|도|만|의|자재|재료)`, 'g');
}

export function parseEdit(input, design, template) {
  const t = template || null;
  const params = t?.params || [];
  const byKey = Object.fromEntries(params.map(p => [p.key, p]));
  const start = params.length ? clampParams(t, design?.params || {}).params : {};
  const cur = { ...start };
  const slots = Object.entries(t?.materialOptions || {});
  const startMats = t ? resolveMaterials(t, design || {}) : {};
  const mats = { ...startMats };
  const oldTitle = String(design?.title ?? '');
  const lines = [];
  const unknown = [];
  let title;

  const names = dimNames(t);
  const NAMES = namesPattern(names);
  const keyOf = s => names.get(compactName(s || ''))?.key;
  const countKey = ['tiers', 'rows'].find(k => byKey[k]);
  // 작품을 부르는 말(템플릿 키워드: 벤치, 선반 …)도 군말
  const stopExtra = new Set((t?.keywords || []).map(k => String(k).toLowerCase()));
  // 이번 조각에서 고친 칸 (남은 말 가운데 그 칸의 이름은 군말: "기둥 높이 1.6m" 의 기둥)
  let touched = new Set();
  // 한 칸 바꾸기: 범위에 맞추고 줄을 남긴다 (quiet: 값이 그대로면 줄을 안 남김)
  const setParam = (key, raw, note = '', quiet = false) => {
    touched.add(key);
    const p = byKey[key];
    const from = cur[key];
    const { params: c, adjusted } = clampParams(t, { ...cur, [key]: raw });
    const to = c[key];
    if (adjusted.includes(key)) lines.push(clampLine(p, raw, to));
    else if (to === from) { if (!quiet) lines.push(`${baseLabel(p)} ${fmtNum(to)} (그대로)`); }
    else lines.push(changeLine(p, from, to, note));
    cur[key] = to;
  };
  // 말이 이 칸에 맞는지: 늘리기·줄이기·크게는 어느 칸이나, 높게·넓게·깊게 같은 말은 그 치수 칸이거나 폭·깊이·높이가 아닌 칸(간격, 구멍 …)
  const verbFits = (key, verb) => {
    const want = SPECIFIC_DIM[verb[0]];
    return !want || !STANDARD_DIMS.has(key) || keyOf(want) === key;
  };
  const verbKeys = verb => {
    const d = VERB_DIM[verb[0]];
    return d === '*' ? ['폭', '깊이', '높이'].map(keyOf) : [keyOf(d)];
  };

  const TN = `(\\d+|${KO_NUM_RE})`;
  const TV = '(추가|늘려|늘리|빼|줄여|줄이|없애|더)';
  const tierCount = s => (/^\d+$/.test(s) ? Number(s) : KO_NUM[s]);
  const VERBS = [...GROW, ...SHRINK].sort((a, b) => b.length - a.length).join('|');
  // 숫자 뒤에 "x 숫자"(2x4 같은 단면)가 이어지면 치수가 아니다
  const NOT_SECTION = '(?!\\s*[x×*]\\s*\\d)';
  const FROM = `(?:\\d+(?:\\.\\d+)?\\s*${LEN_UNIT}?\\s*에서\\s*)?`;
  // 목표값·단 수 뒤에 오는 늘리는·줄이는 말 ("300으로 줄여")
  const TAIL = `((?:\\s*${FILL})*\\s*(${VERBS}))?`;
  const tierRelRes = [
    new RegExp(`${TN}\\s*(?:개\\s*)?(?:칸|단|층)\\s*(?:을|를|만|씩|정도)?\\s*(?:더\\s*)?${TV}`, 'g'),
    new RegExp(`(?<![가-힣])(?:칸|단|층)\\s*(?:수\\s*)?(?:을|를|은|는)?\\s*${TN}\\s*(?:개\\s*)?(?:를|을|만|씩|정도)?\\s*(?:더\\s*)?${TV}`, 'g')
  ];
  const tierAbsRe = new RegExp(`${TN}\\s*(?:개\\s*)?(?:칸|단|층)(?:\\s*짜리)?(?:\\s*(으로|로|까지)${TAIL})?`, 'g');
  const keepRe = new RegExp(`(?:(${NAMES})\\s*${PARTICLE}?\\s*)?(?:그대로|유지)(?:\\s*(?:두고|둬요|둬|두세요|해줘|해요|해|하고|해서|할게))?`, 'g');
  // 목표값: 이름 + 숫자 + 으로·로·까지 (+ 뒤의 늘리는·줄이는 말까지). "높이 450에서 400으로" 처럼 지금 값을 같이 말해도 뒤 숫자
  const targetRe = new RegExp(`(${NAMES})\\s*${PARTICLE}?\\s*[:=]?\\s*${FROM}(\\d+(?:\\.\\d+)?|${KO_NUM_RE})${NOT_SECTION}\\s*${EDIT_UNIT}?\\s*(?:으로|로|까지)${TAIL}`, 'g');
  const relRe = new RegExp(`(?:(${NAMES})\\s*${PARTICLE}?\\s*)?(?:${FILL}\\s*)*(?:(\\d+(?:\\.\\d+)?)${NOT_SECTION}\\s*${REL_UNIT}?\\s*)?(?:${FILL}\\s*)*(${VERBS})`, 'g');
  // 절대값: 이름 + 숫자 (한글 수는 목표값일 때만). 뒤에 개수(개·단)나 비율(%)이 붙은 숫자는 치수가 아니다
  const absRe = new RegExp(`(${NAMES})\\s*${PARTICLE}?\\s*[:=]?\\s*${FROM}(\\d+(?:\\.\\d+)?)${NOT_SECTION}\\s*${EDIT_UNIT}?(?![\\d.]|\\s*(?:개|단|칸|층|%|퍼센트|프로|배))`, 'g');
  const absOnce = new RegExp(absRe.source);
  // 따로 떼어 낸 "이름 + 숫자" 를 절대값으로 읽을 수 있는지
  const absReadable = s => {
    const r = absOnce.exec(s);
    if (!r) return false;
    const k = keyOf(r[1]);
    return k === '@height' || (!!byKey[k] && (byKey[k].unit === 'mm' || !r[3]));
  };

  // 1,500 처럼 천 단위 쉼표는 없애고, 쉼표·그리고·하고·및·줄바꿈·마침표로 조각을 나눈다
  const text = String(input ?? '').replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const pieces = text.split(/[,，、;\n]+|\s*그리고\s*|하고(?=\s|$)|\s+및\s+|\.(?=\s|$)/).map(s => s.trim()).filter(Boolean);

  for (const piece of pieces) {
    // 1) 이름 바꾸기 (글자 크기는 원문 그대로). 새 이름은 따옴표, "이름:" 또는 "… 으로/로/라고" 로 말할 때만
    const tm = piece.match(TITLE_RE);
    if (tm) {
      const before = title ?? oldTitle;
      if (/^(?:그대로|유지)/.test(tm[2].trim())) { lines.push(`이름 '${before}' (그대로)`); continue; }
      const name = newTitle(tm[1], tm[2]);
      if (!name) unknown.push(piece);
      else if (name === before) lines.push(`이름 '${before}' (그대로)`);
      else {
        lines.push(`이름 '${before}' 에서 '${name}'${josa(name, '으로', '로')}`);
        title = name;
      }
      continue;
    }
    // 2) 하지 말라는 말, 곱하기, 단마다의 치수는 엉뚱하게 고치지 않게 조각째 못 알아들음으로
    if (NEGATION_RE.test(piece) || TIMES_RE.test(piece) || PER_TIER_RE.test(piece)) { unknown.push(piece); continue; }
    const st = { text: normalizeLengths(piece.toLowerCase()) };
    let ok = false;
    const fails = [];
    touched = new Set();
    // 3) 자재 말은 먼저 찾아 지운다 (2x4 의 숫자를 치수로 읽지 않게). 적용은 맨 뒤에
    const hits = findMaterials(st);
    // 4) 그대로 두기: "높이는 그대로 (두고)"
    eat(st, keepRe, m => {
      const k = m[1] ? keyOf(m[1]) : null;
      if (byKey[k]) lines.push(`${baseLabel(byKey[k])} ${fmtNum(cur[k])} (그대로)`);
      ok = true;
    });
    // 5) 단 수: "한 칸 추가", "두 단 빼", "단 수를 하나 늘려"
    for (const re of tierRelRes) {
      eat(st, re, m => {
        if (!countKey) { fails.push(m[0].trim()); return; }
        const n = tierCount(m[1]);
        const sign = /빼|줄|없애/.test(m[2]) ? -1 : 1;
        setParam(countKey, cur[countKey] + sign * n, `${n}${byKey[countKey].unit} ${sign > 0 ? '더' : '줄임'}`);
        ok = true;
      });
    }
    // "5단으로", 조각 맨 앞의 "5단". 둘 이상이면 마지막 것 ("3단 선반을 5단으로")
    const tierAbs = [];
    eat(st, tierAbsRe, m => {
      const atStart = /^\s*$/.test(m.at(-1).slice(0, m.at(-2)));
      if (!m[2] && !(atStart && !TIER_BLOCK_RE.test(piece))) return false;
      tierAbs.push(m);
    });
    if (tierAbs.length) {
      const m = tierAbs.at(-1);
      if (!countKey) fails.push(m[0].trim());
      else { setParam(countKey, tierCount(m[1])); ok = true; }
    }
    // 절대값 하나 (목표값이면 target). 뒤의 말이 다른 치수 말이면("폭 1500으로 더 높게") 그 말은 남겨서 따로 읽는다
    const absolute = (m, target) => {
      const [all, name, num, unit, tail, verb] = m;
      const key = keyOf(name);
      const ko = !/^\d/.test(num);
      const keep = target && verb && !verbFits(key, verb) ? ' '.repeat(all.length - tail.length) + tail : undefined;
      if (key === '@height') {
        const mapped = ko ? {} : t.fromHints({ height: resolveLength({ v: Number(num), unit: normUnit(unit) }, null) }) || {};
        const keys = Object.keys(mapped).filter(k => byKey[k] && Number.isFinite(mapped[k]));
        if (!keys.length) { fails.push(all.trim()); return; }
        const before = lines.length;
        for (const k of keys) setParam(k, mapped[k], '', true);
        // 나눈 칸이 모두 그대로면 그렇다고 남긴다
        if (lines.length === before) for (const k of keys) lines.push(`${baseLabel(byKey[k])} ${fmtNum(cur[k])} (그대로)`);
        ok = true;
        return keep;
      }
      const p = byKey[key];
      // "다리 40cm" 같은 말, 단위가 안 맞는 값(단 수에 cm, 길이에 한글 수)은 읽지 않는다
      if (!p || (p.unit === 'mm' ? ko : !!unit)) { fails.push(all.trim()); return; }
      setParam(key, p.unit === 'mm' ? resolveLength({ v: Number(num), unit: normUnit(unit) }, p) : tierCount(num));
      ok = true;
      return keep;
    };
    // 6) 목표값: "깊이를 300으로 줄여", "단 수를 다섯으로"
    eat(st, targetRe, m => absolute(m, true));
    // 7) 상대값: "높이 10cm 더 높게", "조금 낮게", "살 간격 1cm 넓게"
    eat(st, relRe, m => {
      const [all, name, , , verb] = m;
      let [, , num, unit] = m;
      const sign = SHRINK.includes(verb) ? -1 : 1;
      const key = name ? keyOf(name) : undefined;
      let keys;
      let keep;
      if (key === '@leg') {
        // "다리를 10cm 더 길게" 는 높이 (높이 칸이 있고 길이 말일 때만)
        if (!LENGTH_VERB.test(verb) || !byKey.height) { fails.push(all.trim()); return; }
        keys = ['height'];
      } else if (name && STANDARD_DIMS.has(key) && !verbFits(key, verb)) {
        // "폭 1500 더 높게": 말은 그 말의 칸에(10%), 이름·숫자는 절대값으로 따로 읽는다. 따로 못 읽는 숫자면 못 알아들음
        const kept = all.slice(0, all.length - verb.length);
        if (num !== undefined && !absReadable(kept)) { fails.push(all.trim()); return; }
        keep = kept + ' '.repeat(verb.length);
        keys = verbKeys(verb);
        num = undefined;
        unit = undefined;
      } else if (name) keys = [key];
      else {
        // 치수 이름 없이 말만: 앞에 모르는 말(부품 이름 같은 것)이 있으면 그 부품 이야기라 읽지 않는다 ("좌판을 넓게").
        // 크기·사이즈를 늘리고 줄이면 폭·깊이·높이 모두
        const before = m.at(-1).slice(0, m.at(-2)).split(/\s+/).filter(Boolean);
        if (before.some(tk => !isStopToken(tk, stopExtra))) { fails.push(all.trim()); return; }
        const whole = before.some(tk => /^(?:크기|사이즈|전체|전체적)/.test(tk));
        keys = whole && /^(?:늘|줄)/.test(verb) ? verbKeys('크') : verbKeys(verb);
      }
      keys = [...new Set(keys)].filter(k => byKey[k]);
      // 개수 칸(단 수)은 늘리기·줄이기 말과 개수만 ("단을 10cm 내려" 는 못 알아들음)
      const countBad = k => byKey[k].unit !== 'mm' && (!COUNT_VERB.test(verb) || (unit && !/^(?:%|퍼센트|프로)$/.test(unit)));
      if (!keys.length || keys.some(countBad)) { fails.push((keep ? verb : all).trim()); return keep; }
      for (const k of keys) {
        const { delta, note } = relAmount(byKey[k], cur[k], num, unit);
        setParam(k, cur[k] + sign * delta, `${note} ${sign > 0 ? '더' : '줄임'}`);
      }
      ok = true;
      return keep;
    });
    // 8) 절대값: "폭 1500", "높이 45cm"
    eat(st, absRe, m => absolute(m, false));
    // 9) 자재: 자재 이름 전체가 있으면 그것, 아니면 낱말들이 함께 가리키는 자재("2x4 방부목"). 함께 가리키는 것이 없으면
    //    낱말마다 따로("40각, 합판"). 자재 칸 이름("옆판을")이 있으면 그 칸만
    if (hits.length) {
      ok = true;
      const full = hits.filter(h => h.full);
      let cands;
      let apart = false;
      if (full.length) cands = [...new Set(full.flatMap(h => h.keys))];
      else {
        const both = hits.slice(1).reduce((acc, h) => acc.filter(k => h.keys.includes(k)), hits[0].keys);
        apart = !both.length;
        cands = apart ? [...new Set(hits.flatMap(h => h.keys))] : both;
      }
      const named = slots.filter(([slot]) => {
        const re = slotRe(slot);
        if (!re.test(st.text)) return false;
        st.text = st.text.replace(re, s => ' '.repeat(s.length));
        return true;
      });
      let done = false;
      let single = null;
      const used = new Set();
      for (const [slot, opts] of named.length ? named : slots) {
        const accept = cands.filter(k => opts.includes(k));
        if (!accept.length) continue;
        accept.forEach(k => used.add(k));
        // 고를 것이 하나뿐인 칸은 이미 그 자재
        if (opts.length < 2) { single ??= [slot, opts[0]]; continue; }
        done = true;
        const from = mats[slot];
        if (accept.includes(from)) { lines.push(`${slotLabel(slot)} 자재: ${MATERIALS[from].name} (그대로)`); continue; }
        const to = accept[0];
        lines.push(`${slotLabel(slot)} 자재: ${MATERIALS[from].name} 에서 ${MATERIALS[to].name} ${josa(MATERIALS[to].name, '으로', '로')}`);
        mats[slot] = to;
      }
      if (!done && single) lines.push(`${slotLabel(single[0])} 자재는 ${MATERIALS[single[1]].name} 하나만 써요`);
      // 고를 수 없는 자재 말: 따로 읽은 낱말은 낱말마다, 아니면 가장 긴 말 하나로 (같은 말은 한 번만)
      const cannot = apart ? hits.filter(h => !h.keys.some(k => used.has(k))) : done || single ? [] : hits;
      const words = [...new Set(cannot.map(h => h.word))].filter((w, i, all) => apart || w.length === Math.max(...all.map(x => x.length)));
      for (const w of apart ? words : words.slice(0, 1)) {
        unknown.push(named.length
          ? `${slotLabel(named[0][0])} 자재로 ${w}${josa(w, '은', '는')} 고를 수 없어요`
          : `이 작품에서는 ${w}${josa(w, '을', '를')} 고를 수 없어요`);
      }
    }
    // 10) 남은 말: 읽지 못한 숫자와 낱말 (군말과 이번에 고친 칸의 이름은 빼고). 하나도 못 읽은 조각은 원문 그대로
    const digits = [...st.text.matchAll(/\d+(?:\.\d+)?/g)].map(d => d[0]);
    const pieceStop = new Set([...stopExtra, ...[...names].filter(([, v]) => touched.has(v.key)).map(([n]) => n)]);
    const rest = leftoverPhrase(st.text, pieceStop);
    if (!ok) {
      if (fails.length || digits.length || rest) unknown.push(piece);
      continue;
    }
    unknown.push(...fails);
    for (const d of digits) unknown.push(`'${d}'은(는) 어디에 쓰는 숫자인지 몰라서 뺐어요`);
    if (rest) unknown.push(rest);
  }

  const edit = { params: {}, materials: {} };
  for (const p of params) if (cur[p.key] !== start[p.key]) edit.params[p.key] = cur[p.key];
  for (const [slot] of slots) if (mats[slot] !== startMats[slot]) edit.materials[slot] = mats[slot];
  if (title !== undefined && title !== oldTitle) edit.title = title;
  return { edit, lines, unknown };
}

export { getTemplate };

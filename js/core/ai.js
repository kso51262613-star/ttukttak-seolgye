// AI 모드: 사용자가 넣은 API 키로 Claude에게 부품 목록을 받아온다 (말로 설계, 사진·영상으로 설계).
// 키는 이 기기에만 저장되고, 요청은 브라우저에서 Anthropic으로 바로 간다.
import { MATERIALS } from './materials.js';
import { DESIGN_SCHEMA, VISION_SCHEMA, EDIT_SCHEMA, TEMPLATE_IDS, textSystemPrompt, visionSystemPrompt, editSystemPrompt, slotLabel } from './prompts.js';
import { buildVisionContent } from './vision.js';
import { costKrw } from './aiCost.js';
import { partBox, isRef, clampParams, slotOptions } from './model.js';

export const AI_MODEL = 'claude-opus-5-5';
// 버전을 고정해 둔다. 올릴 때는 tests/ai.test.js 와 브라우저에서 한 번 확인할 것
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
// 안전 판단으로 거절되면 서버가 알맞은 다른 모델로 다시 시도한다
const BETAS = ['server-side-fallback-2026-07-01'];
// Opus 5.5 는 생각(thinking)이 늘 켜져 있고 생각 토큰도 max_tokens 에 들어간다.
// SDK 는 21,333 을 넘으면 스트리밍을 요구하므로 그 안에서 넉넉히 잡는다
export const MAX_TOKENS = 20000;

const SHAPES = new Set(['box', 'barrel', 'wheel', 'cylinder']);
const list = v => (Array.isArray(v) ? v : []);
// AI 가 준 숫자의 한계: 부품 크기 1~10000mm, 자리 -10000~10000mm
const LIMIT = 10000;
const within = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// AI 부품 하나를 검사해 정리한다 (말로 설계, 사진 설계, 고치기의 추가 부품이 같이 쓴다). 쓸 수 없으면 null.
// counts: 이름별 번호. 같은 목록 안에서 id 가 ai-이름-1, ai-이름-2 처럼 겹치지 않게 함께 넘긴다
export function normalizePart(p, counts = {}) {
  if (!p || typeof p.material !== 'string' || !Object.hasOwn(MATERIALS, p.material)) return null;
  if (!Array.isArray(p.size) || p.size.length !== 3 || !p.size.every(v => Number.isFinite(v) && v > 0)) return null;
  if (!Array.isArray(p.pos) || p.pos.length !== 3 || !p.pos.every(Number.isFinite)) return null;
  // 이름은 한 줄로 40자까지 (id 도 이 이름으로 만든다)
  const name = cleanAiText(p.name).slice(0, 40) || '부품';
  counts[name] = (counts[name] || 0) + 1;
  // 드럼통은 늘 원기둥, 그 밖에는 받은 모양(모르는 값이면 상자)
  let shape = p.material === 'drum_200' ? 'cylinder' : SHAPES.has(p.shape) ? p.shape : 'box';
  const size = p.size.map(v => Math.round(within(v, 1, LIMIT) * 10) / 10);
  // 모양마다 크기 약속을 맞춘다: 아치는 높이 = 폭/2, 바퀴는 지름 두 값이 같게, 원기둥은 위에서 보면 원
  if (shape === 'barrel') size[1] = Math.round((size[0] / 2) * 10) / 10;
  if (shape === 'wheel') { const d = Math.max(size[1], size[2]); size[1] = d; size[2] = d; }
  if (shape === 'cylinder' && p.material !== 'drum_200' && Math.abs(size[0] - size[2]) > 0.05 * Math.max(size[0], size[2])) shape = 'box';
  const wall = shape === 'barrel' && Number(p.wall) > 0 && Number(p.wall) < size[0] / 2 ? Math.round(Number(p.wall) * 10) / 10 : undefined;
  // 기울기 (도). 세 숫자가 모두 -90~90 일 때만, 기울지 않았으면 넣지 않는다
  const rounded = Array.isArray(p.rot) && p.rot.length === 3 && p.rot.every(v => Number.isFinite(v) && Math.abs(v) <= 90)
    ? p.rot.map(v => Math.round(v * 10) / 10) : null;
  const rot = rounded && rounded.some(v => v !== 0) ? rounded : undefined;
  return {
    id: `ai-${name}-${counts[name]}`,
    name,
    material: p.material,
    size,
    pos: p.pos.map(v => within(v, -LIMIT, LIMIT)),
    shape,
    ...(wall ? { wall } : {}),
    ...(rot ? { rot } : {}),
    note: cleanAiText(p.note).slice(0, 200)
  };
}

export function validateAIResult(obj) {
  if (!obj || !Array.isArray(obj.parts)) throw new Error('AI 응답 형식이 맞지 않아요.');
  const counts = {};
  const parts = obj.parts.map(p => normalizePart(p, counts)).filter(Boolean);
  if (!parts.length) throw new Error('AI가 쓸 수 있는 부품을 만들지 못했어요. 설명을 조금 더 구체적으로 써 주세요.');
  if (!parts.some(p => !isRef(p))) throw new Error('참고용 부품만 있어요. 만들 부품을 하나 이상 넣어 주세요.');
  // 바닥 아래로 내려간 만큼 전체를 들어 올린다 (기울인 부품은 가장 낮은 꼭짓점 기준)
  const minY = Math.min(...parts.map(p => partBox(p).min[1]));
  if (minY < 0) parts.forEach(p => { p.pos[1] -= minY; });
  return {
    title: cleanAiText(obj.title).slice(0, 40) || 'AI 설계',
    parts,
    // 제작 순서는 20줄까지, 한 줄 300자까지. 부속은 50가지까지, 개수는 999까지
    steps: list(obj.steps).map(s => cleanAiText(s).slice(0, 300)).filter(Boolean).slice(0, 20),
    hardware: list(obj.hardware)
      .filter(h => h && h.name && Number(h.qty) > 0)
      .slice(0, 50)
      // 앱 안 AI 는 값을 안 주므로 0. 대화 길에서는 조사한 값을 넣을 수 있다
      .map(h => ({
        name: cleanAiText(h.name).slice(0, 60),
        qty: Math.min(999, Number(h.qty)),
        unit: cleanAiText(h.unit || '개').slice(0, 10) || '개',
        price: Number.isFinite(Number(h.price)) && Number(h.price) >= 0 ? Number(h.price) : 0
      })),
    // 사진·영상 분석에서만 오는 값 (말로 설계면 빈 값)
    analysis: String(obj.analysis || '').slice(0, 1000),
    assumptions: (Array.isArray(obj.assumptions) ? obj.assumptions : [])
      .map(a => String(a ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 10),
    similarTemplate: TEMPLATE_IDS.includes(obj.similarTemplate) ? obj.similarTemplate : 'none'
  };
}

// ---------- 이 설계 고치기 ----------
// AI 글의 대시·화살표 기호는 사용자 글에 쓰지 않으므로 바꾼다 (숫자 사이는 ~, 그 밖은 쉼표)
export function cleanAiText(s) {
  return String(s ?? '')
    .replace(/(\d)\s*[－—–―]\s*(?=\d)/g, '$1~')
    .replace(/\s*[－—–―←→]+\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '');
}
const textLines = (v, max) => list(v).map(s => cleanAiText(s).slice(0, 200)).filter(Boolean).slice(0, max);

// AI 고치기 답을 지금 설계에 맞춰 거른다: 템플릿에 있는 치수(범위에 맞춤)·자재 칸, 부품 목록에 있는 id(참고용 제외),
// 추가 부품은 normalizePart(참고용 자재는 안 됨, 30개까지), 통째로 다시 설계는 validateAIResult. 맞춘 치수는 adjusted 에 원래 값.
// 넣지 못한 것(없는 부품 id, 치수, 자재, 부품)은 questions 끝에 한 줄씩 알린다
export function validateEditResult(obj, { template = null, design = {}, parts = [] } = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('AI 응답 형식이 맞지 않아요.');
  const t = template;
  const tp = t?.params || [];
  const mode = obj.mode === 'rebuild' ? 'rebuild' : 'edit';
  const dropped = { params: [], materials: [], add: [] };
  const short = v => cleanAiText(v).slice(0, 20);
  // 치수: 템플릿에 있는 칸, 숫자만
  const want = {};
  for (const it of list(obj.params)) {
    if (!it) continue;
    const p = tp.find(x => x.key === it.key);
    if (p && typeof it.value === 'number' && Number.isFinite(it.value)) want[p.key] = it.value;
    else dropped.params.push(p ? p.label : short(it.key));
  }
  const params = {};
  const adjusted = [];
  if (Object.keys(want).length) {
    const before = clampParams(t, design?.params || {}).params;
    const { params: c, adjusted: adj } = clampParams(t, { ...before, ...want });
    for (const k of Object.keys(want)) {
      params[k] = c[k];
      if (adj.includes(k)) adjusted.push({ key: k, value: want[k] });
    }
  }
  // 자재: 그 칸에서 고를 수 있는 것만 (없는 칸·__proto__ 같은 이름은 넣지 않는다)
  const materials = {};
  for (const it of list(obj.materials)) {
    if (!it) continue;
    const opts = slotOptions(t, it.slot);
    if (opts && opts.includes(it.material)) materials[it.slot] = it.material;
    else {
      const m = typeof it.material === 'string' && Object.hasOwn(MATERIALS, it.material) ? MATERIALS[it.material].name : short(it.material);
      dropped.materials.push(`${slotLabel(short(it.slot))} ${m}`.trim());
    }
  }
  // 부품 id: 지금 목록에 있는 것만 (참고용 제외). 없는 id 는 모아서 questions 에 알린다
  const ids = new Set(list(parts).filter(p => !isRef(p)).map(p => p.id));
  const missing = new Set();
  const known = id => {
    const s = String(id ?? '');
    if (ids.has(s)) return true;
    if (s) missing.add(s);
    return false;
  };
  const remove = [...new Set(list(obj.remove).filter(known).map(String))];
  const move = [];
  for (const m of list(obj.move)) {
    if (!m || !known(m.id)) continue;
    const d = [m.dx, m.dy, m.dz];
    if (!d.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 3000) || d.every(v => v === 0)) continue;
    move.push({ id: String(m.id), dx: d[0], dy: d[1], dz: d[2] });
  }
  const rename = list(obj.rename)
    .filter(r => r && known(r.id) && cleanAiText(r.name))
    .map(r => ({ id: String(r.id), name: cleanAiText(r.name).slice(0, 40) }));
  const note = list(obj.note)
    .filter(n => n && known(n.id) && cleanAiText(n.note))
    .map(n => ({ id: String(n.id), note: cleanAiText(n.note).slice(0, 200) }));
  // 새 부품 (기존 부품 검사 그대로, 참고용 자재는 안 됨)
  const counts = {};
  const added = [];
  for (const p of list(obj.add).slice(0, 100)) {
    const part = normalizePart(p, counts);
    if (part && !isRef(part)) added.push(part);
    else dropped.add.push(short(p?.name) || '부품');
  }
  const add = added.slice(0, 30);
  // 통째로 다시 설계
  const rebuild = mode === 'rebuild' ? validateAIResult(obj.rebuild) : null;
  const questions = textLines(obj.questions, 3);
  const tell = (head, items) => {
    const uniq = [...new Set(items)].filter(Boolean);
    if (uniq.length) questions.push(`${head}: ${uniq.slice(0, 5).join(', ')}${uniq.length > 5 ? ' 등' : ''}`.slice(0, 200));
  };
  tell('목록에 없는 부품은 찾지 못해서 건너뛰었어요', [...missing].map(s => cleanAiText(s).slice(0, 30)));
  tell('넣지 못한 치수', dropped.params);
  tell('넣지 못한 자재', dropped.materials);
  tell('넣지 못한 부품', dropped.add);
  if (added.length > add.length) questions.push(`새 부품은 30개까지만 넣었어요 (${added.length - add.length}개 뺌)`);
  return {
    mode, params, adjusted, materials, remove, move, rename, note, add, rebuild,
    title: cleanAiText(obj.title).slice(0, 40),
    summary: textLines(obj.summary, 6),
    questions
  };
}

async function loadSdk() {
  const mod = await import(/* @vite-ignore */ SDK_URL);
  return mod.default || mod.Anthropic;
}

// API 오류를 쉬운 말로. 상태 번호, 오류 종류, 서버 문구를 본다 (한도 문구를 400·429 일반 문구보다 먼저)
export function friendlyError(err, Sdk = {}) {
  const is = name => typeof Sdk[name] === 'function' && err instanceof Sdk[name];
  const status = Number(err?.status) || (is('AuthenticationError') ? 401 : is('PermissionDeniedError') ? 403 : is('RateLimitError') ? 429 : 0);
  const body = err?.error?.error || {};
  const type = body.type || '';
  const text = `${body.message || ''} ${err?.message || ''}`;
  if (status === 401 || type === 'authentication_error') return '키가 맞지 않아요. 지웠거나 기한이 지난 키일 수 있어요. 설정에서 키를 다시 붙여 넣어 주세요.';
  if (status === 402 || type === 'billing_error' || /credit balance/i.test(text)) return '충전 잔액이 부족하거나 결제 정보에 문제가 있어요. 클로드 콘솔의 결제(Billing) 화면을 확인해 주세요.';
  if (/reached your (specified )?(workspace )?API usage limits/i.test(text) || body.details?.error_code === 'enforced_spend_limit_reached') return '이번 달 사용 한도에 닿았어요. 클로드 콘솔의 결제(Billing) 화면에서 한도를 올리거나, 다음 달에 다시 써 주세요.';
  if (status === 403 || type === 'permission_error') return '이 키로는 이 AI 모델을 쓸 수 없어요. 클로드 콘솔에서 키 권한을 확인해 주세요.';
  if (status === 404 || type === 'not_found_error') return 'AI 모델을 찾지 못했어요. 앱을 새 버전으로 바꿔야 할 수 있어요.';
  if (status === 413 || type === 'request_too_large') return '보낸 사진이 너무 커요. 사진 수를 줄여서 다시 해 주세요.';
  if (status === 429 || type === 'rate_limit_error') return '요청이 너무 많아요. 잠시 후 다시 해 주세요.';
  if (status === 529 || type === 'overloaded_error') return 'AI 서버가 지금 바빠요. 잠시 후 다시 해 주세요.';
  if (status >= 500) return 'AI 서버에 문제가 생겼어요. 잠시 후 다시 해 주세요.';
  if (is('APIConnectionError')) {
    return /timed? ?out/i.test(String(err.message)) ? '응답이 너무 오래 걸려서 끊겼어요. 잠시 후 다시 해 주세요.' : '인터넷 연결을 확인해 주세요.';
  }
  if (status === 400 || type === 'invalid_request_error') return `AI가 요청을 받지 않았어요: ${String(body.message || err.message || '').slice(0, 120)}`;
  return null;
}

// 공통 요청: 규칙(system), 보낼 내용(content), 응답 모양(schema), 답 검사(validate). 결과에 이번 요금(costKrw)을 붙인다
async function requestDesign({ system, content, schema, validate = validateAIResult }, apiKey, { sdk } = {}) {
  let Sdk;
  try {
    Sdk = sdk || await loadSdk();
  } catch {
    throw new Error('AI 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  // 서버가 바쁠 때 다시 시도는 한 번만 (기본값은 두 번). 긴 답이 중간에 끊기면 돈만 나가므로 10분까지 기다린다
  const client = new Sdk({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 600000 });
  let res;
  try {
    res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content }]
    });
  } catch (err) {
    throw new Error(friendlyError(err, Sdk) || `AI 요청 중 문제가 생겼어요: ${err.message}`);
  }
  // 응답이 왔으면 요금이 나간 것이라, 실패해도 금액을 같이 알려 준다
  const cost = costKrw(res.usage, res.model || AI_MODEL);
  const fail = msg => Object.assign(new Error(msg), { costKrw: cost });
  if (res.stop_reason === 'refusal') throw fail('AI가 이 요청은 거절했어요. 표현을 바꿔서 다시 해 주세요.');
  if (res.stop_reason === 'max_tokens') throw fail('설계가 너무 커서 중간에 끊겼어요. 부품 수를 줄여서 다시 해 주세요.');
  const textBlock = (res.content || []).find(b => b.type === 'text');
  let obj;
  try {
    obj = JSON.parse(textBlock?.text ?? '');
  } catch {
    throw fail('AI 응답 형식이 맞지 않아요. 다시 시도해 주세요.');
  }
  let result;
  try {
    result = validate(obj);
  } catch (e) {
    throw fail(e.message);
  }
  return { ...result, costKrw: cost };
}

export async function designWithAI(text, apiKey, opts = {}) {
  if (!apiKey) throw new Error('설정에서 API 키를 먼저 넣어 주세요.');
  if (!String(text || '').trim()) throw new Error('만들고 싶은 것을 먼저 적어 주세요.');
  return requestDesign({ system: textSystemPrompt(), content: String(text), schema: DESIGN_SCHEMA }, apiKey, opts);
}

// images: [{ base64, mediaType }], options: { source, dims, memo, prefer, previous, correction }
export async function designFromImages(images, options, apiKey, opts = {}) {
  if (!apiKey) throw new Error('설정에서 API 키를 먼저 넣어 주세요.');
  if (!Array.isArray(images) || !images.length) throw new Error('사진이나 영상 장면을 한 장 이상 넣어 주세요.');
  return requestDesign({ system: visionSystemPrompt(), content: buildVisionContent(images, options || {}), schema: VISION_SCHEMA }, apiKey, opts);
}

// 지금 열린 설계를 말대로 고친다 (템플릿·설계 id 는 그대로, 큰 변경이면 mode 'rebuild').
// ctx = { design, template, parts(지금 부품), applied(무료 규칙이 방금 먼저 고친 줄) }
export async function editWithAI(text, ctx = {}, apiKey, opts = {}) {
  if (!apiKey) throw new Error('설정에서 API 키를 먼저 넣어 주세요.');
  const said = String(text ?? '').trim();
  if (!said) throw new Error('고칠 점을 먼저 적어 주세요.');
  if (!ctx?.design) throw new Error('고칠 설계가 없어요.');
  const content = [`지금 설계를 이렇게 고쳐 주세요: ${said.slice(0, 1000)}`];
  const applied = list(ctx.applied).map(String).filter(Boolean);
  if (applied.length) {
    content.push('(참고: 무료 규칙이 방금 아래처럼 먼저 고쳤고, 규칙에 적힌 지금 설계는 이것이 반영된 상태예요. 같은 것을 또 하지 말고, 사용자의 말과 다르게 고쳐진 것이 있으면 바로잡아 주세요.)');
    content.push(...applied.map(l => `- ${l}`));
  }
  return requestDesign({
    system: editSystemPrompt(ctx.template, ctx.design, ctx.parts),
    content: content.join('\n'),
    schema: EDIT_SCHEMA,
    validate: obj => validateEditResult(obj, ctx)
  }, apiKey, opts);
}

// 키에 섞인 빈칸·줄바꿈을 지운다 (복사할 때 자주 섞임)
export const cleanKey = raw => String(raw ?? '').replace(/\s+/g, '');

// 키 확인: 아주 짧은 답(16토큰)만 받는 요청으로 키, 모델 권한, 충전 잔액을 한 번에 본다 (약 0.5원)
export async function checkApiKey(rawKey, { sdk } = {}) {
  const key = cleanKey(rawKey);
  if (!key) return { ok: false, message: '키를 먼저 붙여 넣어 주세요.' };
  if (!key.startsWith('sk-ant-')) return { ok: false, message: '클로드 키는 sk-ant- 로 시작해요. 복사가 덜 됐는지 확인해 주세요.' };
  let Sdk;
  try {
    Sdk = sdk || await loadSdk();
  } catch {
    return { ok: false, message: 'AI 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' };
  }
  const client = new Sdk({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 });
  try {
    await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: '확인' }]
    });
    return { ok: true, message: '키가 맞아요. 지금 바로 쓸 수 있어요. 아래 저장을 눌러 주세요.' };
  } catch (err) {
    return { ok: false, message: friendlyError(err, Sdk) || `확인 중 문제가 생겼어요: ${err.message}` };
  }
}

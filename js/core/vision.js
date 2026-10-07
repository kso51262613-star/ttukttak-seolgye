// 사진·영상으로 설계: 화면을 모르는 계산 부분 (노드로 검사)
import { getTemplate } from './templates/index.js';
import { newDesign, bounds, clampParams } from './model.js';

export const MAX_PHOTOS = 6;
export const MAX_FRAMES = 10;
export const AUTO_FRAMES = 8;
export const PHOTO_EDGE = 1024;
export const FRAME_EDGE = 768;
export const THUMB_EDGE = 200;
export const MAX_REF_IMAGES = 4;

export const PREFER_LABELS = { auto: '자동', wood: '나무 위주', metal: '철 위주', mixed: '나무와 철 섞어서' };

const round2 = v => Math.round(v * 100) / 100;

// 영상 길이의 5%~95% 사이를 고르게 n 장 (앞뒤 검은 화면·자막 피하기)
export function pickFrameTimes(duration, n = AUTO_FRAMES) {
  if (!Number.isFinite(duration) || duration <= 0 || !(n > 0)) return [];
  if (n === 1) return [round2(duration / 2)];
  const start = duration * 0.05;
  const end = duration * 0.95;
  return Array.from({ length: n }, (_, i) => round2(start + ((end - start) * i) / (n - 1)));
}

export function fitSize(w, h, maxEdge) {
  if (!(w > 0 && h > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

const DIM_LABELS = [['width', '폭'], ['depth', '깊이'], ['height', '높이']];

function compactPrevious(prev) {
  return {
    title: prev.title,
    analysis: prev.analysis,
    parts: (prev.parts || []).map(p => ({ name: p.name, material: p.material, size: p.size, pos: p.pos, note: p.note || '', shape: p.shape || 'box', wall: p.wall || 0 }))
  };
}

// images: [{ base64, mediaType }] → Messages API 의 user content (그림 먼저, 안내 글 마지막)
export function buildVisionContent(images, opts = {}) {
  const list = (images || []).slice(0, MAX_FRAMES);
  const blocks = list.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 }
  }));
  const n = list.length;
  const lines = [];
  lines.push(opts.source === 'video'
    ? `위 그림 ${n}장은 한 영상에서 뽑은 장면이에요. 영상에 나오는 물건(작품)을 비슷하게 만들 수 있게 설계해 주세요. 만드는 과정이 보이면 그것도 참고하세요.`
    : `위 사진 ${n}장은 같은 물건을 여러 각도에서 찍은 거예요. 이 물건과 구조가 같은 작품을 만들 수 있게 설계해 주세요.`);
  const dims = DIM_LABELS
    .filter(([k]) => Number.isFinite(Number(opts.dims?.[k])) && Number(opts.dims[k]) > 0)
    .map(([k, label]) => `${label} ${Math.round(Number(opts.dims[k]))}mm`);
  const fixing = !!(opts.previous && String(opts.correction || '').trim());
  lines.push(dims.length
    ? `알고 있는 전체 치수 (반드시 맞출 것${fixing ? ', 단 아래 고쳐 달라는 점과 다르면 고쳐 달라는 점을 따를 것' : ''}): ${dims.join(', ')}`
    : '알려준 치수가 없어요. 크기 단서와 흔한 크기로 추정하고 근거를 assumptions 에 적어 주세요.');
  if (opts.prefer && opts.prefer !== 'auto' && PREFER_LABELS[opts.prefer]) lines.push(`재료: ${PREFER_LABELS[opts.prefer]}로 만들어 주세요.`);
  const memo = String(opts.memo || '').trim().slice(0, 500);
  if (memo) lines.push(`사용자 메모: ${memo}`);
  if (fixing) {
    lines.push(`이전에 만든 설계(JSON): ${JSON.stringify(compactPrevious(opts.previous))}`);
    lines.push(`사용자가 고쳐 달라는 점: ${String(opts.correction).trim().slice(0, 500)}`);
    lines.push('고쳐 달라는 점이 가장 우선이에요. 이전 설계를 바탕으로 고칠 점을 반영해서 전체 설계를 다시 만들어 주세요.');
  }
  return [...blocks, { type: 'text', text: lines.join('\n') }];
}

const REF_IMAGE_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
export function cleanRefImages(list) {
  return (Array.isArray(list) ? list : [])
    .filter(s => typeof s === 'string' && s.length < 60000 && REF_IMAGE_RE.test(s))
    .slice(0, MAX_REF_IMAGES);
}

// 검사를 마친 AI 결과 → 새 작업 (빈 작업 템플릿에 부품을 넣는다)
export function designFromVision(result, { refImages = [], source = 'photo' } = {}) {
  const d = newDesign('custom');
  Object.assign(d, {
    title: result.title || 'AI 설계',
    extraParts: result.parts || [],
    aiSteps: result.steps || [],
    aiHardware: result.hardware || [],
    aiAnalysis: result.analysis || '',
    aiAssumptions: result.assumptions || [],
    similarTemplate: result.similarTemplate && result.similarTemplate !== 'none' && getTemplate(result.similarTemplate)
      ? result.similarTemplate : null,
    refImages: cleanRefImages(refImages),
    source: source === 'video' ? 'video' : 'photo'
  });
  return d;
}

// 비슷한 템플릿으로 열기: AI 부품의 전체 크기를 폭·깊이·높이로 넘긴다
export function templateDesignFrom(templateId, parts) {
  const t = getTemplate(templateId);
  if (!t || t.id === 'custom') return null;
  const d = newDesign(templateId);
  // 바퀴는 몸체 크기에서 뺀다 (모서리 밖으로 조금 나올 수 있음)
  const b = bounds((parts || []).filter(p => p.shape !== 'wheel' && p.shape !== 'caster'));
  const hint = { width: b.size[0], depth: b.size[2], height: b.size[1] };
  // 치수가 안쪽 크기인 템플릿은 전체 크기를 자기 치수로 바꾸는 방법(fromOverall)을 가진다
  const mapped = t.fromOverall ? t.fromOverall(hint) : hint;
  for (const [k, v] of Object.entries(mapped)) {
    if (v > 0 && t.params.some(p => p.key === k)) d.params[k] = v;
  }
  if (t.fromHints && hint.height > 0) Object.assign(d.params, t.fromHints({ height: hint.height }));
  d.params = clampParams(t, d.params).params;
  return d;
}

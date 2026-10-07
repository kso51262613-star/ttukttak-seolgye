import { WOOD_TEMPLATES } from './wood.js';
import { METAL_TEMPLATES } from './metal.js';
import { FIRE_TEMPLATES } from './fire.js';
import { OUTDOOR_TEMPLATES } from './outdoor.js';
import { SAFETY_BASE } from './helpers.js';

export const CATEGORIES = {
  wood: '목공 가구',
  metal: '철공 가구',
  fire: '화로·캠핑',
  outdoor: '정원·야외',
  custom: '직접 설계'
};

// 템플릿 없이 부품을 직접 넣거나 AI가 만든 부품을 담는 빈 작업
export const customTemplate = {
  id: 'custom', name: '빈 작업 (직접·AI 설계)', category: 'custom', trend: false, difficulty: 2, laborHours: 4,
  summary: '부품을 직접 추가하거나 AI가 만든 부품으로 시작해요.',
  keywords: [],
  params: [],
  materialOptions: {},
  build: () => [],
  hardware: () => [],
  tools: ['줄자', '직각자', '연필'],
  safety: SAFETY_BASE,
  steps: () => [
    '재단표대로 자재를 자릅니다.',
    '도면을 보며 큰 틀부터 조립하고, 직각을 확인합니다.',
    '나머지 부품을 붙이고 표면을 다듬어 마감합니다.'
  ]
};

export const TEMPLATES = [...WOOD_TEMPLATES, ...METAL_TEMPLATES, ...FIRE_TEMPLATES, ...OUTDOOR_TEMPLATES, customTemplate];

const byId = new Map(TEMPLATES.map(t => [t.id, t]));
export function getTemplate(id) {
  return byId.get(id) || null;
}

// 당근 수제품 시세 (2026-10 조사, 추정값. 실제 매물로 다시 확인할 것)
export const MARKET_PRICES = {
  'wood-bench': '3~8만원',
  'slat-tv-stand': '15~35만원',
  'wood-stool': '2~5만원',
  'wood-shelf': '3~7만원',
  workbench: '8~15만원',
  'metal-shelf': '8~20만원',
  'metal-table': '15~40만원',
  'shoe-bench': '5~12만원',
  'metal-side-table': '3~7만원',
  'fire-plate': '5~12만원',
  'drum-fire-pit': '7~15만원',
  'camp-table': '5~12만원',
  'fire-table': '15~30만원',
  'raised-bed': '4~10만원',
  'firewood-rack': '4~10만원'
};

// 당근 수제품 시세를 아직 못 구한 템플릿의 참고 문구
export const MARKET_NOTES = {
  'lift-top-table': '당근 수제품 시세는 아직 조사 전이에요. 참고로 새 리프트업 테이블 판매가는 약 6.4만~38만 원이에요 (2026-10 다나와·오늘의집 검색).'
};

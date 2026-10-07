// AI 에게 주는 규칙과 응답 모양(스키마). 앱(ai.js)과 대화 길 도구가 같이 쓴다.
import { MATERIALS } from './materials.js';
import { TEMPLATES } from './templates/index.js';

export const MATERIAL_KEYS = Object.keys(MATERIALS);
export const TEMPLATE_IDS = TEMPLATES.filter(t => t.id !== 'custom').map(t => t.id);

export const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'parts', 'steps', 'hardware'],
  properties: {
    title: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'material', 'size', 'pos', 'note'],
        properties: {
          name: { type: 'string' },
          material: { type: 'string', enum: MATERIAL_KEYS },
          size: { type: 'array', items: { type: 'number' } },
          pos: { type: 'array', items: { type: 'number' } },
          note: { type: 'string' }
        }
      }
    },
    steps: { type: 'array', items: { type: 'string' } },
    hardware: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'qty', 'unit'],
        properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' } }
      }
    }
  }
};

// 사진·영상 분석은 위 모양에 "본 것 설명, 추정한 것, 비슷한 템플릿" 을 더한다
export const VISION_SCHEMA = {
  ...DESIGN_SCHEMA,
  required: [...DESIGN_SCHEMA.required, 'analysis', 'assumptions', 'similarTemplate'],
  properties: {
    ...DESIGN_SCHEMA.properties,
    analysis: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    similarTemplate: { type: 'string', enum: [...TEMPLATE_IDS, 'none'] }
  }
};

export function materialGuide() {
  return MATERIAL_KEYS.map(k => {
    const m = MATERIALS[k];
    let dim;
    if (m.profile === 'round') dim = `둥근 단면 지름 ${m.section[0]}mm, 원장 길이 ${m.stock}mm`;
    else if (m.profile === 'angle') dim = `ㄱ자 단면 ${m.section[0]}x${m.section[1]}mm 두께 ${m.thickness}mm, 원장 길이 ${m.stock}mm`;
    else if (m.section) dim = `단면 ${m.section[0]}x${m.section[1]}mm, 원장 길이 ${m.stock}mm`;
    else if (m.thickness) dim = `두께 ${m.thickness}mm, 원장 ${m.stock[0]}x${m.stock[1]}mm`;
    else dim = '통째로 사용(지름 580mm, 높이 880mm)';
    return `- ${k}: ${m.name} (${dim})`;
  }).join('\n');
}

const RULES = [
  '좌표 규칙: 단위 mm. size = [x 폭, y 높이, z 깊이] 부품의 바깥 크기. pos = 부품 중심 좌표. y는 위쪽, 바닥은 y=0, 작품 중심은 x=0, z=0. 정면은 +z 쪽입니다.',
  '각재·파이프는 단면 크기를 그대로 쓰고 긴 방향만 길이로 둡니다. 둥근 자재(원형 파이프, 환봉, 둥근 봉)는 size 의 짧은 두 값을 지름과 같게 둡니다. 판재는 두께를 그대로 씁니다.',
  '부품은 회전 없이 x, y, z 축과 나란하게만 둡니다. 비스듬한 부품은 가장 가까운 축 방향으로 근사합니다.',
  '부품끼리 실제로 맞닿게 배치하고, 원장보다 긴 부품은 피하세요.',
  'steps는 한국어 제작 순서 4~8단계, 쉬운 말로. 안전 주의(보안경, 화로는 실내 금지, 아연도금 자재 가열 금지)를 필요한 곳에 넣으세요.',
  'hardware는 피스·볼트·경첩 같은 부속만 넣습니다. note는 따내기, 각도 재단 같은 가공 메모(없으면 빈 문자열).',
  'title은 작품 이름을 짧게.'
];

export function textSystemPrompt() {
  return [
    '당신은 한국의 DIY 목공·철공 설계 도우미입니다. 사용자가 말로 설명한 작품을 실제로 만들 수 있는 부품 목록으로 바꿉니다.',
    ...RULES,
    '아래 자재 키만 쓰세요:',
    materialGuide()
  ].join('\n');
}

export function visionSystemPrompt() {
  const templates = TEMPLATES.filter(t => t.id !== 'custom').map(t => `- ${t.id}: ${t.name} (${t.summary})`).join('\n');
  return [
    '당신은 한국의 DIY 목공·철공 설계 도우미입니다. 사용자가 보낸 사진이나 영상 장면 속 물건의 구조를 파악해서, 사용자가 직접 만들 수 있는 부품 목록으로 바꿉니다.',
    '완전히 똑같을 필요는 없지만 구조(부품 수, 배치, 결합 방식)는 최대한 같게 만듭니다.',
    '그림들은 같은 물건을 여러 각도나 여러 장면에서 본 것입니다. 보이지 않는 면은 같은 종류 물건의 흔한 구조로 추정합니다.',
    '크기 단서를 찾으세요: 사진 속 글자(치수 자막, 줄자 눈금), 기준 물건(A4 용지 297x210mm, 신용카드 86x54mm, 500ml 생수병 높이 약 210mm, 문 높이 약 2000mm, 의자 앉는 높이 약 450mm, 식탁 높이 약 740mm).',
    '사용자가 알려준 치수는 반드시 그대로 맞춥니다. 단, 사용자가 고쳐 달라고 한 점이 있으면 그것이 가장 우선입니다. 알려주지 않은 치수는 단서와 흔한 크기로 추정하고, 무엇을 근거로 추정했는지 assumptions 에 짧게 적습니다.',
    '자재는 보이는 재질에 가장 가까운 것으로 고릅니다. 철은 각파이프, 원형 파이프, 평철, 앵글, 환봉, 철판 중에서, 나무는 구조목, 방부목, 집성목, 합판, MDF, 둥근 봉 중에서 고릅니다.',
    'analysis: 어떤 물건이고 어떤 부품으로 이뤄졌는지, 어떻게 결합된 것 같은지 3~5문장. 쉬운 한국어.',
    'assumptions: 추정한 것 2~6개 (치수 근거, 안 보여서 짐작한 구조, 재질 추정).',
    'similarTemplate: 아래 템플릿 중 구조가 거의 같은 것이 있으면 그 id, 없으면 none.',
    templates,
    ...RULES,
    '아래 자재 키만 쓰세요:',
    materialGuide()
  ].join('\n');
}

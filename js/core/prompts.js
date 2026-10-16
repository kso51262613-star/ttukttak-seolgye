// AI 에게 주는 규칙과 응답 모양(스키마). 앱(ai.js)과 대화 길 도구가 같이 쓴다.
import { MATERIALS } from './materials.js';
import { TEMPLATES } from './templates/index.js';

// 참고용 자재는 AI 가 고르지 못하게 뺀다
export const MATERIAL_KEYS = Object.keys(MATERIALS).filter(k => MATERIALS[k].kind !== 'ref');
export const TEMPLATE_IDS = TEMPLATES.filter(t => t.id !== 'custom').map(t => t.id);

// 템플릿 자재 칸의 한글 이름 (오른쪽 패널, 고치기 줄, AI 고치기 규칙에서 같이 쓴다)
export const SLOT_LABELS = {
  frame: '틀', top: '상판', board: '선반 판', body: '몸통 판', slat: '살', leg: '다리',
  apron: '띠장', post: '기둥', plate: '철판', body_drum: '몸통',
  panel: '옆판', bottom: '수납칸 바닥', strap: '받침', shelf: '장작 선반',
  hub: '연결쇠', inner: '다리 속대', keeper: '덮개 키퍼·볼트 탭', lip: '덮개 윗날', ref: '참고용'
};
export const slotLabel = slot => (typeof slot === 'string' && Object.hasOwn(SLOT_LABELS, slot) ? SLOT_LABELS[slot] : String(slot ?? ''));

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
        required: ['name', 'material', 'size', 'pos', 'note', 'shape', 'wall'],
        properties: {
          name: { type: 'string' },
          material: { type: 'string', enum: MATERIAL_KEYS },
          size: { type: 'array', items: { type: 'number' } },
          pos: { type: 'array', items: { type: 'number' } },
          note: { type: 'string' },
          shape: { type: 'string', enum: ['box', 'barrel', 'wheel', 'cylinder'] },
          wall: { type: 'number' }
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

// "이 설계 고치기" AI 답 모양: 지금 설계에 대한 고치기 목록. 쓰지 않는 칸은 빈 값.
// mode 'rebuild' 는 템플릿으로 안 되는 큰 변경일 때 전체 설계(DESIGN_SCHEMA 모양)를 rebuild 에 담는다
const strictObject = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const EDIT_SCHEMA = strictObject({
  mode: { type: 'string', enum: ['edit', 'rebuild'] },
  params: { type: 'array', items: strictObject({ key: { type: 'string' }, value: { type: 'number' } }) },
  materials: { type: 'array', items: strictObject({ slot: { type: 'string' }, material: { type: 'string', enum: MATERIAL_KEYS } }) },
  remove: { type: 'array', items: { type: 'string' } },
  move: { type: 'array', items: strictObject({ id: { type: 'string' }, dx: { type: 'number' }, dy: { type: 'number' }, dz: { type: 'number' } }) },
  rename: { type: 'array', items: strictObject({ id: { type: 'string' }, name: { type: 'string' } }) },
  note: { type: 'array', items: strictObject({ id: { type: 'string' }, note: { type: 'string' } }) },
  add: { type: 'array', items: DESIGN_SCHEMA.properties.parts.items },
  rebuild: DESIGN_SCHEMA,
  title: { type: 'string' },
  summary: { type: 'array', items: { type: 'string' } },
  questions: { type: 'array', items: { type: 'string' } }
});

export function materialGuide() {
  return MATERIAL_KEYS.map(k => {
    const m = MATERIALS[k];
    let dim;
    if (m.kind === 'masonry') dim = `벽돌 ${m.brick.join('x')}mm. 쌓은 덩어리(벽·바닥·아치) 하나를 부품 하나로, 장 수는 부피로 계산`;
    else if (m.kind === 'cast') dim = '콘크리트·미장. 부피로 포대 수 계산';
    else if (m.kind === 'wrap') dim = `단열 담요 한 겹 ${m.layer}mm (두께 = 겹 수 x ${m.layer})`;
    else if (m.kind === 'item') dim = m.desc || '완제품 1개';
    else if (m.profile === 'round') dim = `둥근 단면 지름 ${m.section[0]}mm, 원장 길이 ${m.stock}mm`;
    else if (m.profile === 'angle') dim = `ㄱ자 단면 ${m.section[0]}x${m.section[1]}mm 두께 ${m.thickness}mm, 원장 길이 ${m.stock}mm`;
    else if (m.section) dim = `단면 ${m.section[0]}x${m.section[1]}mm, 원장 길이 ${m.stock}mm`;
    else dim = `두께 ${m.thickness}mm, 원장 ${m.stock[0]}x${m.stock[1]}mm`;
    return `- ${k}: ${m.name} (${dim})`;
  }).join('\n');
}

const RULES = [
  '좌표 규칙: 단위 mm. size = [x 폭, y 높이, z 깊이] 부품의 바깥 크기. pos = 부품 중심 좌표. y는 위쪽, 바닥은 y=0, 작품 중심은 x=0, z=0. 정면은 +z 쪽입니다.',
  '각재·파이프는 단면 크기를 그대로 쓰고 긴 방향만 길이로 둡니다. 둥근 자재(원형 파이프, 환봉, 둥근 봉)는 size 의 짧은 두 값을 지름과 같게 둡니다. 판재는 두께를 그대로 씁니다.',
  '부품은 회전 없이 x, y, z 축과 나란하게만 둡니다. 비스듬한 부품은 가장 가까운 축 방향으로 근사합니다.',
  "shape 는 보통 'box'. 반원 아치(화덕 지붕 등)는 'barrel': size = [바깥 폭, 바깥 폭/2, 깊이(z)], 평평한 면이 아래, wall = 아치 두께(꽉 찬 반원판이면 0). 바퀴는 'wheel': size = [폭, 지름, 지름]. 드럼통은 'cylinder'. barrel 이 아니면 wall 은 0.",
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

// "이 설계 고치기" 규칙: 지금 설계의 치수 칸, 고를 수 있는 자재 칸, 부품 목록(참고용 제외)을 보여 주고
// 새로 만들지 말고 고치기 목록(EDIT_SCHEMA)으로 답하게 한다
export function editSystemPrompt(template, design = {}, parts = []) {
  const t = template && template.id !== 'custom' ? template : null;
  const params = t?.params || [];
  const cur = design?.params || {};
  const chosen = design?.materials || {};
  const slots = Object.entries(t?.materialOptions || {}).filter(([, o]) => o.length > 1);
  const r = v => Math.round(Number(v) * 10) / 10;
  const vec = a => `[${(Array.isArray(a) ? a : []).map(r).join(', ')}]`;
  const real = (Array.isArray(parts) ? parts : []).filter(p => MATERIALS[p?.material] && MATERIALS[p.material].kind !== 'ref');
  return [
    '당신은 한국의 DIY 목공·철공 설계 도우미입니다. 지금 열린 설계를 사용자의 말대로 고칩니다. 새로 만들지 말고 아래 고치기 목록(JSON)으로 답합니다.',
    t ? `작품: ${t.name} (${t.summary})` : '작품: 직접 설계 (템플릿 없음, 치수 슬라이더 없음. 부품 고치기로만 바꿉니다)',
    `지금 이름: ${design?.title || ''}`,
    params.length ? '치수 칸 (params 로 바꿈. key: 이름 (최소~최대 단위, step, 지금 값)):' : '치수 칸: 없음',
    ...params.map(p => `- ${p.key}: ${p.label} (${p.min}~${p.max}${p.unit}, step ${p.step}, 지금 ${cur[p.key] ?? p.default})`),
    slots.length ? '자재 칸 (materials 로 바꿈. slot(이름): 고를 수 있는 자재 키 (지금 키)):' : '바꿀 수 있는 자재 칸: 없음',
    ...slots.map(([s, o]) => `- ${s}(${slotLabel(s)}): ${o.join(', ')} (지금 ${o.includes(chosen[s]) ? chosen[s] : o[0]})`),
    '부품 목록 (id | 이름 | 자재 키 | size [x, y, z] | pos [x, y, z]). extra 는 직접 또는 AI 로 추가한 부품이에요:',
    ...(real.length ? real.map(p => `- ${p.id} | ${p.name} | ${p.material} | size ${vec(p.size)} | pos ${vec(p.pos)}${p.rot ? ` | rot ${vec(p.rot)}` : ''}${p.extra ? ' | extra' : ''}`) : ['- (부품 없음)']),
    '고치는 규칙:',
    '- 치수나 자재로 되는 것은 params, materials 로 고칩니다. 치수는 범위 안에서 step 에 맞춥니다. 치수를 바꾸면 템플릿 부품의 크기와 자리는 앱이 다시 계산합니다.',
    '- 부품 하나하나를 바꿀 때: remove (뺄 부품 id), move (id 와 옮길 거리 dx, dy, dz, 단위 mm), rename (id, 새 이름), note (id, 가공 메모), add (새 부품).',
    '- id 는 위 부품 목록에 있는 것만 씁니다. 목록에 없는 부품은 고칠 수 없습니다.',
    '- 단 수처럼 부품 개수가 바뀌는 치수를 바꿀 때는 같은 답에서 그 부품들의 remove, move 를 쓰지 않습니다 (부품 id 가 달라질 수 있어요).',
    '- add 부품은 아래 설계 규칙(좌표, 자재 키)을 따르고 이웃 부품과 실제로 맞닿게 놓습니다.',
    "- 템플릿으로는 도저히 안 되는 큰 변경(구조가 완전히 다른 작품)일 때만 mode 를 'rebuild' 로 하고 rebuild 에 전체 설계(title, parts, steps, hardware)를 넣은 뒤 summary 첫 줄에 이유를 적습니다. 그 밖에는 mode 'edit' 이고 rebuild 는 빈 값(title '', parts [], steps [], hardware [])입니다.",
    "- title: 작품 이름을 바꿀 때만 새 이름, 아니면 ''.",
    '- summary: 무엇을 고쳤는지 쉬운 한국어 1~6줄. questions: 하지 못한 것이나 사용자가 확인할 것 0~3줄. 쓰지 않는 칸은 빈 배열로 둡니다.',
    '- 글에는 줄표(대시)나 화살표 기호를 쓰지 말고 "폭 1200 에서 1500 으로" 처럼 씁니다.',
    'add 와 rebuild 에 쓰는 설계 규칙 (rebuild 의 title, steps, hardware 포함):',
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
    '자재는 보이는 재질에 가장 가까운 것으로 고릅니다. 철은 각파이프, 원형 파이프, 평철, 앵글, 환봉, 철판 중에서, 나무는 구조목, 방부목, 집성목, 합판, MDF, 둥근 봉 중에서, 벽돌·콘크리트는 적벽돌, 내화벽돌(불이 닿는 곳은 반드시 내화벽돌), 바닥용 레미탈, 미장용 레미탈, 세라믹 단열 담요 중에서 고릅니다.',
    'analysis: 어떤 물건이고 어떤 부품으로 이뤄졌는지, 어떻게 결합된 것 같은지 3~5문장. 쉬운 한국어.',
    'assumptions: 추정한 것 2~6개 (치수 근거, 안 보여서 짐작한 구조, 재질 추정).',
    'similarTemplate: 아래 템플릿 중 구조가 거의 같은 것이 있으면 그 id, 없으면 none.',
    templates,
    ...RULES,
    '아래 자재 키만 쓰세요:',
    materialGuide()
  ].join('\n');
}

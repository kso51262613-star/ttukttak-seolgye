import { builder, sec, thick, spread, SAFETY_BASE, SAFETY_METAL } from './helpers.js';
import { MATERIALS } from '../materials.js';

export const METAL_TOOLS = ['줄자', '직각자석(용접 자석)', '금긋기 펜', '그라인더(절단석·연마석·플랩디스크)', '용접기', '용접 클램프', '전동 드릴'];
export const METAL_SAFETY = [...SAFETY_BASE, ...SAFETY_METAL];

const rod = { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 };
// 고른 틀 자재 크기에 맞는 마감캡
const caps = parts => {
  const tube = parts.find(p => MATERIALS[p.material]?.kind === 'tube');
  const s = tube ? MATERIALS[tube.material].section[0] : 25;
  return { name: `각파이프 마감캡 ${s}x${s}`, qty: 4, unit: '개', price: 300 };
};
const feet = { name: '수평 조절발', qty: 4, unit: '개', price: 1500 };
const woodScrews = qty => ({ name: '판 고정 피스(철재용 트러스)', qty, unit: '개', price: 30 });

// 사각 틀 하나 (앞뒤·좌우 가로대)
function ring(b, mat, W, D, s, y, label) {
  for (const sz of [-1, 1]) b.add(`${label} 앞뒤`, mat, [W - 2 * s, s, s], [0, y, sz * (D / 2 - s / 2)]);
  for (const sx of [-1, 1]) b.add(`${label} 좌우`, mat, [s, s, D - 2 * s], [sx * (W / 2 - s / 2), y, 0]);
}
function posts(b, mat, W, D, s, h) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('기둥', mat, [s, h, s], [sx * (W / 2 - s / 2), h / 2, sz * (D / 2 - s / 2)]);
}

export const metalShelf = {
  id: 'metal-shelf', name: '철제 + 원목 오픈 선반', category: 'metal', trend: true, difficulty: 2, laborHours: 8,
  summary: '각파이프 틀에 나무 판을 얹는 인더스트리얼 선반. 꾸준히 찾는 사람이 많아요.',
  keywords: ['선반', '철제선반', '인더스트리얼', '책장', '진열대', '수납선반', '앵글'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 500, max: 1500, step: 10, default: 900 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 250, max: 600, step: 10, default: 350 },
    { key: 'height', label: '높이', unit: 'mm', min: 800, max: 2000, step: 10, default: 1800 },
    { key: 'tiers', label: '단 수', unit: '단', min: 2, max: 7, step: 1, default: 5 }
  ],
  materialOptions: { frame: ['sq_tube_25', 'sq_tube_20', 'sq_tube_30'], board: ['pine_board_18', 'birch_ply_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const T = thick(m.board);
    const { width: W, depth: D, height: H, tiers } = p;
    posts(b, m.frame, W, D, s, H);
    const ys = spread(tiers, 150, H - s / 2);
    ys.forEach((y, i) => {
      ring(b, m.frame, W, D, s, y, `${i + 1}단 가로대`);
      const last = i === ys.length - 1;
      b.add('선반 판', m.board, [W, T, last ? D : D - 2 * s], [0, y + s / 2 + T / 2, 0]);
    });
    return b.parts;
  },
  hardware: (parts, p) => [rod, caps(parts), feet, woodScrews(p.tiers * 4)],
  tools: METAL_TOOLS, safety: METAL_SAFETY,
  steps: p => [
    `각파이프를 재단표대로 자릅니다. 기둥 ${p.height}mm 4개.`,
    '절단면 거스러미를 그라인더 플랩디스크로 갈아냅니다.',
    '평평한 바닥에서 직각자석으로 고정하고 옆면 사다리 2개를 먼저 용접합니다(점용접 후 직각 확인, 본용접).',
    `두 사다리를 앞뒤 가로대로 연결합니다. ${p.tiers}단 모두 같은 높이인지 수평계로 확인합니다.`,
    '용접 자국을 갈아내고 탈지 후 락카 또는 분체도장으로 마감합니다.',
    '판재를 올리고 아래에서 피스로 고정, 기둥 아래 수평 조절발을 끼웁니다.'
  ]
};

export const metalTable = {
  id: 'metal-table', name: '철제 다리 원목 식탁 / 책상', category: 'metal', trend: true, difficulty: 2, laborHours: 8,
  summary: 'ㅁ자 철제 다리 위에 두꺼운 원목 상판. 상판만 바꾸면 책상도 돼요.',
  keywords: ['식탁', '테이블', '책상', '탁자', '원목테이블', '철제테이블', '다이닝'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 900, max: 2000, step: 10, default: 1400 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 500, max: 1000, step: 10, default: 700 },
    { key: 'height', label: '높이', unit: 'mm', min: 650, max: 780, step: 5, default: 740 }
  ],
  materialOptions: { frame: ['sq_tube_40', 'sq_tube_30'], top: ['pine_board_24', 'pine_board_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const fh = H - T;
    const fx = W / 2 - 100 - s / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) b.add('다리 기둥', m.frame, [s, fh - 2 * s, s], [sx * fx, s + (fh - 2 * s) / 2, sz * (D / 2 - 60 - s / 2)]);
      b.add('다리 윗대', m.frame, [s, s, D - 120], [sx * fx, fh - s / 2, 0]);
      b.add('다리 발대', m.frame, [s, s, D - 120], [sx * fx, s / 2, 0]);
    }
    b.add('연결대', m.frame, [2 * fx - s, s, s], [0, fh - s / 2, 0]);
    b.add('상판', m.top, [W, T, D], [0, H - T / 2, 0]);
    return b.parts;
  },
  hardware: parts => [rod, caps(parts), { name: '바닥 보호 패드', qty: 4, unit: '개', price: 500 }, woodScrews(10)],
  tools: METAL_TOOLS, safety: METAL_SAFETY,
  steps: p => [
    `상판 ${p.width}x${p.depth}mm를 준비합니다(목재소 재단 추천).`,
    '각파이프를 재단하고 거스러미를 갈아냅니다.',
    'ㅁ자 다리 2개를 직각자석으로 잡고 용접합니다. 두 다리를 겹쳐서 크기가 같은지 확인합니다.',
    '두 다리를 연결대로 이어 용접합니다.',
    '용접 자국 정리, 탈지, 도장 후 충분히 말립니다.',
    '상판을 뒤집어 놓고 다리를 올려 피스로 고정합니다. 상판은 오일 또는 우레탄 바니쉬로 마감합니다.'
  ]
};

export const shoeBench = {
  id: 'shoe-bench', name: '철제 신발장 벤치', category: 'metal', trend: false, difficulty: 2, laborHours: 5,
  summary: '앉아서 신발 신고, 아래엔 신발을 두는 현관 벤치. 좁은 현관에 잘 맞아요.',
  keywords: ['신발장', '신발', '현관벤치', '신발벤치', '현관의자', '신발선반'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 600, max: 1200, step: 10, default: 900 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 280, max: 400, step: 10, default: 320 },
    { key: 'height', label: '높이', unit: 'mm', min: 400, max: 500, step: 10, default: 450 }
  ],
  materialOptions: { frame: ['sq_tube_25', 'sq_tube_20'], slat: ['spf_1x4'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const [st, sw] = sec(m.slat);
    const { width: W, depth: D, height: H } = p;
    const fh = H - st;
    posts(b, m.frame, W, D, s, fh);
    ring(b, m.frame, W, D, s, fh - s / 2, '윗 가로대');
    ring(b, m.frame, W, D, s, 180, '아래 가로대');
    const n = Math.max(2, Math.floor((D + 5) / (sw + 5)));
    spread(n, -D / 2 + sw / 2, D / 2 - sw / 2).forEach(z => b.add('좌판 살', m.slat, [W, st, sw], [0, H - st / 2, z]));
    const inner = D - 2 * s;
    const n2 = Math.max(2, Math.floor((inner + 5) / (sw + 5)));
    spread(n2, -inner / 2 + sw / 2, inner / 2 - sw / 2).forEach(z => b.add('신발 선반 살', m.slat, [W, st, sw], [0, 180 + s / 2 + st / 2, z]));
    return b.parts;
  },
  hardware: parts => [rod, caps(parts), woodScrews(parts.filter(x => x.material === 'spf_1x4').length * 2)],
  tools: [...METAL_TOOLS, '각도절단기 또는 원형톱'], safety: METAL_SAFETY,
  steps: p => [
    '각파이프와 1x4 살을 재단표대로 자릅니다.',
    '사각 틀 2개(위·아래)를 용접하고 기둥 4개로 연결합니다.',
    '용접 정리와 도장을 합니다.',
    `1x4 살을 샌딩·오일 마감한 뒤 좌판과 신발 선반에 같은 간격으로 놓습니다(폭 ${p.width}mm).`,
    '틀 아래에서 피스로 살을 고정합니다.'
  ]
};

export const metalSideTable = {
  id: 'metal-side-table', name: '철제 협탁 / 화분대', category: 'metal', trend: false, difficulty: 1, laborHours: 3,
  summary: '작고 빨리 만들어지는 철제 협탁. 연습용으로도, 판매용으로도 좋아요.',
  keywords: ['협탁', '화분대', '사이드테이블', '침대옆', '보조테이블', '철제협탁'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 300, max: 600, step: 10, default: 400 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 300, max: 600, step: 10, default: 400 },
    { key: 'height', label: '높이', unit: 'mm', min: 400, max: 800, step: 10, default: 600 }
  ],
  materialOptions: { frame: ['sq_tube_20', 'sq_tube_25'], top: ['pine_board_18', 'birch_ply_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const fh = H - T;
    posts(b, m.frame, W, D, s, fh);
    ring(b, m.frame, W, D, s, fh - s / 2, '윗 가로대');
    ring(b, m.frame, W, D, s, 150, '아래 가로대');
    b.add('상판', m.top, [W, T, D], [0, H - T / 2, 0]);
    b.add('아래 선반 판', m.top, [W, T, D - 2 * s], [0, 150 + s / 2 + T / 2, 0]);
    return b.parts;
  },
  hardware: parts => [rod, caps(parts), woodScrews(8)],
  tools: METAL_TOOLS, safety: METAL_SAFETY,
  steps: p => [
    `각파이프를 자릅니다. 기둥 ${p.height - 18}mm 4개.`,
    '위·아래 사각 틀을 용접하고 기둥으로 연결합니다.',
    '용접 정리, 도장.',
    '상판과 아래 선반 판을 샌딩·마감 후 피스로 고정합니다.'
  ]
};

// 리프트업 테이블 치수: 수납칸이 깊어도 아래 가로대 밑면이 바닥대보다 50mm 위에 남게 깊이를 줄인다
const LIFT_DEFAULT_MATS = { frame: 'sq_tube_30', top: 'pine_board_24', panel: 'pine_board_18', bottom: 'ply_9', strap: 'flat_bar_40' };
function liftDims(p, m = LIFT_DEFAULT_MATS) {
  const [s] = sec(m.frame);
  const T = thick(m.top);
  const bt = thick(m.bottom);
  const top = p.height - T;
  const ds = Math.min(p.boxDepth, top - bt - 2 * s - 50);
  return { s, T, bt, top, ds, lowTop: top - ds - bt };
}

// 릴스에서 반응이 컸던 리프트업 수납 커피 테이블 (2026-10-07, 대화 길 실사용 1호를 템플릿으로)
export const liftTopTable = {
  id: 'lift-top-table', name: '리프트업 수납 커피 테이블', category: 'metal', trend: true, difficulty: 3, laborHours: 10,
  summary: '상판을 들어 올리면 안에 수납칸이 나오는 철제 프레임 커피 테이블. 릴스에서 반응이 큰 디자인이에요.',
  keywords: ['리프트업', '리프트', '리프트업테이블', '리프트테이블', '리프팅', '리프팅테이블', '수납테이블', '커피테이블', '소파테이블', '거실테이블'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 800, max: 1400, step: 10, default: 1000 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 400, max: 700, step: 10, default: 500 },
    { key: 'height', label: '높이', unit: 'mm', min: 380, max: 550, step: 10, default: 450 },
    { key: 'boxDepth', label: '수납칸 깊이', unit: 'mm', min: 100, max: 250, step: 10, default: 160 }
  ],
  materialOptions: {
    frame: ['sq_tube_30', 'sq_tube_25', 'sq_tube_40'],
    top: ['pine_board_24', 'pine_board_18'],
    panel: ['pine_board_18', 'birch_ply_18'],
    bottom: ['ply_9', 'mdf_18'],
    strap: ['flat_bar_40']
  },
  build(p, m) {
    const b = builder();
    const { s, T, bt, top, lowTop } = liftDims(p, m);
    const pt = thick(m.panel);
    const [ft, fw] = sec(m.strap);
    const { width: W, depth: D, height: H } = p;
    const inW = W - 2 * s;
    const inD = D - 2 * s;
    const xL = W / 2 - s / 2;
    const zL = D / 2 - s / 2;
    const panelTop = top - s;
    const panelH = panelTop - lowTop;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('다리', m.frame, [s, top, s], [sx * xL, top / 2, sz * zL]);
    for (const sx of [-1, 1]) b.add('끝 바닥대', m.frame, [s, s, inD], [sx * xL, s / 2, 0], { note: '양 끝 ㅁ자 틀' });
    for (const [y, label] of [[top - s / 2, '위 가로대'], [lowTop - s / 2, '아래 가로대']]) {
      for (const sz of [-1, 1]) b.add(`${label} 긴쪽`, m.frame, [inW, s, s], [0, y, sz * zL]);
      for (const sx of [-1, 1]) b.add(`${label} 끝쪽`, m.frame, [s, s, inD], [sx * xL, y, 0]);
    }
    for (const sz of [-1, 1]) b.add('긴 옆판', m.panel, [inW, panelH, pt], [0, lowTop + panelH / 2, sz * zL], { note: '틀 안쪽에서 피스 고정' });
    for (const sx of [-1, 1]) b.add('끝 옆판', m.panel, [pt, panelH, inD], [sx * xL, lowTop + panelH / 2, 0], { note: '틀 안쪽에서 피스 고정' });
    const edge = inW / 2 - 60;
    const n = Math.max(2, Math.ceil((2 * edge) / 350) + 1);
    spread(n, -edge, edge).forEach(x => b.add('바닥 받침 평철', m.strap, [fw, ft, inD], [x, lowTop - ft / 2, 0], { note: '아래 긴 가로대 안쪽에 용접' }));
    b.add('수납칸 바닥판', m.bottom, [inW, bt, inD], [0, lowTop + bt / 2, 0], { note: '검정 도장 또는 펠트 붙이기' });
    b.add('상판 (들리는 판)', m.top, [W, T, D], [0, H - T / 2, 0], { note: '아래에 리프트업 경첩 자리' });
    return b.parts;
  },
  hardware: parts => [
    { name: '리프트업 경첩 (리프팅 테이블 철물) 1쌍', qty: 1, unit: '쌍', price: 35000 },
    woodScrews(24),
    caps(parts),
    { name: '바닥 보호 패드', qty: 4, unit: '개', price: 500 },
    rod
  ],
  tools: [...METAL_TOOLS, '각도절단기 또는 원형톱(나무 재단)', '드릴 비트(경첩 피스 구멍)'],
  safety: [...METAL_SAFETY, '리프트업 경첩은 스프링 힘이 세서 손가락 끼임 주의'],
  steps: (p, m) => {
    const { ds } = liftDims(p, m);
    const depthText = ds < p.boxDepth
      ? `수납칸 깊이는 약 ${Math.round(ds)}mm예요 (높이가 낮아서 ${p.boxDepth}mm까지는 안 돼요).`
      : `수납칸 깊이는 약 ${Math.round(ds)}mm예요.`;
    return [
    '리프트업 경첩 1쌍을 먼저 사서, 설명서에 적힌 필요한 수납칸 깊이와 다는 위치를 확인합니다. 그 치수에 맞춰 틀을 정합니다.',
    `각파이프를 재단표대로 자르고 거스러미를 갈아냅니다. 다리 4개, 위·아래 가로대, 양 끝 바닥대예요.`,
    '양 끝 ㅁ자 틀 2개(다리 2개 + 바닥대 + 위·아래 끝쪽 가로대)를 직각자석으로 잡고 점용접한 뒤, 직각을 확인하고 본용접합니다.',
    '두 끝 틀을 위·아래 긴 가로대로 이어 용접하고, 아래 긴 가로대 안쪽에 바닥 받침 평철을 붙입니다. 대각선 길이가 같은지 확인합니다.',
    '용접 자국을 갈아내고 탈지한 뒤 무광 검정 락카로 칠합니다.',
    '옆판 4장을 재단표대로 잘라 오일로 마감하고, 틀 안쪽에서 피스로 고정합니다.',
    `수납칸 바닥판을 검정으로 칠하거나 펠트를 붙여 받침 위에 올립니다. ${depthText}`,
    `상판(${p.width}x${p.depth}mm)을 우레탄 바니쉬나 오일로 마감하고, 경첩을 설명서 위치대로 달아 몇 번 올렸다 내려 봅니다. 손이 끼지 않게 조심합니다.`
    ];
  }
};

export const METAL_TEMPLATES = [metalShelf, metalTable, shoeBench, metalSideTable, liftTopTable];

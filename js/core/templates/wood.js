import { builder, sec, thick, spread, SAFETY_BASE } from './helpers.js';

export const WOOD_TOOLS = ['줄자', '직각자', '연필', '각도절단기 또는 원형톱', '전동 드릴(드라이버)', '샌더와 사포(120·220방)', '클램프 2개'];

const screws = (qty, len = 65) => ({ name: `목공 피스 ${len}mm`, qty, unit: '개', price: 15 });
const glue = { name: '목공 본드', qty: 1, unit: '통', price: 5000 };

export const woodBench = {
  id: 'wood-bench', name: '구조목 원목 벤치', category: 'wood', trend: true, difficulty: 1, laborHours: 4,
  summary: '구조목 2x4만으로 하루 만에 만드는 벤치. 재료비가 적어서 첫 작품으로 좋아요.',
  keywords: ['벤치', '긴의자', '평상', '현관의자'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 600, max: 2000, step: 10, default: 1200 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 250, max: 500, step: 10, default: 350 },
    { key: 'height', label: '높이', unit: 'mm', min: 350, max: 500, step: 10, default: 450 }
  ],
  materialOptions: { frame: ['spf_2x4', 'treated_2x4'] },
  build(p, m) {
    const b = builder();
    const [t, w] = sec(m.frame);
    const { width: W, depth: D, height: H } = p;
    const n = Math.max(2, Math.floor((D + 6) / (w + 6)));
    spread(n, -D / 2 + w / 2, D / 2 - w / 2).forEach(z => b.add('좌판', m.frame, [W, t, w], [0, H - t / 2, z]));
    const inset = 80;
    const legH = H - t;
    const lx = W / 2 - inset - t / 2;
    const lz = D / 2 - w / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('다리', m.frame, [t, legH, w], [sx * lx, legH / 2, sz * lz]);
    const rx = lx - t;
    for (const sx of [-1, 1]) {
      b.add('윗 가로대', m.frame, [t, w, D], [sx * rx, H - t - w / 2, 0]);
      b.add('아래 가로대', m.frame, [t, w, D], [sx * rx, 150, 0]);
    }
    b.add('긴 보강대', m.frame, [2 * rx - t, w, t], [0, 150, 0]);
    return b.parts;
  },
  hardware: parts => [screws(parts.length * 4), glue],
  tools: WOOD_TOOLS, safety: SAFETY_BASE,
  steps: p => [
    `구조목을 재단표대로 자릅니다. 좌판 ${p.width}mm, 다리 ${p.height - 38}mm.`,
    '자른 면을 120방 사포로 다듬어 가시를 없앱니다.',
    '양쪽 다리 2개에 윗 가로대와 아래 가로대를 피스로 고정해 다리 틀 2개를 만듭니다. 직각자로 직각을 확인합니다.',
    '두 다리 틀 사이 아래 가로대에 긴 보강대를 고정합니다.',
    '좌판을 같은 간격으로 올리고 윗 가로대에 피스로 고정합니다. 피스 구멍은 먼저 작은 드릴로 뚫어 갈라짐을 막습니다.',
    '전체를 220방으로 마감 샌딩하고 오일스테인을 2번 바릅니다.'
  ]
};

export const slatTvStand = {
  id: 'slat-tv-stand', name: '슬랫 TV장 (재팬디)', category: 'wood', trend: true, difficulty: 2, laborHours: 10,
  summary: '앞면에 세로 살을 촘촘히 붙인 낮은 거실장. 요즘 인테리어 영상에서 많이 보이는 디자인이에요.',
  keywords: ['tv장', '티비장', '거실장', '슬랫', '수납장', '낮은장'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 1000, max: 2000, step: 10, default: 1600 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 300, max: 500, step: 10, default: 400 },
    { key: 'height', label: '높이', unit: 'mm', min: 350, max: 600, step: 10, default: 450 },
    { key: 'gap', label: '살 간격', unit: 'mm', min: 10, max: 40, step: 1, default: 15 }
  ],
  materialOptions: { body: ['pine_board_18', 'birch_ply_18'], slat: ['slat_30'], leg: ['spf_2x2'] },
  build(p, m) {
    const b = builder();
    const T = thick(m.body);
    const [st] = sec(m.slat);
    const [lt] = sec(m.leg);
    const { width: W, depth: D, height: H, gap } = p;
    const base = 80;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('받침 다리', m.leg, [lt, base, lt], [sx * (W / 2 - 60), base / 2, sz * (D / 2 - 60)]);
    b.add('바닥판', m.body, [W, T, D], [0, base + T / 2, 0]);
    const inH = H - base - 2 * T;
    const midY = base + T + inH / 2;
    for (const sx of [-1, 1]) b.add('옆판', m.body, [T, inH, D], [sx * (W / 2 - T / 2), midY, 0]);
    b.add('칸막이', m.body, [T, inH, D - st - 20], [0, midY, -(st + 20) / 2]);
    b.add('상판', m.body, [W, T, D], [0, H - T / 2, 0]);
    const span = W - 2 * T;
    const n = Math.max(2, Math.floor((span + gap) / (st + gap)));
    spread(n, -span / 2 + st / 2, span / 2 - st / 2).forEach(x => b.add('슬랫 살', m.slat, [st, inH, st], [x, midY, D / 2 - st / 2]));
    return b.parts;
  },
  hardware: parts => [screws(parts.length * 4, 38), { name: '목심 8mm', qty: 16, unit: '개', price: 50 }, glue],
  tools: [...WOOD_TOOLS, '목심 지그(도웰 지그)', '사각 가이드(원형톱용)'], safety: SAFETY_BASE,
  steps: p => [
    `판재를 재단합니다. 상판·바닥판 ${p.width}x${p.depth}mm. 판재 재단은 목재소 재단 서비스를 쓰면 빠르고 정확해요.`,
    '옆판 2장과 칸막이를 바닥판에 목심과 본드로 세우고, 피스로 보강합니다.',
    '상판을 올려 고정합니다. 대각선 길이 2개가 같으면 직각이 맞은 거예요.',
    `슬랫 살을 같은 길이로 자르고, ${p.gap}mm 간격 막대를 끼워가며 앞면에 붙입니다. 피스는 안쪽에서 박아 겉에 안 보이게 합니다.`,
    '받침 다리 4개를 바닥판 아래에 고정합니다.',
    '전체 샌딩 후 오일 또는 수성 바니쉬로 마감합니다.'
  ]
};

export const woodStool = {
  id: 'wood-stool', name: '원목 스툴 / 사이드테이블', category: 'wood', trend: false, difficulty: 1, laborHours: 3,
  summary: '작고 빨리 만들 수 있는 스툴. 판재 자투리로도 되고 선물용으로도 잘 나가요.',
  keywords: ['스툴', '의자', '보조의자', '사이드테이블', '협탁', '원목의자'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 250, max: 500, step: 10, default: 350 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 250, max: 500, step: 10, default: 350 },
    { key: 'height', label: '높이', unit: 'mm', min: 300, max: 750, step: 10, default: 450 }
  ],
  materialOptions: { top: ['pine_board_18', 'pine_board_24'], leg: ['spf_2x2'], apron: ['spf_1x4'] },
  build(p, m) {
    const b = builder();
    const T = thick(m.top);
    const [lt] = sec(m.leg);
    const [at, aw] = sec(m.apron);
    const { width: W, depth: D, height: H } = p;
    const inset = 20;
    const lx = W / 2 - inset - lt / 2;
    const lz = D / 2 - inset - lt / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('다리', m.leg, [lt, H - T, lt], [sx * lx, (H - T) / 2, sz * lz]);
    const sX = 2 * lx - lt;
    const sZ = 2 * lz - lt;
    const ay = H - T - aw / 2;
    for (const sz of [-1, 1]) b.add('앞뒤 띠장', m.apron, [sX, aw, at], [0, ay, sz * lz]);
    for (const sx of [-1, 1]) b.add('좌우 띠장', m.apron, [at, aw, sZ], [sx * lx, ay, 0]);
    for (const sz of [-1, 1]) b.add('앞뒤 아래 보강', m.leg, [sX, lt, lt], [0, 120, sz * lz]);
    for (const sx of [-1, 1]) b.add('좌우 아래 보강', m.leg, [lt, lt, sZ], [sx * lx, 120, 0]);
    b.add('상판', m.top, [W, T, D], [0, H - T / 2, 0]);
    return b.parts;
  },
  hardware: () => [screws(32, 50), glue],
  tools: WOOD_TOOLS, safety: SAFETY_BASE,
  steps: p => [
    `상판 ${p.width}x${p.depth}mm를 자르고 모서리를 둥글게 다듬습니다.`,
    '다리 4개를 재단표의 "다리" 길이대로, 같은 길이가 되게 한 번에 묶어서 자릅니다.',
    '다리 2개와 띠장·아래 보강으로 옆 틀 2개를 먼저 만들고, 나머지 띠장으로 두 틀을 연결합니다.',
    '평평한 바닥에 세워 흔들리지 않는지 확인합니다. 흔들리면 긴 다리를 사포로 조금씩 줄입니다.',
    '상판을 띠장 안쪽에서 피스로 고정합니다.',
    '샌딩 후 오일로 마감합니다.'
  ]
};

export const woodShelf = {
  id: 'wood-shelf', name: '원목 오픈 선반', category: 'wood', trend: false, difficulty: 1, laborHours: 5,
  summary: '구조목 2x2 기둥에 1x4 판을 얹는 가벼운 오픈 선반. 원룸·베란다 수납용.',
  keywords: ['선반', '책장', '수납선반', '사다리선반', '원목선반', '진열대', '벽선반'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 500, max: 1200, step: 10, default: 800 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 200, max: 400, step: 10, default: 250 },
    { key: 'height', label: '높이', unit: 'mm', min: 600, max: 1800, step: 10, default: 1500 },
    { key: 'tiers', label: '단 수', unit: '단', min: 2, max: 6, step: 1, default: 4 }
  ],
  materialOptions: { post: ['spf_2x2'], board: ['spf_1x4', 'pine_board_18'] },
  build(p, m) {
    const b = builder();
    const [pt] = sec(m.post);
    const bt = thick(m.board);
    const { width: W, depth: D, height: H, tiers } = p;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('기둥', m.post, [pt, H, pt], [sx * (W / 2 - pt / 2), H / 2, sz * (D / 2 - pt / 2)]);
    const innerD = D - 2 * pt;
    spread(tiers, 150 + pt + bt, H).forEach(topY => {
      const railY = topY - bt - pt / 2;
      for (const sx of [-1, 1]) b.add('받침대', m.post, [pt, pt, innerD], [sx * (W / 2 - pt / 2), railY, 0]);
      if (m.board === 'spf_1x4') {
        const bw = sec(m.board)[1];
        const k = Math.max(1, Math.floor((innerD + 5) / (bw + 5)));
        spread(k, -innerD / 2 + bw / 2, innerD / 2 - bw / 2).forEach(z => b.add('선반 판', m.board, [W, bt, bw], [0, topY - bt / 2, z]));
      } else {
        b.add('선반 판', m.board, [W, bt, innerD], [0, topY - bt / 2, 0]);
      }
    });
    return b.parts;
  },
  hardware: parts => [screws(parts.length * 2 + 16, 50), { name: '벽 고정 철물(넘어짐 방지)', qty: 2, unit: '개', price: 1500 }],
  tools: WOOD_TOOLS, safety: SAFETY_BASE,
  steps: p => [
    `기둥 4개를 ${p.height}mm로 자릅니다.`,
    `기둥 2개에 받침대를 ${p.tiers}단 높이로 표시하고 피스로 고정해 옆 사다리 2개를 만듭니다.`,
    '두 옆 사다리를 세우고 선반 판을 받침대 위에 올려 피스로 고정합니다.',
    '대각선 길이를 재서 같으면 직각이 맞은 거예요.',
    '높은 선반은 꼭 벽 고정 철물로 넘어짐을 막습니다.',
    '샌딩 후 오일로 마감합니다.'
  ]
};

export const workbench = {
  id: 'workbench', name: '2x4 작업대 (워크벤치)', category: 'wood', trend: false, difficulty: 2, laborHours: 6,
  summary: '모든 DIY의 시작인 튼튼한 작업대. 아래 선반에 공구를 둘 수 있어요.',
  keywords: ['작업대', '워크벤치', '작업테이블', '공방테이블'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 900, max: 2400, step: 10, default: 1500 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 450, max: 800, step: 10, default: 600 },
    { key: 'height', label: '높이', unit: 'mm', min: 700, max: 1000, step: 10, default: 850 }
  ],
  materialOptions: { frame: ['spf_2x4'], top: ['birch_ply_18', 'pine_board_18'] },
  build(p, m) {
    const b = builder();
    const [t, w] = sec(m.frame);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const inset = 40;
    const lx = W / 2 - inset - t / 2;
    const lz = D / 2 - inset - w / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('다리', m.frame, [t, H - T, w], [sx * lx, (H - T) / 2, sz * lz]);
    for (const y of [H - T - w / 2, 200]) {
      for (const sz of [-1, 1]) b.add(y === 200 ? '아래 앞뒤 틀' : '앞뒤 틀', m.frame, [W - 2 * inset, w, t], [0, y, sz * (lz + w / 2 + t / 2)]);
      for (const sx of [-1, 1]) b.add(y === 200 ? '아래 좌우 틀' : '좌우 틀', m.frame, [t, w, D - 2 * inset], [sx * (lx - t), y, 0]);
    }
    b.add('아래 선반', m.top, [W - 2 * inset - 2 * t, T, D - 2 * inset], [0, 200 + w / 2 + T / 2, 0], { note: '다리 자리 따내기' });
    b.add('상판', m.top, [W, T, D], [0, H - T / 2, 0]);
    return b.parts;
  },
  hardware: parts => [screws(parts.length * 6, 75), { name: '육각 볼트 M8x100 + 너트', qty: 8, unit: '세트', price: 600 }],
  tools: [...WOOD_TOOLS, '임팩트 드라이버'], safety: SAFETY_BASE,
  steps: p => [
    `다리 4개를 ${p.height - 18}mm로 자릅니다.`,
    '앞뒤 틀과 좌우 틀로 위 사각 틀을 만들고, 같은 크기로 아래 틀을 만듭니다.',
    '다리 4개를 위·아래 틀 모서리에 피스와 볼트로 고정합니다.',
    '아래 선반 판의 네 모서리를 다리 크기만큼 따내고 아래 틀 위에 올립니다.',
    '상판을 올리고 가장자리를 따라 피스로 고정합니다.',
    '상판 모서리를 둥글게 다듬습니다. 작업대는 오일 1번이면 충분해요.'
  ]
};

export const WOOD_TEMPLATES = [woodBench, slatTvStand, woodStool, woodShelf, workbench];

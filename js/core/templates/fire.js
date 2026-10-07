import { builder, sec, thick, spread, MASONRY_TOOLS, MASONRY_SAFETY } from './helpers.js';
import { estimateWeight } from '../measure.js';
import { METAL_TOOLS, METAL_SAFETY } from './metal.js';

const FIRE_SAFETY = [...METAL_SAFETY, '아연도금(은색 반짝이는) 자재 사용 금지: 가열·용접 때 유해 연기'];
const rod = { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 };

export const firePlate = {
  id: 'fire-plate', name: '조립식 철판 화로대', category: 'fire', trend: true, difficulty: 2, laborHours: 3,
  summary: '철판 5장을 홈에 끼워 조립하는 화로대. 납작하게 분해돼서 캠핑에 들고 다니기 좋아요.',
  keywords: ['화로', '화로대', '불멍', '캠핑화로', '조립식', '접이식화로', '모닥불'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 300, max: 600, step: 10, default: 400 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 300, max: 600, step: 10, default: 400 },
    { key: 'height', label: '높이', unit: 'mm', min: 200, max: 450, step: 10, default: 300 }
  ],
  materialOptions: { plate: ['steel_plate_32', 'steel_plate_16'] },
  build(p, m) {
    const b = builder();
    const T = thick(m.plate);
    const { width: W, depth: D, height: H } = p;
    for (const sz of [-1, 1]) b.add('앞뒤 벽판', m.plate, [W, H, T], [0, H / 2, sz * (D / 2 - T / 2)], { note: '아래 다리 모양 따내기 + 끼움 홈', shape: 'notched' });
    for (const sx of [-1, 1]) b.add('옆 벽판', m.plate, [T, H, D - 2 * T], [sx * (W / 2 - T / 2), H / 2, 0], { note: '아래 다리 모양 따내기 + 끼움 홈 + 공기구멍', shape: 'notched' });
    b.add('장작 받침판', m.plate, [W - 2 * T, T, D - 2 * T], [0, Math.round(H * 0.45), 0], { note: '공기구멍 지름 10mm 여러 개' });
    return b.parts;
  },
  hardware: () => [{ name: '레이저·플라즈마 재단 외주(도면 전달)', qty: 1, unit: '건', price: 30000 }],
  tools: ['줄자', '그라인더(연마석·플랩디스크)', '줄(쇠줄)', '도면 출력물'], safety: FIRE_SAFETY,
  steps: p => [
    `도면 탭의 판 크기(${p.width}x${p.height}mm 등)로 재단 업체에 레이저 또는 플라즈마 재단을 맡깁니다. 끼움 홈 폭은 판 두께 + 0.5mm로 요청하세요.`,
    '받은 판의 날카로운 모서리를 그라인더와 줄로 갈아냅니다.',
    '임시로 끼워 보고 빡빡한 홈은 줄로 조금씩 넓힙니다.',
    '처음 쓰기 전 야외에서 한 번 태워 기름기를 날리고, 내열 페인트(600도)를 뿌립니다.',
    '사용할 때는 바닥에 내열 받침을 깔고, 실내·텐트 안에서는 절대 쓰지 않습니다.'
  ]
};

export const drumFirePit = {
  id: 'drum-fire-pit', name: '드럼통 화로대', category: 'fire', trend: false, difficulty: 2, laborHours: 4,
  summary: '200L 드럼통을 잘라 만드는 큰 화로. 단체 모임·바비큐에 많이 찾아요.',
  keywords: ['드럼통', '드럼', '화로', '바베큐', '바비큐', '모닥불', '큰화로'],
  params: [
    { key: 'cutHeight', label: '통 높이', unit: 'mm', min: 300, max: 880, step: 10, default: 450 },
    { key: 'legHeight', label: '다리 높이', unit: 'mm', min: 0, max: 400, step: 10, default: 200 }
  ],
  materialOptions: { body: ['drum_200'], leg: ['flat_bar_40'] },
  // 말로 설계에서 "높이 650" 이면 통 높이로 맞춘다
  fromHints(h) {
    if (!Number.isFinite(h.height)) return {};
    const leg = 200;
    return { cutHeight: h.height - leg, legHeight: leg };
  },
  build(p, m) {
    const b = builder();
    const dia = 580;
    const [ft, fw] = sec(m.leg);
    const { cutHeight: CH, legHeight: LH } = p;
    b.add('드럼 몸통', m.body, [dia, CH, dia], [0, LH + CH / 2, 0], { shape: 'cylinder', note: '아래쪽 공기구멍 지름 20mm 8~12개' });
    const legLen = LH + 150;
    const r = dia / 2 + ft / 2;
    b.add('다리', m.leg, [ft, legLen, fw], [r, legLen / 2, 0]);
    b.add('다리', m.leg, [ft, legLen, fw], [-r, legLen / 2, 0]);
    b.add('다리', m.leg, [fw, legLen, ft], [0, legLen / 2, r]);
    b.add('다리', m.leg, [fw, legLen, ft], [0, legLen / 2, -r]);
    spread(2, -120, 120).forEach(z => b.add('석쇠 받침', m.leg, [dia, ft, fw], [0, LH + CH + ft / 2, z]));
    return b.parts;
  },
  hardware: () => [rod, { name: '내열 손잡이(선택)', qty: 2, unit: '개', price: 5000 }],
  tools: [...METAL_TOOLS, '철판용 홀쏘 또는 철공 드릴날 10~20mm'], safety: FIRE_SAFETY,
  steps: p => [
    '내용물이 확인된 드럼통만 씁니다. 기름·화학물질 통은 피하고, 안을 세제로 씻어 완전히 말립니다.',
    `통을 ${p.cutHeight}mm 높이로 그라인더로 자릅니다. 뚜껑을 연 상태로, 불씨가 튀지 않게 주변을 정리합니다.`,
    '아래쪽 둘레에 공기구멍을 뚫습니다.',
    `평철 다리 4개(${p.legHeight + 150}mm)를 통 바깥에 용접합니다.`,
    '야외에서 한 번 크게 태워 안쪽 도장과 잔여물을 날린 뒤 내열 페인트로 마감합니다.',
    '사용할 때는 바닥에 내열 받침, 근처에 물이나 소화기를 둡니다.'
  ]
};

export const campTable = {
  id: 'camp-table', name: '접이식 캠핑 테이블', category: 'fire', trend: true, difficulty: 2, laborHours: 4,
  summary: '원목 상판 + 철제 접이 다리. 캠핑 감성 영상에 자주 나오는 낮은 테이블이에요.',
  keywords: ['캠핑테이블', '캠핑', '접이식', '폴딩', '로우테이블', '좌식테이블', '테이블'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 500, max: 1200, step: 10, default: 800 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 350, max: 600, step: 10, default: 450 },
    { key: 'height', label: '높이', unit: 'mm', min: 250, max: 700, step: 10, default: 380 }
  ],
  materialOptions: { leg: ['sq_tube_20', 'sq_tube_25'], top: ['pine_board_18', 'birch_ply_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.leg);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const fh = H - T;
    const fx = W / 2 - 60;
    const vz = D / 2 - 40 - s / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) b.add('다리 기둥', m.leg, [s, fh, s], [sx * fx, fh / 2, sz * vz]);
      b.add('다리 윗대', m.leg, [s, s, 2 * vz - s], [sx * fx, fh - s / 2, 0], { note: '접이 힌지 자리' });
      b.add('다리 발대', m.leg, [s, s, 2 * vz - s], [sx * fx, s / 2, 0]);
    }
    b.add('상판', m.top, [W, T, D], [0, H - T / 2, 0]);
    return b.parts;
  },
  hardware: () => [
    { name: '접이식 다리 브라켓(폴딩 힌지)', qty: 4, unit: '개', price: 3000 },
    { name: '볼트·너트 M6', qty: 8, unit: '세트', price: 200 },
    rod
  ],
  tools: [...METAL_TOOLS, '각도절단기 또는 원형톱'], safety: METAL_SAFETY,
  steps: p => [
    `상판 ${p.width}x${p.depth}mm를 자르고 모서리를 둥글게 다듬습니다.`,
    'ㄷ자 다리 2개를 용접합니다(기둥 2개 + 윗대 + 발대).',
    '다리 정리·도장 후, 상판 아래에 접이식 브라켓을 피스로 고정합니다.',
    '다리 윗대를 브라켓에 볼트로 연결하고 접었다 폈다 해 봅니다.',
    '상판은 물에 강한 우레탄 바니쉬로 마감합니다.'
  ]
};

export const fireTable = {
  id: 'fire-table', name: '화로 테이블 (가운데 구멍)', category: 'fire', trend: false, difficulty: 3, laborHours: 10,
  summary: '가운데 화로를 넣고 둘러앉는 테이블. 볼트로 분해되게 만들면 차에 실을 수 있어요.',
  keywords: ['화로테이블', '화로', '둘레테이블', '캠핑', 'igt', '바베큐테이블'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 700, max: 1200, step: 10, default: 900 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 700, max: 1200, step: 10, default: 900 },
    { key: 'height', label: '높이', unit: 'mm', min: 300, max: 500, step: 10, default: 400 },
    { key: 'hole', label: '가운데 구멍', unit: 'mm', min: 300, max: 600, step: 10, default: 450 }
  ],
  materialOptions: { frame: ['sq_tube_25', 'sq_tube_30'], top: ['birch_ply_18', 'pine_board_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const hole = Math.min(p.hole, Math.min(W, D) - 250);
    const fh = H - T;
    const y = fh - s / 2;
    const lx = W / 2 - 20 - s / 2;
    const lz = D / 2 - 20 - s / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('다리', m.frame, [s, fh, s], [sx * lx, fh / 2, sz * lz]);
    for (const sz of [-1, 1]) b.add('바깥 틀 앞뒤', m.frame, [2 * lx - s, s, s], [0, y, sz * lz]);
    for (const sx of [-1, 1]) b.add('바깥 틀 좌우', m.frame, [s, s, 2 * lz - s], [sx * lx, y, 0]);
    for (const sz of [-1, 1]) b.add('안쪽 틀 앞뒤', m.frame, [hole + 2 * s, s, s], [0, y, sz * (hole / 2 + s / 2)]);
    for (const sx of [-1, 1]) b.add('안쪽 틀 좌우', m.frame, [s, s, hole], [sx * (hole / 2 + s / 2), y, 0]);
    const inner = hole / 2 + s;
    const outer = lx - s / 2;
    for (const sx of [-1, 1]) b.add('연결대', m.frame, [outer - inner, s, s], [sx * (inner + outer) / 2, y, 0]);
    for (const sz of [-1, 1]) b.add('상판 앞뒤', m.top, [W, T, (D - hole) / 2], [0, H - T / 2, sz * (hole / 2 + (D - hole) / 4)]);
    for (const sx of [-1, 1]) b.add('상판 좌우', m.top, [(W - hole) / 2, T, hole], [sx * (hole / 2 + (W - hole) / 4), H - T / 2, 0]);
    return b.parts;
  },
  hardware: () => [
    { name: '볼트·너트 M8(분해형 연결)', qty: 12, unit: '세트', price: 400 },
    { name: '판 고정 피스(철재용 트러스)', qty: 16, unit: '개', price: 30 },
    rod
  ],
  tools: [...METAL_TOOLS, '직소 또는 원형톱'], safety: [...METAL_SAFETY, '상판과 화로 사이 간격 5cm 이상, 내열 받침'],
  steps: p => [
    `가운데 구멍 크기(${p.hole}mm)를 쓸 화로보다 10cm 이상 크게 잡습니다.`,
    '바깥 틀과 안쪽 틀을 각각 용접하고 연결대로 잇습니다. 다리는 볼트 연결로 만들면 분해가 됩니다.',
    '용접 정리, 내열 도장.',
    '상판 4조각을 자르고 샌딩, 오일 마감 후 틀 위에 피스로 고정합니다.',
    '화로 열이 상판에 직접 닿지 않는지 처음 사용 때 꼭 확인합니다.'
  ]
};

// 바퀴 달린 벽돌 화덕 (2026-10-07, 사용자가 보낸 AI 영상에서). 치수 식은 docs/superpowers/specs/2026-10-07-brick-oven-design.md
// 앞에서부터: 앞 턱(landing) > 연기 통로 아치(적벽돌, 위에 연통) > 문 > 내화벽돌 화실. 적벽돌은 화실 밖에만
const OVEN = { fb: 114, insul: 50, render: 40, ring: 190, ringDepth: 190, landing: 150, backGap: 60, slab: 60, deck: 1.6, floorT: 65, casterH: 190, wheel: 150, plate: 100, plateT: 3.2, lowY: 300, flue: 900 };
// 전체 크기와 안쪽 크기의 차이 (비슷한 템플릿으로 열 때 씀)
const OVEN_EXTRA_W = 2 * (OVEN.fb + OVEN.insul + OVEN.render) + 100;
const OVEN_EXTRA_D = OVEN.render + OVEN.insul + OVEN.fb + OVEN.ringDepth + OVEN.landing + OVEN.backGap;

function ovenDims(p, m) {
  const [s] = sec(m.frame);
  const r = p.width / 2;
  const Ro = r + OVEN.fb;
  const Ri = Ro + OVEN.insul;
  const Rs = Ri + OVEN.render;
  const ovenD = OVEN.render + OVEN.insul + OVEN.fb + p.depth + OVEN.ringDepth;
  // 양옆 여유 50씩: 기본 크기에서 철판 바닥이 철판 한 장(폭 1219) 안에 들어가게
  const SW = Math.round(2 * Rs + 100);
  const SD = Math.round(ovenD + OVEN.landing + OVEN.backGap);
  const top = p.cartHeight;
  const slabBase = top + OVEN.deck;
  const floorTop = slabBase + OVEN.slab + OVEN.floorT;
  return { s, r, Ro, Ri, Rs, SW, SD, top, slabBase, floorTop };
}

export const brickOvenCart = {
  id: 'brick-oven-cart', name: '바퀴 달린 벽돌 화덕', category: 'fire', trend: false, difficulty: 3, laborHours: 40,
  summary: '각파이프 받침대 위에 콘크리트 판을 붓고, 내화벽돌로 반원 지붕을 쌓은 피자 화덕. 바퀴와 수평 조절발이 달려 있어요.',
  keywords: ['화덕', '피자화덕', '벽돌화덕', '이동식화덕', '피자오븐', '오븐', '화덕카트', '바퀴화덕'],
  fromOverall: ({ width, depth }) => ({ width: width - OVEN_EXTRA_W, depth: depth - OVEN_EXTRA_D }),
  params: [
    { key: 'width', label: '화덕 안쪽 폭', unit: 'mm', min: 500, max: 900, step: 10, default: 700 },
    { key: 'depth', label: '화덕 안쪽 깊이', unit: 'mm', min: 600, max: 1000, step: 10, default: 800 },
    { key: 'cartHeight', label: '받침대 높이', unit: 'mm', min: 600, max: 900, step: 10, default: 750 }
  ],
  materialOptions: {
    frame: ['sq_tube_50', 'sq_tube_40'],
    shelf: ['steel_plate_16', 'pine_board_18'],
    deck: ['steel_plate_16'], slab: ['concrete_mix'], rebar: ['round_bar_10'],
    fire: ['fire_brick'], face: ['red_brick'], insul: ['ceramic_blanket'], render: ['cement_render'],
    door: ['steel_plate_32'], plate: ['steel_plate_32'], flue: ['stainless_pipe_125'], caster: ['caster_150']
  },
  build(p, m) {
    const b = builder();
    const { s, r, Ro, Ri, Rs, SW, SD, top, slabBase, floorTop } = ovenDims(p, m);
    const xL = SW / 2 - s / 2;
    const zL = SD / 2 - s / 2;
    // 받침대: 바퀴, 다리, 위·아래 사각 틀, 보강, 장작 선반
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // 모서리마다 받침판(100x100) 위에 다리, 받침판 아래 캐스터(높이 약 19cm, 바퀴 지름 15cm)
      const px = sx * (SW / 2 - OVEN.plate / 2);
      const pz = sz * (SD / 2 - OVEN.plate / 2);
      b.add('바퀴', m.caster, [40, OVEN.casterH, OVEN.wheel], [px, OVEN.casterH / 2, pz], { shape: 'caster', note: '브레이크 있는 중량 캐스터' });
      b.add('바퀴 받침판', m.plate, [OVEN.plate, OVEN.plateT, OVEN.plate], [px, OVEN.casterH + OVEN.plateT / 2, pz], { note: '다리 밑에 용접, 캐스터 볼트 구멍 4개' });
      const legBottom = OVEN.casterH + OVEN.plateT;
      b.add('다리', m.frame, [s, top - legBottom, s], [sx * xL, legBottom + (top - legBottom) / 2, sz * zL]);
    }
    for (const [y, label] of [[top - s / 2, '위 틀'], [OVEN.lowY, '아래 틀']]) {
      for (const sz of [-1, 1]) b.add(`${label} 앞뒤`, m.frame, [SW - 2 * s, s, s], [0, y, sz * zL]);
      for (const sx of [-1, 1]) b.add(`${label} 좌우`, m.frame, [s, s, SD - 2 * s], [sx * xL, y, 0]);
    }
    spread(3, -SD / 4, SD / 4).forEach(z => b.add('위 보강', m.frame, [SW - 2 * s, s, s], [0, top - s / 2, z], { note: '판 받침' }));
    spread(3, -SD / 4, SD / 4).forEach(z => b.add('아래 보강', m.frame, [SW - 2 * s, s, s], [0, OVEN.lowY, z], { note: '선반 받침' }));
    const shT = thick(m.shelf);
    b.add('장작 선반', m.shelf, [SW - 2 * s, shT, SD], [0, OVEN.lowY + s / 2 + shT / 2, 0], { note: '앞뒤 아래 틀과 보강 위에 얹기' });
    // 철판 바닥 + 철근 넣은 콘크리트 판
    b.add('철판 바닥', m.deck, [SW, OVEN.deck, SD], [0, top + OVEN.deck / 2, 0], { note: '위 틀에 용접 (콘크리트 거푸집 겸용)', noPaint: true });
    b.add('콘크리트 판', m.slab, [SW, OVEN.slab, SD], [0, slabBase + OVEN.slab / 2, 0], { note: '테두리 나무 거푸집, 1주일 물 뿌리며 양생' });
    const [rb] = sec(m.rebar);
    spread(4, -SD / 2 + 100, SD / 2 - 100).forEach(z => b.add('철근 가로', m.rebar, [SW - 80, rb, rb], [0, slabBase + 25, z], { noPaint: true }));
    spread(4, -SW / 2 + 100, SW / 2 - 100).forEach(x => b.add('철근 세로', m.rebar, [rb, rb, SD - 80], [x, slabBase + 35, 0], { noPaint: true }));
    // 화덕: 뒤에서 앞으로 미장 뒤판, 단열 뒤판, 내화 뒷벽, 내화 지붕, 적벽돌 아치 테두리, 문
    const zb0 = -SD / 2 + OVEN.backGap;
    const floorD = SD - OVEN.backGap - 20;
    b.add('내화벽돌 바닥', m.fire, [2 * Rs, OVEN.floorT, floorD], [0, floorTop - OVEN.floorT / 2, zb0 + floorD / 2], { note: '내화 몰탈 줄눈 3mm, 수평 맞추기' });
    const arch = (name, mat, R, wall, z0, depth, note = '') =>
      b.add(name, mat, [2 * R, R, depth], [0, floorTop + R / 2, z0 + depth / 2], { shape: 'barrel', wall, note });
    const z1 = zb0 + OVEN.render;
    const z2 = z1 + OVEN.insul;
    const z3 = z2 + OVEN.fb;
    const z4 = z3 + p.depth;
    arch('미장 뒤판', m.render, Rs, 0, zb0, OVEN.render);
    arch('미장 지붕', m.render, Rs, OVEN.render, z1, z4 - z1, '철망 씌우고 시멘트 미장');
    arch('단열 뒤판', m.insul, Ri, 0, z1, OVEN.insul);
    arch('단열 지붕', m.insul, Ri, OVEN.insul, z2, z4 - z2, '세라믹 담요 2겹');
    arch('내화벽돌 뒷벽', m.fire, Ro, 0, z2, OVEN.fb);
    arch('내화벽돌 지붕', m.fire, Ro, OVEN.fb, z3, p.depth, `반원 거푸집(반지름 ${r}mm) 위에 쌓기`);
    // 문은 화실 입구(내화 지붕 앞면)를 막고, 그 앞 적벽돌 아치가 연기 통로가 된다
    arch('적벽돌 아치 테두리', m.face, r + OVEN.ring, OVEN.ring, z4, OVEN.ringDepth, '연기 통로, 맨 위에 연기 구멍 지름 125');
    const doorT = thick(m.door);
    arch('아치 문', m.door, r, 0, z4, doorT, '반원으로 재단, 손잡이 2개, 화실 입구에 끼움');
    const [fd] = sec(m.flue);
    b.add('연통', m.flue, [fd, OVEN.flue, fd], [0, floorTop + r + OVEN.ring + OVEN.flue / 2, z4 + OVEN.ringDepth / 2], { note: '연기 통로 위, 비 가리개 달기' });
    return b.parts;
  },
  hardware: () => [
    { name: '수평 조절발 M16 (고하중)', qty: 4, unit: '개', price: 17000 },
    { name: '연통 비 가리개(삿갓) 125', qty: 1, unit: '개', price: 22000 },
    { name: '미장용 철망(메탈라스)', qty: 1, unit: '롤', price: 23000 },
    { name: '아치 거푸집용 합판 9T', qty: 1, unit: '장', price: 18000 },
    { name: '문 손잡이', qty: 2, unit: '개', price: 3000 },
    { name: '용접봉 2.6mm', qty: 2, unit: '봉지(1kg)', price: 8000 }
  ],
  tools: [...METAL_TOOLS, ...MASONRY_TOOLS, '직소(거푸집 합판 자르기)'],
  safety: [
    ...FIRE_SAFETY, ...MASONRY_SAFETY,
    '무게가 수백 kg에서 1톤 넘게 나가요(제작 순서 첫 줄의 계산값 확인): 평지에서만 천천히 옮기고, 쓸 때는 바퀴 브레이크와 수평 조절발로 고정',
    '첫 불은 5~7일 동안 작게 키우며 말리기 (급하게 달구면 갈라짐)',
    '실내·처마 밑 사용 금지, 소화기를 옆에'
  ],
  steps(p, m) {
    const mats = m || Object.fromEntries(Object.entries(brickOvenCart.materialOptions).map(([k, v]) => [k, v[0]]));
    const kg = Math.round(estimateWeight(brickOvenCart.build(p, mats)) / 10) * 10;
    const perCaster = Math.ceil(kg / 3 / 10) * 10;
    const r = p.width / 2;
    return [
      `완성 무게가 약 ${kg}kg이에요. 바퀴는 1개당 ${perCaster}kg 이상 견디는 브레이크 달린 중량 캐스터로 고르세요. 바닥이 고르지 않으면 바퀴 3개에 무게가 실려요.`,
      '각파이프로 받침대를 만듭니다. 위·아래 사각 틀과 다리를 직각자석으로 잡아 용접하고, 위 보강 3개와 아래 보강 3개를 넣습니다. 다리 밑에 받침판을 용접하고 캐스터(높이 약 19cm)와 수평 조절발을 답니다.',
      '위 틀에 철판 바닥을 용접하고, 철근을 가로·세로 4개씩 격자로 묶어 올립니다. 테두리에 나무 거푸집을 두르고 콘크리트를 6cm 붓고, 1주일 동안 물을 뿌리며 굳힙니다.',
      '내화벽돌 바닥을 내화 몰탈로 평평하게 깝니다(줄눈 3mm, 수평자로 확인). 가능하면 바닥 아래에 단열 보드를 깔면 열이 덜 빠져요.',
      `합판으로 반원 거푸집(반지름 ${r}mm)을 만들어 세우고, 내화벽돌로 반원 지붕과 뒷벽을 쌓습니다. 몰탈이 굳으면 거푸집을 빼냅니다.`,
      `화실 입구 앞에 적벽돌로 연기 통로 아치(깊이 ${OVEN.ringDepth}mm)를 쌓고, 맨 위에 지름 125mm 연기 구멍을 내 스테인리스 연통(${OVEN.flue}mm)과 비 가리개를 답니다. 적벽돌은 화실 밖에만 써요.`,
      '지붕과 뒷벽을 세라믹 단열 담요 2겹(5cm)으로 덮고, 철망을 씌운 뒤 시멘트로 4cm 미장합니다.',
      `철판(3.2T)을 반원(지름 ${p.width}mm)으로 잘라 문을 만들고 손잡이를 답니다. 문은 화실 입구에 끼워 열을 가둬요.`,
      '첫 불은 5~7일 동안 아주 작게 시작해 조금씩 키우며 말립니다. 실내·처마 밑에서는 쓰지 말고, 쓸 때는 바퀴 브레이크와 수평 조절발로 고정하고 소화기를 옆에 둡니다.'
    ];
  }
};

export const FIRE_TEMPLATES = [firePlate, drumFirePit, campTable, fireTable, brickOvenCart];

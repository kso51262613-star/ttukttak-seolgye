import { builder, sec, spread, SAFETY_BASE } from './helpers.js';
import { WOOD_TOOLS } from './wood.js';
import { METAL_TOOLS, METAL_SAFETY } from './metal.js';

export const raisedBed = {
  id: 'raised-bed', name: '텃밭 상자 (레이즈드 베드)', category: 'outdoor', trend: false, difficulty: 1, laborHours: 3,
  summary: '방부목으로 짜는 텃밭 상자. 베란다·마당 텃밭용으로 봄철에 많이 찾아요.',
  keywords: ['텃밭', '화분', '레이즈드베드', '텃밭상자', '화단', '정원'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 600, max: 2400, step: 10, default: 1200 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 400, max: 1200, step: 10, default: 600 },
    { key: 'rows', label: '판 단 수', unit: '단', min: 1, max: 4, step: 1, default: 2 }
  ],
  materialOptions: { board: ['treated_2x6', 'treated_2x4'], post: ['treated_2x4'] },
  fromHints(h) {
    return Number.isFinite(h.height) ? { rows: Math.round(h.height / 140) } : {};
  },
  build(p, m) {
    const b = builder();
    const [t, w] = sec(m.board);
    const [pt, pw] = sec(m.post);
    const { width: W, depth: D, rows } = p;
    const Hh = rows * w;
    for (let r = 0; r < rows; r++) {
      const y = w / 2 + r * w;
      for (const sz of [-1, 1]) b.add('앞뒤 판', m.board, [W, w, t], [0, y, sz * (D / 2 - t / 2)]);
      for (const sx of [-1, 1]) b.add('옆 판', m.board, [t, w, D - 2 * t], [sx * (W / 2 - t / 2), y, 0]);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('모서리 기둥', m.post, [pt, Hh, pw], [sx * (W / 2 - t - pt / 2), Hh / 2, sz * (D / 2 - t - pw / 2)]);
    return b.parts;
  },
  // 위아래로 쌓은 같은 판끼리는 붙이지 않는다 (판마다 모서리 기둥에 피스). 2x4 판을 고르면 두께가 얇아 자동으로는 판끼리 피스가 잡힌다
  jointRules: (pa, pb) => pa.name === pb.name ? false : null,
  hardware: (parts, p) => [
    { name: '스테인리스 피스 75mm(야외용)', qty: p.rows * 16, unit: '개', price: 40 },
    { name: '방초 부직포', qty: 1, unit: '장', price: 5000 }
  ],
  tools: WOOD_TOOLS, safety: SAFETY_BASE,
  steps: p => [
    `방부목을 자릅니다. 앞뒤 판 ${p.width}mm, 옆 판 ${p.depth - 76}mm.`,
    '모서리 기둥에 앞뒤 판과 옆 판을 한 단씩 피스로 고정합니다(야외용 스테인리스 피스).',
    `${p.rows}단까지 쌓으며 대각선 길이가 같은지 확인합니다.`,
    '놓을 자리 바닥을 평평하게 고르고 방초 부직포를 깝니다.',
    '자른 면에는 방부 오일을 한 번 더 발라 썩음을 늦춥니다.'
  ]
};

export const firewoodRack = {
  id: 'firewood-rack', name: '철제 장작 거치대', category: 'outdoor', trend: true, difficulty: 1, laborHours: 3,
  summary: '불멍·벽난로 인기로 많이 찾는 장작 거치대. 실내 장식용으로도 써요.',
  keywords: ['장작', '장작거치대', '장작받침', '땔감', '장작보관', '벽난로'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 600, max: 1800, step: 10, default: 1000 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 250, max: 500, step: 10, default: 350 },
    { key: 'height', label: '높이', unit: 'mm', min: 600, max: 1500, step: 10, default: 1000 }
  ],
  materialOptions: { frame: ['sq_tube_25', 'sq_tube_30'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const { width: W, depth: D, height: H } = p;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('기둥', m.frame, [s, H, s], [sx * (W / 2 - s / 2), H / 2, sz * (D / 2 - s / 2)]);
    for (const [y, label] of [[100, '바닥 틀'], [H - s / 2, '윗 틀']]) {
      for (const sz of [-1, 1]) b.add(`${label} 앞뒤`, m.frame, [W - 2 * s, s, s], [0, y, sz * (D / 2 - s / 2)]);
      for (const sx of [-1, 1]) b.add(`${label} 좌우`, m.frame, [s, s, D - 2 * s], [sx * (W / 2 - s / 2), y, 0]);
    }
    const k = Math.max(0, Math.floor(W / 350) - 1);
    spread(k + 2, -(W / 2 - s / 2), W / 2 - s / 2).slice(1, -1)
      .forEach(x => b.add('바닥 받침살', m.frame, [s, s, D - 2 * s], [x, 100, 0]));
    return b.parts;
  },
  hardware: () => [
    { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 },
    { name: '고무 발 캡', qty: 4, unit: '개', price: 300 }
  ],
  tools: METAL_TOOLS, safety: METAL_SAFETY,
  steps: p => [
    `각파이프를 자릅니다. 기둥 ${p.height}mm 4개.`,
    '바닥 틀과 윗 틀을 직각자석으로 잡고 용접합니다.',
    '기둥 4개로 두 틀을 연결하고 바닥 받침살을 넣습니다.',
    '용접 정리 후 야외용이면 방청 페인트, 실내용이면 무광 락카로 마감합니다.',
    '바닥 틀이 땅에서 10cm 떠 있어 장작이 습기를 덜 먹어요.'
  ]
};

// 인스타그램 릴스에서 본 조립식 해먹 거치대: 각재를 철제 연결쇠(각파이프 용접)에 끼워 세운다.
// 기둥 기울기 55도(영상 추정), 소켓 길이 200, 기둥 소켓 250, 각재 끝은 소켓 속 20mm 지점까지
const HAMMOCK = { angle: 55, socket: 200, upSocket: 250, gap: 20 };
// 소켓 고정 볼트 (연결부와 준비물 목록이 같은 이름이라 한 번만 센다)
const HAMMOCK_BOLT = { name: '고정 볼트 M10x130 (너트·와셔 포함)', unit: '세트', price: 1000, dia: 11, len: 130 };

// 슬라이더 값에서 부품 길이와 위치를 계산 (만들기와 제작 순서가 같이 쓴다).
// 전체 길이·높이는 기둥 끝 바깥 모서리까지라 화면 전체 크기와 슬라이더가 같다
function hammockGeo(p, m) {
  const [T] = sec(m.frame);
  const [S] = sec(m.hub);
  const { angle, gap } = HAMMOCK;
  const th = (angle * Math.PI) / 180;
  const topY = p.height - (T / 2) * Math.cos(th);   // 기둥 끝 가운데 높이
  const rise = topY - S / 2;
  const topX = p.width / 2 - (T / 2) * Math.sin(th); // 기둥 끝 가운데 가로 위치
  const hubX = topX - rise / Math.tan(th);            // 연결쇠 가운데
  return {
    T, S, th, hubX,
    base: 2 * (hubX - S / 2 - gap),
    upright: rise / Math.sin(th) - S / 2 - gap,
    footHalf: p.depth / 2 - S / 2 - gap
  };
}

export const hammockStand = {
  id: 'hammock-stand', name: '나무 해먹 거치대 (철제 연결쇠)', category: 'outdoor', trend: true, difficulty: 2, laborHours: 8,
  summary: '각재를 철제 연결쇠에 끼워 세우는 해먹 거치대. 끼워서 조립하고 흔들리면 볼트로 고정해요. 분해하면 차에 실려요.',
  keywords: ['해먹', '해먹거치대', '해먹스탠드', '해먹받침', '그물침대', '캠핑해먹', '캠핑용해먹'],
  params: [
    { key: 'width', label: '전체 길이', unit: 'mm', min: 3600, max: 5300, step: 50, default: 4500 },
    { key: 'height', label: '기둥 끝 높이', unit: 'mm', min: 1200, max: 1800, step: 10, default: 1500 },
    { key: 'depth', label: '가로 받침 폭', unit: 'mm', min: 1000, max: 1600, step: 10, default: 1300 }
  ],
  materialOptions: { frame: ['treated_90'], hub: ['sq_tube_100'] },
  // "폭 1.3m" 처럼 전체 길이로는 너무 짧은 값은 가로 받침 폭으로 본다 (전체 길이는 기본값)
  fromHints(h) {
    if (Number.isFinite(h.width) && h.width <= 1600 && !Number.isFinite(h.depth)) return { depth: h.width, width: 4500 };
    return {};
  },
  build(p, m) {
    const b = builder();
    const { T, S, th, hubX, base, upright, footHalf } = hammockGeo(p, m);
    const { socket: Ls, upSocket: La, gap, angle } = HAMMOCK;
    const y = S / 2;
    const [c, s] = [Math.cos(th), Math.sin(th)];
    b.add('바닥 기둥', m.frame, [base, T, T], [0, y, 0]);
    for (const sx of [-1, 1]) {
      const hx = sx * hubX;
      // 연결쇠: 가운데 칸 + 가로 소켓 3개(안쪽, 앞, 뒤) + 바깥 위로 기운 기둥 소켓
      b.add('연결쇠 가운데 칸', m.hub, [S, S, S], [hx, y, 0]);
      b.add('연결쇠 안쪽 소켓', m.hub, [Ls, S, S], [sx * (hubX - S / 2 - Ls / 2), y, 0]);
      for (const sz of [-1, 1]) b.add('연결쇠 가로 소켓', m.hub, [S, S, Ls], [hx, y, sz * (S / 2 + Ls / 2)]);
      const sd = S / 2 + La / 2;
      b.add('연결쇠 기둥 소켓', m.hub, [La, S, S], [hx + sx * sd * c, y + sd * s, 0], { rot: [0, 0, sx * angle] });
      for (const sz of [-1, 1]) b.add('가로 받침', m.frame, [T, T, footHalf], [hx, y, sz * (S / 2 + gap + footHalf / 2)]);
      const ud = S / 2 + gap + upright / 2;
      b.add('비스듬한 기둥', m.frame, [upright, T, T], [hx + sx * ud * c, y + ud * s, 0], { rot: [0, 0, sx * angle] });
    }
    return b.parts;
  },
  // 연결부 지정: 각재가 철 소켓에 들어가는 곳마다 M10x130 관통 볼트 1개. 기운 기둥·소켓은 맞닿음 판정 대신 지정으로
  joints(parts) {
    const byId = new Map(parts.map(x => [x.id, x]));
    const out = [];
    for (const n of [1, 2]) {
      out.push({ a: '바닥 기둥-1', b: `연결쇠 안쪽 소켓-${n}`, type: 'bolt', fastener: HAMMOCK_BOLT, qty: 1, note: '소켓 옆에서 각재를 관통', step: 6 });
      const sock = byId.get(`연결쇠 기둥 소켓-${n}`);
      const post = byId.get(`비스듬한 기둥-${n}`);
      if (sock && post) out.push({ a: `비스듬한 기둥-${n}`, b: `연결쇠 기둥 소켓-${n}`, type: 'bolt', fastener: HAMMOCK_BOLT, qty: 1, at: sock.pos, axis: 2, holes: [{ at: sock.pos, axis: 2, dia: 11 }], note: '소켓 가운데를 옆에서 관통', step: 6 });
      if (sock) out.push({ a: `연결쇠 기둥 소켓-${n}`, b: `연결쇠 가운데 칸-${n}`, type: 'weld', axis: 0, note: `${HAMMOCK.angle}도로 기울여 용접`, step: 3 });
    }
    // 가로 받침-1·2 는 왼쪽 연결쇠의 가로 소켓-1·2, 가로 받침-3·4 는 오른쪽의 가로 소켓-3·4 에 들어간다 (만드는 순서가 같다)
    for (const n of [1, 2, 3, 4]) out.push({ a: `가로 받침-${n}`, b: `연결쇠 가로 소켓-${n}`, type: 'bolt', fastener: HAMMOCK_BOLT, qty: 1, note: '소켓 옆에서 관통', step: 6 });
    return out;
  },
  // 보통 아이볼트는 나사가 22mm 라 각재를 뚫어 고정할 수 없어서, 전산볼트를 관통하고 아이너트를 단다
  hardware: () => [
    { name: '아이너트 M12 + 전산볼트 M12(150mm)·와셔·너트', qty: 2, unit: '세트', price: 4500 },
    { name: '체인 6mm 아연도금 (50cm)', qty: 2, unit: '줄', price: 1500 },
    { name: '스냅훅 (하중 0.3t 표시)', qty: 4, unit: '개', price: 6600 },
    { name: HAMMOCK_BOLT.name, qty: 8, unit: HAMMOCK_BOLT.unit, price: HAMMOCK_BOLT.price },
    { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 }
  ],
  tools: [...METAL_TOOLS, '각도절단기 또는 원형톱', '대패 또는 사포(각재 끝 다듬기)', '12mm·11mm 드릴 비트', '스패너'],
  safety: [
    ...METAL_SAFETY,
    '평평한 바닥에 두세요. 기울어진 곳이면 넘어질 수 있어요',
    '처음 앉을 때는 천천히 앉아서 연결쇠와 기둥이 흔들리지 않는지 확인하세요',
    '체인과 고리는 하중 표시(예: 200kg 이상)가 있는 것으로 쓰세요',
    '한 사람이 쓰는 것을 기준으로 한 참고 설계예요. 계산값은 참고용이에요'
  ],
  steps(p, m = { frame: 'treated_90', hub: 'sq_tube_100' }) {
    const g = hammockGeo(p, m);
    const mm = v => Math.round(v);
    return [
      `방부목 각재 90x90 을 자릅니다. 바닥 기둥 ${mm(g.base)}mm 1개, 비스듬한 기둥 ${mm(g.upright)}mm 2개, 가로 받침 ${mm(g.footHalf)}mm 4개.`,
      `각파이프 100x100 을 자릅니다. 가운데 칸 100mm 2개, 가로 소켓 ${HAMMOCK.socket}mm 6개, 기둥 소켓 ${HAMMOCK.upSocket}mm 2개. 기둥 소켓은 한쪽 끝을 비스듬히 잘라, 붙였을 때 ${HAMMOCK.angle}도로 서게 합니다.`,
      `연결쇠를 용접합니다. 가운데 칸에 가로 소켓 3개를 T자로 붙이고(안쪽 1, 앞뒤 2), 바깥쪽 위에 기둥 소켓을 ${HAMMOCK.angle}도로 붙입니다. 두 연결쇠는 좌우 대칭이에요.`,
      '용접 자국을 갈아내고 방청 페인트를 칠합니다. 각재는 오일스테인을 두 번 바릅니다.',
      '각재가 소켓(안쪽 약 93mm)에 꽉 끼면 끝을 대패나 사포로 조금 다듬습니다.',
      '바닥 기둥 양 끝에 연결쇠를 끼우고, 가로 받침 4개와 비스듬한 기둥 2개를 차례로 끼웁니다. 흔들리면 소켓마다 M10 볼트로 고정합니다.',
      '기둥 끝에서 10cm 아래에 12mm 구멍을 뚫고 M12 전산볼트를 끼웁니다. 해먹 쪽에 아이너트, 반대쪽에 와셔와 너트를 잠급니다 (보통 아이볼트는 나사가 짧아 각재에 못 써요). 체인과 스냅훅으로 해먹을 걸고 높이를 맞춥니다.',
      `처음엔 천천히 앉아 흔들림이 없는지 확인합니다. 전체 길이 ${p.width}mm, 기둥 끝 높이 ${p.height}mm, 가로 받침 폭 ${p.depth}mm.`
    ];
  }
};

// 인스타그램 릴스(태국 픽업 적재 롤바, 2026-10-12)에서 본 접이식 랙을 사용자 차(포드 레인저, 슬라이딩 베드 설치)에 맞춘 것.
// 울타리 위에 걸쳐 클램프로 조이고, 미닫이 틀이 뒤로 뽑히며, 2단 다리를 미닫이 뒤끝에 볼트로 달아 땅에 세운다. 바닥은 슬라이딩 베드가 쓰므로 비워 둔다.
// 2026-10-12 검토 반영: 접이식 힌지는 접힐 때 틀 모서리에 걸리고 평철 40 으로 귀를 못 만들어 "떼었다 볼트로 다는 다리"로,
// 가이드 앵글·걸쇠는 작동하지 않아 "ㄱ자 덮개 키퍼"로 바꿈. 다리는 700 이상 뽑았을 때만 세울 수 있다 (덜 뽑으면 열린 테일게이트 위)
const RACK = { leg: 900, foot: 30, bedDepth: 530, keep: 500, wall: 70, legMin: 700, lip: 15, keeperUp: 44, keeperW: 75, tabT: 6, tabLen: 80 };
// 연결부 부속. 준비물 목록에도 같은 이름으로 넣어 한 번만 센다. 락핀 구멍은 M10 볼트 구멍과 같은 11mm (드릴 비트 하나로)
const RACK_CLAMP = { name: 'J클램프 (적재함 울타리 철 턱을 무는 것, 캐노피·툴박스용)', unit: '개', price: 8000 };
const RACK_BOLT = { name: '다리 고정 볼트 M10x100 (너트·와셔 포함)', unit: '세트', price: 1000, dia: 11, len: 100 };
const RACK_PIN = { name: '스프링 락핀 10mm (다리 길이·가로대)', unit: '개', price: 3000, dia: 11, len: 60 };

function rackGeo(p, m) {
  const [s] = sec(m.frame);
  const [si] = sec(m.inner);
  const L = p.width;
  const D = p.depth;
  const railTop = p.railH;
  const floorY = railTop - RACK.bedDepth;
  const Ls = L - 100;
  // 미닫이 틀은 최소 500 은 고정 틀에 걸쳐 있어야 한다
  const E = Math.max(0, Math.min(p.extend, Ls - RACK.keep));
  const open = E > 0;
  const legs = E >= RACK.legMin;
  const rearEnd = E + Ls / 2;
  const rungs = Math.max(3, Math.round(Ls / 400) + 1);
  const legZ = D / 2 - s / 2 - RACK.tabT - s / 2;   // 미닫이 긴 대 안쪽 면의 볼트 탭에 겹쳐 닮
  const braceLen = 2 * legZ - si;                     // 속대 안쪽 면 사이
  const braceY = Math.min(400, railTop + 2 * s - RACK.leg - 30); // 울타리가 낮으면 겉대 아래로 내린다
  return { s, si, L, D, railTop, floorY, Ls, E, open, legs, rearEnd, rungs, legZ, braceLen, braceY };
}

export const truckRack = {
  id: 'truck-rack', name: '픽업 적재함 접이식 철제 랙 (슬라이딩 베드 위)', category: 'outdoor', trend: true, difficulty: 3, laborHours: 10,
  summary: '울타리 위에 걸쳐 조이는 철제 틀. 뒤로 뽑고 2단 다리를 달아 내리면 차 뒤에 지붕 있는 공간이 생겨요. 접으면 울타리 위 12cm 안에 들어가요.',
  keywords: ['픽업', '픽업트럭', '픽업랙', '적재함', '적재함선반', '롤바', '베드랙', '트럭선반', '트럭랙', '레인저', '타스만', '렉스턴', '콜로라도'],
  params: [
    { key: 'width', label: '틀 길이 (적재함 길이)', unit: 'mm', min: 1300, max: 1900, step: 10, default: 1540 },
    { key: 'depth', label: '틀 폭 (울타리 중심 사이)', unit: 'mm', min: 1400, max: 1800, step: 10, default: 1600 },
    { key: 'extend', label: '뽑은 길이 (0이면 접은 모습, 700부터 다리)', unit: 'mm', min: 0, max: 1000, step: 50, default: 800 },
    { key: 'railH', label: '땅에서 울타리 위까지', unit: 'mm', min: 1100, max: 1500, step: 10, default: 1420 }
  ],
  materialOptions: { frame: ['sq_tube_40'], inner: ['sq_tube_30'], keeper: ['flat_bar_75'], lip: ['flat_bar_40'], ref: ['ref_truck'] },
  build(p, m) {
    const b = builder();
    const { s, si, L, D, railTop, floorY, Ls, E, open, legs, rearEnd, rungs, legZ, braceLen, braceY } = rackGeo(p, m);
    const half = D / 2;

    // 참고용 트럭 (만들지 않음): 적재함, 캡, 휠하우스, 뒷범퍼, 테일게이트, 슬라이딩 베드
    const Lb = L + 40;
    const Win = D - RACK.wall;
    b.add('적재함 바닥', m.ref, [Lb, 20, Win], [0, floorY - 10, 0]);
    for (const sz of [-1, 1]) b.add('적재함 옆벽', m.ref, [Lb, RACK.bedDepth, RACK.wall], [0, floorY + RACK.bedDepth / 2, sz * half]);
    b.add('적재함 앞벽', m.ref, [RACK.wall, RACK.bedDepth, D + RACK.wall], [-Lb / 2 - RACK.wall / 2, floorY + RACK.bedDepth / 2, 0]);
    const cabBottom = floorY - 250;
    const cabTop = 1880;
    b.add('캡', m.ref, [1300, cabTop - cabBottom, D + 170], [-Lb / 2 - RACK.wall - 650, (cabTop + cabBottom) / 2, 0]);
    const archW = Math.max(60, (Win - 1224) / 2);
    for (const sz of [-1, 1]) b.add('휠하우스', m.ref, [600, 250, archW], [0, floorY + 125, sz * (half - RACK.wall / 2 - archW / 2)]);
    b.add('뒷범퍼', m.ref, [200, 250, D - 100], [Lb / 2 + 100, floorY - 325, 0]);
    if (open) b.add('테일게이트', m.ref, [RACK.bedDepth, 40, Win], [Lb / 2 + RACK.bedDepth / 2, floorY - 20, 0]);
    else b.add('테일게이트', m.ref, [40, RACK.bedDepth, Win], [Lb / 2 + 20, floorY + RACK.bedDepth / 2, 0]);
    const deckL = L - 160;
    b.add('슬라이딩 베드', m.ref, [deckL, 50, Math.min(1104, Win - 120)], [open ? Math.min(E, deckL * 0.7) : 0, floorY + 25, 0]);

    // 고정 틀: 울타리 위에 얹는 사다리 틀. 가로대는 긴 대 안쪽 면 사이(D - s)
    for (const sz of [-1, 1]) b.add('고정 틀 긴 대', m.frame, [L, s, s], [0, railTop + s / 2, sz * half], { note: '울타리 위에 얹고 클램프 6개로 조임. 순정 베드 레일과 겹치면 안쪽으로' });
    // 뒤 가로대는 미닫이 다리 탭이 지나가도록 뒤끝에서 200 앞에
    for (const x of [-(L / 2 - s / 2), 0, L / 2 - 200]) b.add('고정 가로대', m.frame, [s, s, D - s], [x, railTop + s / 2, 0]);
    // 덮개 키퍼: 세로(평철 75x6)는 고정 긴 대 바깥 면에 붙어 미닫이 윗면보다 4mm 위까지 서고, 윗날(평철 40x4)이 미닫이 긴 대 바깥 위 모서리를 15mm 덮는다
    const keeperTop = s + RACK.keeperUp;
    for (const sz of [-1, 1]) {
      b.add('덮개 키퍼 세로', m.keeper, [L, RACK.keeperW, RACK.tabT], [0, railTop + keeperTop - RACK.keeperW / 2, sz * (half + s / 2 + RACK.tabT / 2)], { note: '고정 긴 대 바깥 면에 세워 붙임 (윗면이 미닫이보다 4mm 위)' });
      b.add('덮개 키퍼 윗날', m.lip, [L, 4, 40], [0, railTop + keeperTop + 2, sz * (half + s / 2 + 5)], { note: '세로 위에 눕혀 붙여 미닫이 틀이 들리거나 옆으로 빠지지 않게' });
    }

    // 미닫이 틀: 고정 틀 위에 얹혀 뒤로 뽑힘. 뒤 가로살은 다리 볼트 자리를 비우려고 100 앞에
    const ySlide = railTop + 1.5 * s;
    for (const sz of [-1, 1]) b.add('미닫이 틀 긴 대', m.frame, [Ls, s, s], [E, ySlide, sz * half], { note: '뒤끝 안쪽 면에 다리 볼트 구멍 M10 2개' });
    spread(rungs, E - Ls / 2 + s / 2, rearEnd - 100).forEach(x => b.add('미닫이 가로살', m.frame, [s, s, D - s], [x, ySlide, 0]));
    // 다리 볼트 탭: 미닫이 뒤끝 안쪽 면에 평철 75x6 을 세워 붙여 다리 겉대를 볼트 2개로 단다
    for (const sz of [-1, 1]) b.add('다리 볼트 탭', m.keeper, [RACK.tabLen, RACK.keeperW, RACK.tabT], [rearEnd - RACK.tabLen / 2, railTop + 2 * s - RACK.keeperW / 2, sz * (half - s / 2 - RACK.tabT / 2)], { note: '미닫이 긴 대 뒤끝 안쪽 면에 붙임. 위 25mm·60mm 에 M10 구멍' });

    // 2단 다리: 700 이상 뽑았을 때 미닫이 뒤끝 안쪽 면에 볼트로 달아 땅까지. 덜 뽑았거나 접었을 땐 가로살 위에 눕혀 묶어 둔다
    const Lo = RACK.leg;
    const Li = RACK.leg;
    if (legs) {
      for (const sz of [-1, 1]) {
        b.add('다리 겉대', m.frame, [s, Lo, s], [rearEnd - RACK.tabLen / 2, railTop + 2 * s - Lo / 2, sz * legZ], { note: '위 75mm 를 볼트 탭에 겹쳐 M10 볼트 2개로' });
        b.add('다리 속대', m.inner, [si, Li, si], [rearEnd - RACK.tabLen / 2, RACK.foot + Li / 2, sz * legZ], { note: '겉대 안에서 땅까지 빼고 락핀으로 고정, 아래에 조절발' });
      }
      b.add('다리 가로대', m.inner, [si, si, braceLen], [rearEnd - RACK.tabLen / 2, braceY, 0], { note: '속대 사이에 핀으로 끼움' });
    } else {
      for (const sz of [-1, 1]) {
        b.add('다리 겉대', m.frame, [Lo, s, s], [rearEnd - 570, railTop + 2.5 * s, sz * (half - 150)], { note: '가로살 위에 눕혀 래칫 스트랩으로 묶음' });
        b.add('다리 속대', m.inner, [Li, si, si], [rearEnd - 570, railTop + 2.5 * s, sz * (half - 150)], { note: '겉대 안에 넣어 둔 상태' });
      }
      b.add('다리 가로대', m.inner, [si, si, braceLen], [rearEnd - 100, railTop + 2 * s + si / 2, 0], { note: '뒤 가로살 위에 눕혀 둠' });
    }
    return b.parts;
  },
  // 연결부 지정: 클램프(참고용 옆벽에), 다리 볼트 탭 M10 2개(세웠을 때), 속대 락핀, 가로대 핀. 미닫이와 고정 틀은 서로 붙이지 않는다.
  // 순서 번호는 아래 steps 의 몇 번째 줄인지 (5 다리 만들기, 7 차에 올리기, 8 써 보기)
  joints(parts) {
    const byId = new Map(parts.map(x => [x.id, x]));
    const out = [];
    for (const n of [1, 2]) {
      const rail = byId.get(`고정 틀 긴 대-${n}`);
      // 클램프 표시는 고정 틀 긴 대 밑면과 울타리 윗면이 만나는 곳
      if (rail) out.push({ a: `고정 틀 긴 대-${n}`, b: `적재함 옆벽-${n}`, type: 'clamp', fastener: RACK_CLAMP, qty: 3, at: [rail.pos[0], rail.pos[1] - rail.size[1] / 2, rail.pos[2]], axis: 0, note: '울타리 철 턱을 물림. 뒤쪽 클램프는 뒤끝에서 150 이상 앞', step: 7 });
      const tab = byId.get(`다리 볼트 탭-${n}`);
      const leg = byId.get(`다리 겉대-${n}`);
      if (!tab || !leg) continue;
      out.push({ a: `다리 속대-${n}`, b: `다리 겉대-${n}`, type: 'pin', fastener: RACK_PIN, qty: 1, note: '겉대 아래쪽 구멍 중 높이에 맞는 것', step: 5 });
      // 다리를 세웠을 때만 (겉대가 세로로 섬): 볼트 탭에 M10 2개, 가로대는 속대 사이에 핀으로
      if (leg.size[1] > leg.size[0]) {
        const top = tab.pos[1] + tab.size[1] / 2;
        out.push({
          a: `다리 겉대-${n}`, b: `다리 볼트 탭-${n}`, type: 'bolt', qty: 2, fastener: RACK_BOLT,
          holes: [25, 60].map(dy => ({ at: [tab.pos[0], top - dy, tab.pos[2]], axis: 2, dia: 11, parts: [`다리 겉대-${n}`, `다리 볼트 탭-${n}`] })),
          note: '탭 위에서 25·60mm', step: 8
        });
        out.push({ a: '다리 가로대-1', b: `다리 속대-${n}`, type: 'pin', fastener: RACK_PIN, qty: 1, note: '속대 사이에 핀으로 끼움', step: 8 });
      }
    }
    return out;
  },
  // 미닫이·다리 쪽과 고정 틀·덮개 쪽은 미끄러져야 하므로 붙이지 않는다. 다리(볼트 탭 포함)가 가로살에 닿는 곳도 붙이지 않는다 (접은 다리는 스트랩으로 묶기만)
  jointRules(pa, pb) {
    const slide = n => /^(미닫이|다리)/.test(n);
    const fixed = n => /^(고정|덮개)/.test(n);
    if ((slide(pa.name) && fixed(pb.name)) || (fixed(pa.name) && slide(pb.name))) return false;
    if ((/^다리/.test(pa.name) && pb.name === '미닫이 가로살') || (/^다리/.test(pb.name) && pa.name === '미닫이 가로살')) return false;
    return null;
  },
  // 클램프·볼트·다리 락핀은 연결부와 같은 이름 (준비물에서 한 번만). 미닫이 잠금 락핀은 미닫이와 고정 틀 사이라 연결부로 세지 않아 따로 둔다
  hardware: () => [
    { name: RACK_CLAMP.name, qty: 6, unit: RACK_CLAMP.unit, price: RACK_CLAMP.price },
    { name: RACK_BOLT.name, qty: 4, unit: RACK_BOLT.unit, price: RACK_BOLT.price },
    { name: RACK_PIN.name, qty: 4, unit: RACK_PIN.unit, price: RACK_PIN.price },
    { name: '스프링 락핀 10mm (미닫이 잠금)', qty: 2, unit: '개', price: 3000 },
    { name: '조절발 M12 (다리 아래)', qty: 2, unit: '개', price: 3000 },
    { name: 'D링 고리 (타포린 묶기)', qty: 8, unit: '개', price: 1500 },
    { name: '래칫 스트랩 25mm 5m (짐·접은 다리 묶기)', qty: 2, unit: '개', price: 5000 },
    { name: '미끄럼 테이프(UHMW) 또는 그리스', qty: 1, unit: '개', price: 5000 },
    { name: '징크 스프레이 420ml', qty: 1, unit: '캔', price: 7000 },
    { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 }
  ],
  tools: [...METAL_TOOLS, '드릴 비트 11mm(볼트·락핀 구멍)', '줄자(차 치수 재기)', '스패너 세트'],
  safety: [
    ...METAL_SAFETY,
    '와일드트랙 순정 베드 레일·스포츠바와 겹치는지 먼저 확인하세요. 겹치면 고정 틀을 레일 안쪽으로 옮겨요',
    '클램프는 플라스틱 덮개가 아니라 그 밑 철 턱을 물려야 해요. 첫 운행 뒤 다시 조이세요',
    '짐은 틀 위에 고르게 놓고 래칫 스트랩으로 묶으세요',
    '달리기 전에 미닫이 락핀 2개를 잠그고 다리는 떼어 묶어 두세요',
    '다리는 700mm 이상 뽑았을 때만 세울 수 있어요 (덜 뽑으면 열린 테일게이트 위예요). 세우기 전에는 틀 끝에 짐을 올리지 마세요',
    '랙 위에 사람이 올라가지 마세요. 차 적재량(레인저 약 600kg) 안에서 쓰세요',
    '떼었다 붙일 수 있는 랙이지만 구조변경 신고 대상인지는 한국교통안전공단에 확인하세요. 계산값은 참고용이에요'
  ],
  steps(p, m = { frame: 'sq_tube_40', inner: 'sq_tube_30', keeper: 'flat_bar_75', lip: 'flat_bar_40', ref: 'ref_truck' }) {
    const g = rackGeo(p, m);
    const mm = v => Math.round(v);
    const s = g.s;
    return [
      '차를 먼저 잽니다. 적재함 길이, 울타리 중심 사이 폭, 땅에서 울타리 위까지 높이를 재서 슬라이더에 넣습니다. 순정 베드 레일·스포츠바 자리를 확인하고, 슬라이딩 베드가 뽑히는 길 안쪽에는 아무것도 두지 않습니다.',
      `각파이프 ${s}x${s} 을 자릅니다. 고정 긴 대 ${mm(g.L)}mm 2개, 고정 가로대 ${mm(g.D - s)}mm 3개, 미닫이 긴 대 ${mm(g.Ls)}mm 2개, 미닫이 가로살 ${mm(g.D - s)}mm ${g.rungs}개, 다리 겉대 ${RACK.leg}mm 2개. 30x30 은 다리 속대 ${RACK.leg}mm 2개, 다리 가로대 ${mm(g.braceLen)}mm 1개. 평철 75x6 은 덮개 키퍼 세로 ${mm(g.L)}mm 2개와 다리 볼트 탭 ${RACK.tabLen}mm 2개, 평철 40x4 는 덮개 윗날 ${mm(g.L)}mm 2개.`,
      `고정 틀을 용접합니다. 긴 대 2개 사이에 가로대 3개를 넣어 사다리 모양으로 만듭니다(뒤 가로대는 뒤끝에서 200mm 앞, 다리 탭이 지나가는 자리). 바깥 면에 평철 75x6 을 세워 붙여 윗면이 미닫이 틀보다 4mm 위에 오게 하고, 그 위에 평철 40x4 를 눕혀 붙여 안쪽으로 ${RACK.lip}mm 나오게 합니다(ㄱ자 덮개 키퍼). 윗면에는 미끄럼 테이프를 붙입니다.`,
      `미닫이 틀을 용접합니다. 긴 대 2개 사이에 가로살 ${g.rungs}개. 뒤 가로살은 뒤끝에서 100mm 앞에 둡니다. 뒤끝 안쪽 면에 평철 75x6 볼트 탭(80mm)을 세워 붙이고 위 25mm·60mm 에 M10 구멍을 뚫습니다. 긴 대 앞쪽에 락핀 구멍(11mm)을 뚫습니다.`,
      '다리를 만듭니다. 40x40 겉대 안에 30x30 속대를 넣고, 100mm 간격으로 락핀 구멍(11mm)을 뚫어 길이를 맞춥니다. 겉대 위 25mm·60mm 에 M10 구멍, 속대 아래에 조절발을 답니다.',
      '용접 자국을 갈고 탈지한 뒤 방청 페인트를 칠합니다. 용접 자리와 구멍 둘레는 징크 스프레이로 한 번 더.',
      '차에 올립니다. 고정 틀을 울타리 위에 얹고 J클램프 6개로 울타리 철 턱을 물어 조입니다(뒤쪽 클램프는 뒤끝에서 150mm 이상 앞에. 그 뒤로는 다리 볼트 탭이 지나가요). 미닫이 틀을 뒤에서 덮개 키퍼 밑으로 밀어 넣고 락핀 2개로 잠급니다. 다리와 가로대는 가로살 위에 눕혀 래칫 스트랩으로 묶습니다.',
      `써 봅니다. 테일게이트를 열고 미닫이 틀을 ${RACK.legMin}mm 이상(기본 ${mm(Math.max(RACK.legMin, Math.min(800, g.Ls - RACK.keep)))}mm) 뽑아 락핀을 꽂습니다. 다리 겉대를 볼트 탭에 M10 볼트 2개로 달고, 속대를 빼서 땅에 맞춘 뒤 가로대를 끼웁니다. 흔들림이 없는지 확인한 뒤에 짐을 올리거나 타포린을 D링에 묶습니다.`
    ];
  }
};

export const OUTDOOR_TEMPLATES = [raisedBed, firewoodRack, hammockStand, truckRack];

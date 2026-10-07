// 준비물 체크리스트와 비용
import { MATERIALS } from './materials.js';
import { clampParams } from './model.js';
import { usageOf } from './cutlist.js';
import { WOOD_TOOLS } from './templates/wood.js';
import { METAL_TOOLS, METAL_SAFETY } from './templates/metal.js';
import { SAFETY_BASE } from './templates/helpers.js';

const area = p => 2 * (p.size[0] * p.size[1] + p.size[1] * p.size[2] + p.size[0] * p.size[2]) / 1e6;

function mergeByName(list) {
  const map = new Map();
  for (const x of list) {
    const prev = map.get(x.name);
    if (prev) prev.qty += x.qty;
    else map.set(x.name, { ...x });
  }
  return [...map.values()];
}

function priced(prefix, list) {
  return list.map(x => {
    const price = x.price || 0;
    return { id: `${prefix}:${x.name}`, name: x.name, qty: x.qty, unit: x.unit, price, cost: Math.round(price * x.qty) };
  });
}

export function buildBom(design, parts, cut, template, priceOverrides = {}) {
  const groups = new Set(parts.map(p => MATERIALS[p.material]?.group));
  const hasWood = groups.has('wood');
  const hasMetal = groups.has('metal');

  // 자재 (원장 수량)
  const materials = Object.entries(cut.stock).map(([key, s]) => ({
    id: `mat:${key}`, name: s.name, qty: s.qty, unit: s.unit, price: s.price, cost: s.cost
  }));

  // 부속
  let hw = [];
  if (template && template.id !== 'custom') {
    const base = parts.filter(p => !p.extra);
    hw = template.hardware(base, clampParams(template, design.params || {}).params);
  } else if (Array.isArray(design.aiHardware)) {
    hw = design.aiHardware.filter(h => h && h.name && h.qty > 0).map(h => ({ unit: '개', price: 0, ...h }));
  }
  const extras = parts.filter(p => p.extra || !template || template.id === 'custom');
  const extraWood = extras.filter(p => MATERIALS[p.material]?.group === 'wood').length;
  const extraMetal = extras.filter(p => MATERIALS[p.material]?.group === 'metal').length;
  if (extraWood) hw.push({ name: '목공 피스 65mm', qty: extraWood * 4, unit: '개', price: 15 });
  if (extraMetal && !hw.some(h => h.name.startsWith('용접봉'))) hw.push({ name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 });
  const hardware = priced('hw', mergeByName(hw));

  // 마감재
  const finish = [];
  const woodArea = parts.filter(p => MATERIALS[p.material]?.group === 'wood').reduce((s, p) => s + area(p), 0);
  const metalArea = parts.filter(p => MATERIALS[p.material]?.group === 'metal').reduce((s, p) => s + area(p), 0);
  if (hasWood) {
    finish.push({ name: '오일스테인 또는 수성 바니쉬', qty: Math.max(1, Math.ceil(woodArea * 2 / 10)), unit: 'L', price: 6000 });
    finish.push({ name: '사포 세트(120·220방)', qty: 1, unit: '세트', price: 3000 });
  }
  if (hasMetal) {
    const fire = template?.category === 'fire';
    finish.push(fire
      ? { name: '내열 페인트 스프레이(600도)', qty: Math.max(1, Math.ceil(metalArea / 1.5)), unit: '캔', price: 8000 }
      : { name: '락카 스프레이(무광)', qty: Math.max(1, Math.ceil(metalArea / 1.5)), unit: '캔', price: 4000 });
    finish.push({ name: '탈지제(신너)', qty: 1, unit: '통', price: 4000 });
  }
  const finishItems = priced('fin', finish);

  // 공구·안전장비
  const toolNames = new Set(template?.tools || []);
  if (hasWood && (!template || template.id === 'custom' || extraWood)) WOOD_TOOLS.forEach(t => toolNames.add(t));
  if (hasMetal && (!template || template.id === 'custom' || extraMetal)) METAL_TOOLS.forEach(t => toolNames.add(t));
  const safetyNames = new Set([...SAFETY_BASE, ...(template?.safety || [])]);
  if (hasMetal) METAL_SAFETY.forEach(s => safetyNames.add(s));

  const tools = [...toolNames].map(name => ({ id: `tool:${name}`, name }));
  const safety = [...safetyNames].map(name => ({ id: `safe:${name}`, name }));

  const materialCost = materials.reduce((s, x) => s + x.cost, 0);
  const extraCost = hardware.reduce((s, x) => s + x.cost, 0) + finishItems.reduce((s, x) => s + x.cost, 0);
  const total = materialCost + extraCost;
  // 남는 자투리를 다음 작품에 쓴다고 보면, 실제로 쓴 만큼의 자재값
  const usedMaterialCost = Math.round(Object.entries(cut.stock).reduce((s, [key, st]) => s + st.cost * Math.min(1, usageOf(cut, key)), 0));
  const usedTotal = usedMaterialCost + extraCost;
  return { materials, hardware, finish: finishItems, tools, safety, materialCost, total, usedTotal, woodArea, metalArea };
}

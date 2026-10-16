// "이 설계 고치기" 적용: 고치기 목록(edit)을 지금 설계에 적용한 새 설계를 돌려준다 (원본은 바꾸지 않는다).
// 무료 규칙(parser.js 의 parseEdit)과 AI 고치기(ai.js 의 validateEditResult) 결과를 같은 길로 적용한다.
// edit = { params, adjusted, materials, title, remove, move, rename, note, add } (모두 없어도 된다)
// 설계 id·템플릿은 그대로라 슬라이더와 되돌리기(Ctrl+Z)가 살아 있다
import { MATERIALS } from './materials.js';
import { clampParams, resolveMaterials, partBox, liftToFloor, isRef, slotOptions } from './model.js';
import { slotLabel } from './prompts.js';
import { josa, changeLine, clampLine } from './parser.js';

const list = v => (Array.isArray(v) ? v : []);
const fmt = v => String(Math.round(Number(v) * 10) / 10);
// AI 가 준 옮김 값: 0.1mm 까지, 아주 작은 값과 -0 은 0
const delta = v => (Math.abs(Number(v)) >= 0.05 ? Math.round(Number(v) * 10) / 10 : 0);
// 옮기는 방향 글자 [양수, 음수]: x 오른쪽·왼쪽, y 위·아래, z 앞(+z)·뒤
const DIRS = [['오른쪽', '왼쪽'], ['위로', '아래로'], ['앞으로', '뒤로']];
// 줄에 쓰는 부품 이름: 템플릿 부품은 id(다리-3), 이름을 바꿨으면 바꾼 이름도. 추가 부품은 '이름'
const partLabel = p => (p.extra ? `'${p.name}'` : p.origName && p.name !== p.origName ? `${p.id} (${p.name})` : p.id);

export function applyEdit(design, edit = {}, { template = null, parts = [] } = {}) {
  const next = structuredClone(design);
  const lines = [];
  const unknown = [];
  const t = template;
  const e = edit && typeof edit === 'object' ? edit : {};

  // 1) 치수: 범위에 맞춘다. AI 가 이미 맞춘 값은 adjusted 의 원래 값으로 범위 줄을 쓴다
  const given = Object.entries(e.params || {});
  if (given.length) {
    const tp = t?.params || [];
    const before = tp.length ? clampParams(t, design.params || {}).params : {};
    const want = {};
    for (const [k, v] of given) {
      const p = tp.find(x => x.key === k);
      if (!p) unknown.push(`'${k}' 치수는 이 작품에 없어요`);
      else if (!Number.isFinite(Number(v))) unknown.push(`${p.label} 값이 숫자가 아니라서 건너뛰었어요`);
      else want[k] = Number(v);
    }
    if (Object.keys(want).length) {
      const { params: c, adjusted } = clampParams(t, { ...before, ...want });
      next.params = c;
      const asked = Object.fromEntries(list(e.adjusted).filter(a => a && Number.isFinite(Number(a.value))).map(a => [a.key, Number(a.value)]));
      for (const p of tp) {
        if (!(p.key in want)) continue;
        if (adjusted.includes(p.key)) lines.push(clampLine(p, want[p.key], c[p.key]));
        else if (p.key in asked && asked[p.key] !== c[p.key]) lines.push(clampLine(p, asked[p.key], c[p.key]));
        else if (c[p.key] !== before[p.key]) lines.push(changeLine(p, before[p.key], c[p.key]));
      }
    }
  }

  // 2) 자재: 그 칸에서 고를 수 있는 것만 (없는 칸·__proto__ 같은 이름은 고르지 않는다)
  const mats = t ? resolveMaterials(t, design) : {};
  for (const [slot, key] of Object.entries(e.materials || {})) {
    const opts = slotOptions(t, slot);
    if (!opts) { unknown.push(`${slotLabel(slot)} 자재는 이 작품에서 고를 수 없어요`); continue; }
    if (!opts.includes(key)) {
      const n = typeof key === 'string' && Object.hasOwn(MATERIALS, key) ? MATERIALS[key].name : String(key);
      unknown.push(`${slotLabel(slot)} 자재로 ${n}${josa(n, '은', '는')} 고를 수 없어요`);
      continue;
    }
    if (mats[slot] === key) continue;
    next.materials = { ...(next.materials || {}), [slot]: key };
    lines.push(`${slotLabel(slot)} 자재: ${MATERIALS[mats[slot]].name} 에서 ${MATERIALS[key].name} ${josa(MATERIALS[key].name, '으로', '로')}`);
  }

  // 3) 작품 이름
  if (typeof e.title === 'string' && e.title.trim()) {
    const name = e.title.trim().slice(0, 40);
    if (name !== design.title) {
      next.title = name;
      lines.push(`이름 '${design.title}' 에서 '${name}'${josa(name, '으로', '로')}`);
    }
  }

  // 부품 고치기: 지금 부품 목록(parts)에 있는 것만. 참고용은 고치지 않는다
  const byId = new Map(parts.filter(p => !isRef(p)).map(p => [p.id, p]));
  const refIds = new Set(parts.filter(isRef).map(p => p.id));
  const findPart = rawId => {
    const id = String(rawId ?? '');
    const p = byId.get(id);
    if (!p) unknown.push(refIds.has(id) ? `'${id}'${josa(id, '은', '는')} 참고용 부품이라 고치지 않았어요` : `'${id}' 부품은 목록에 없어서 건너뛰었어요`);
    return p || null;
  };
  const extraOf = id => list(next.extraParts).find(x => x.id === id);
  // 이번에 뺀 부품은 옮기기·이름 바꾸기를 하지 않는다
  const gone = new Set();

  // 4) 빼기: 템플릿 부품은 removed 에 (되살릴 수 있게), 추가 부품은 지운다
  for (const rawId of list(e.remove)) {
    if (gone.has(String(rawId))) continue;
    const p = findPart(rawId);
    if (!p) continue;
    if (p.extra) next.extraParts = list(next.extraParts).filter(x => x.id !== p.id);
    else next.removed = [...new Set([...list(next.removed), p.id])];
    gone.add(p.id);
    lines.push(`${partLabel(p)} 뺌`);
  }

  // 5) 옮기기: 템플릿 부품은 moved 에 더하고, 추가 부품은 pos 에. 가장 낮은 곳이 바닥 아래로 가면 바닥에 맞춘다
  const shiftY = {};
  for (const mv of list(e.move)) {
    if (!mv || gone.has(String(mv.id))) continue;
    const p = findPart(mv.id);
    if (!p) continue;
    const d = [mv.dx, mv.dy, mv.dz].map(delta);
    const low = partBox(p).min[1] + (shiftY[p.id] || 0);
    let floor = false;
    if (low + d[1] < 0) {
      d[1] = Math.abs(low) >= 0.05 ? -low : 0;
      floor = true;
    }
    if (d.every(v => !v)) {
      if (floor) unknown.push(`${partLabel(p)}: 바닥보다 아래로는 못 내려가요`);
      continue;
    }
    if (p.extra) {
      const ep = extraOf(p.id);
      if (!ep) continue;
      ep.pos = ep.pos.map((v, i) => v + d[i]);
      liftToFloor(ep);
    } else {
      const cur = [0, 1, 2].map(i => Number(next.moved?.[p.id]?.[i]) || 0);
      next.moved = { ...(next.moved || {}), [p.id]: cur.map((v, i) => v + d[i]) };
    }
    shiftY[p.id] = (shiftY[p.id] || 0) + d[1];
    const words = d.map((v, i) => (v ? `${DIRS[i][v > 0 ? 0 : 1]} ${fmt(Math.abs(v))}mm` : '')).filter(Boolean);
    lines.push(`${partLabel(p)} ${words.join(', ')} 옮김${floor ? ' (바닥보다 아래로는 못 가서 바닥에 맞췄어요)' : ''}`);
  }

  // 6) 이름·메모 (design.partEdits[id], 앱의 부품 카드와 같은 규칙: 이름 40자, 메모 200자, 원래 이름이면 지움)
  const setEdit = (p, key, v) => {
    next.partEdits = next.partEdits && typeof next.partEdits === 'object' ? next.partEdits : {};
    const cur = { ...next.partEdits[p.id] };
    if (key === 'name' && v === (p.origName || p.name)) delete cur.name;
    else cur[key] = v;
    if (Object.keys(cur).length) next.partEdits[p.id] = cur;
    else delete next.partEdits[p.id];
  };
  for (const rn of list(e.rename)) {
    if (!rn || gone.has(String(rn.id))) continue;
    const p = findPart(rn.id);
    const v = String(rn.name ?? '').trim().slice(0, 40);
    if (!p || !v || v === p.name) continue;
    setEdit(p, 'name', v);
    lines.push(`${partLabel(p)} 이름을 '${v}'${josa(v, '으로', '로')} 바꿈`);
  }
  for (const nt of list(e.note)) {
    if (!nt || gone.has(String(nt.id))) continue;
    const p = findPart(nt.id);
    const v = String(nt.note ?? '').trim().slice(0, 200);
    if (!p || !v) continue;
    setEdit(p, 'note', v);
    lines.push(`${partLabel(p)} 메모: ${v.length > 40 ? `${v.slice(0, 40)}…` : v}`);
  }

  // 7) 추가: 끝에 붙인다. 부품 검증은 부른 쪽(validateEditResult)이 하고, 여기서는 id 를 겹치지 않게, 바닥 아래면 올린다.
  //    지운 부품의 이름·메모(partEdits), 옮김(moved), 연결부 수정(jointEdits) 기록이 남은 id 도 쓰지 않는다 (새 부품이 물려받지 않게)
  const jointPartIds = Object.keys(next.jointEdits || {}).flatMap(k => k.split('|').slice(0, -1));
  const taken = new Set([
    ...parts.map(p => p.id), ...list(next.extraParts).map(p => p.id), ...list(next.removed),
    ...Object.keys(next.partEdits || {}), ...Object.keys(next.moved || {}), ...jointPartIds
  ]);
  for (const raw of list(e.add)) {
    const ok = raw && typeof raw.material === 'string' && Object.hasOwn(MATERIALS, raw.material) && Array.isArray(raw.size) && raw.size.length === 3 && Array.isArray(raw.pos) && raw.pos.length === 3;
    const name = String(raw?.name || '부품').trim().slice(0, 40) || '부품';
    if (!ok) { unknown.push(`'${name}' 부품은 자재나 크기가 맞지 않아서 넣지 않았어요`); continue; }
    const { extra, origName, userNote, ...clean } = structuredClone(raw);
    let id = clean.id && !taken.has(String(clean.id)) ? String(clean.id) : '';
    for (let n = 1; !id; n++) if (!taken.has(`ai-${name}-${n}`)) id = `ai-${name}-${n}`;
    taken.add(id);
    const part = liftToFloor({ shape: 'box', note: '', ...clean, name, id });
    next.extraParts = [...list(next.extraParts), part];
    lines.push(`'${name}' 추가 (${MATERIALS[part.material].name} ${part.size.map(v => Math.round(v)).join('x')})`);
  }

  return { design: next, lines, unknown };
}

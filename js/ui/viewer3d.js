// 3D 화면: 부품 보기, 클릭 선택, 선택한 부품 끌어 옮기기 (Shift = 위아래), 연결부 표식 보기·누르기
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MATERIALS, materialProfile, longAxis } from '../core/materials.js';
import { hasRot, rotOf, isRef } from '../core/model.js';

const S = 0.001; // mm -> m
const SNAP = 10; // mm

// 아래쪽 가운데를 따내 다리 2개가 생긴 철판 (조립식 화로 벽판)
function notchedPlate(w, h, d) {
  const thinX = w < d;
  const len = thinX ? d : w;
  const t = thinX ? w : d;
  const leg = Math.min(0.06, len * 0.15);
  const notch = Math.min(0.08, h * 0.25);
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -h / 2);
  s.lineTo(-len / 2 + leg, -h / 2);
  s.lineTo(-len / 2 + leg + notch * 0.5, -h / 2 + notch);
  s.lineTo(len / 2 - leg - notch * 0.5, -h / 2 + notch);
  s.lineTo(len / 2 - leg, -h / 2);
  s.lineTo(len / 2, -h / 2);
  s.lineTo(len / 2, h / 2);
  s.lineTo(-len / 2, h / 2);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  if (thinX) geo.rotateY(Math.PI / 2);
  return geo;
}

// 둥근 자재: 가장 긴 방향을 축으로 한 원기둥 (지름 = 나머지 두 변 중 작은 값)
function roundRod(w, h, d) {
  const dims = [w, h, d];
  const axis = longAxis(dims);
  const r = Math.min(...dims.filter((_, i) => i !== axis)) / 2;
  const geo = new THREE.CylinderGeometry(r, r, dims[axis], 24);
  if (axis === 0) geo.rotateZ(Math.PI / 2);
  else if (axis === 2) geo.rotateX(Math.PI / 2);
  return geo;
}

// 앵글: 가장 긴 방향으로 뻗은 ㄱ자 단면 (t = 두께)
function angleBar(w, h, d, t) {
  const dims = [w, h, d];
  const axis = longAxis(dims);
  // x 축으로 뻗을 때는 돌린 뒤 단면 가로가 z, 세로가 y 가 되므로 깊이·높이 순서로 잡는다
  const [a, b] = axis === 0 ? [d, h] : dims.filter((_, i) => i !== axis);
  const s = new THREE.Shape();
  s.moveTo(-a / 2, -b / 2);
  s.lineTo(a / 2, -b / 2);
  s.lineTo(a / 2, -b / 2 + t);
  s.lineTo(-a / 2 + t, -b / 2 + t);
  s.lineTo(-a / 2 + t, b / 2);
  s.lineTo(-a / 2, b / 2);
  s.closePath();
  const len = dims[axis];
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  // 단면(x,y) 을 남은 두 축에, 뽑은 방향(z) 을 긴 축에 맞춘다
  if (axis === 0) geo.rotateY(Math.PI / 2);
  else if (axis === 1) geo.rotateX(-Math.PI / 2);
  return geo;
}

// 반원 아치: 앞(+z)에서 보면 반원 고리(wall 이 있으면 속이 빈 아치), 깊이만큼 뒤로 뽑는다. 평평한 면이 아래
function barrel(w, h, d, wall) {
  const R = w / 2;
  const r = wall > 0 ? Math.max(0, R - wall) : 0;
  const s = new THREE.Shape();
  s.moveTo(R, 0);
  s.absarc(0, 0, R, 0, Math.PI, false);
  if (r > 0) {
    s.lineTo(-r, 0);
    s.absarc(0, 0, r, Math.PI, 0, true);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 32 });
  geo.translate(0, -R / 2, -d / 2);
  return geo;
}

// 캐스터: 옆(x)에서 보면 위쪽 포크(사각) + 아래 바퀴(원). size = [폭 x, 전체 높이 y, 바퀴 지름 z]
function caster(w, h, d) {
  const R = d / 2;
  const half = R * 0.45;
  const yc = R - h / 2;
  const top = h / 2;
  const dy = Math.sqrt(R * R - half * half);
  const a1 = Math.atan2(dy, -half);
  const a2 = Math.atan2(dy, half);
  const s = new THREE.Shape();
  s.moveTo(-half, top);
  s.lineTo(-half, yc + dy);
  // 왼쪽 위 교점에서 바퀴 아래를 돌아 오른쪽 위 교점까지
  s.absarc(0, yc, R, a1, a2 + Math.PI * 2, false);
  s.lineTo(half, top);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

function partGeometry(p) {
  const [w, h, d] = p.size.map(v => v * S);
  // 드럼통만 위아래가 뚫린 원통, 나머지 원기둥은 막힌 모양
  if (p.shape === 'cylinder') return new THREE.CylinderGeometry(w / 2, w / 2, h, 40, 1, p.material === 'drum_200');
  if (p.shape === 'caster') return caster(w, h, d);
  if (p.shape === 'barrel') return barrel(w, h, d, (Number(p.wall) || 0) * S);
  // 바퀴: 축이 x 방향인 원기둥 (지름 = 높이)
  if (p.shape === 'wheel') return new THREE.CylinderGeometry(h / 2, h / 2, w, 28).rotateZ(Math.PI / 2);
  if (p.shape === 'notched') return notchedPlate(w, h, d);
  const prof = materialProfile(p.material);
  if (prof === 'round') return roundRod(w, h, d);
  if (prof === 'angle') return angleBar(w, h, d, (MATERIALS[p.material]?.thickness || 3) * S);
  return new THREE.BoxGeometry(w, h, d);
}

// 용접 표식: 맞닿은 직사각형 둘레 네 변 (가운데 기준 상대 좌표, m). 넓이가 없으면(템플릿이 점으로 지정) null
function weldRect(face) {
  const a = face.axis;
  const [i, k] = [(a + 1) % 3, (a + 2) % 3];
  const c = face.center;
  if (face.max[i] - face.min[i] < 1 && face.max[k] - face.min[k] < 1) return null;
  const corner = (u, v) => { const p = [0, 0, 0]; p[i] = (u - c[i]) * S; p[k] = (v - c[k]) * S; return p; };
  const pts = [corner(face.min[i], face.min[k]), corner(face.max[i], face.min[k]), corner(face.max[i], face.max[k]), corner(face.min[i], face.max[k])];
  const seg = [0, 1, 1, 2, 2, 3, 3, 0].flatMap(n => pts[n]);
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
}

export class Viewer {
  constructor(container, { onSelect, onMove } = {}) {
    this.el = container;
    this.onSelect = onSelect || (() => {});
    this.onMove = onMove || (() => {});
    this.meshes = new Map();
    this.selectedId = null;
    this.hasFit = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eef1ee');
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(2, 1.6, 2.4);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a4', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(3, 5, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    this.scene.add(sun);

    const grid = new THREE.GridHelper(6, 60, '#9aa5a0', '#cfd6d2');
    grid.position.y = 0.0005;
    this.scene.add(grid);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 연결부 표식 (구멍 구, 볼트·핀 원기둥, 용접 선, 클램프·경첩·본드 상자). 구멍은 맞닿은 면(부품 속)에 있으므로
    // 표식은 부품에 가려지지 않게 맨 위에 그린다. 재질은 표식끼리 나눠 쓰고 지울 때는 모양만 버린다
    this.markers = new THREE.Group();
    this.scene.add(this.markers);
    const onTop = { depthTest: false, depthWrite: false };
    this.markMats = {
      hole: new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 0.4, ...onTop }),
      box: new THREE.MeshStandardMaterial({ color: '#1565c0', emissive: '#1565c0', emissiveIntensity: 0.3, ...onTop }),
      // 용접 선은 어두운 철 위에서 보이게 밝은 노랑 (고른 묶음은 주황)
      weld: new THREE.LineBasicMaterial({ color: '#ffd54f', ...onTop }),
      weldOn: new THREE.LineBasicMaterial({ color: '#ff7a1a', ...onTop })
    };
    this.selectedJoint = null;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.4, 0);
    this.controls.addEventListener('change', () => this.requestRender());

    this.raycaster = new THREE.Raycaster();
    // 용접 선 누르기 여유 (기본 1 은 1m 라 너무 넓다)
    this.raycaster.params.Line.threshold = 0.006;
    this.pointer = new THREE.Vector2();
    this.drag = null;
    this.down = null;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', e => this.handleDown(e));
    dom.addEventListener('pointermove', e => this.handleMove(e));
    dom.addEventListener('pointerup', e => this.handleUp(e));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.loop();
  }

  resize() {
    const w = this.el.clientWidth || 300;
    const h = this.el.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() { this.dirty = true; }

  loop() {
    requestAnimationFrame(() => this.loop());
    const moved = this.controls.update();
    if (this.dirty || moved) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  clear() {
    for (const m of this.meshes.values()) {
      m.geometry.dispose();
      m.material.dispose();
      m.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
    }
    this.group.clear();
    this.meshes.clear();
  }

  setParts(parts, selectedId, { refit = false } = {}) {
    this.clear();
    this.selectedId = selectedId;
    for (const p of parts) {
      const geo = partGeometry(p);
      const sel = p.id === selectedId;
      const color = MATERIALS[p.material]?.color || '#cccccc';
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: MATERIALS[p.material]?.group === 'metal' ? 0.45 : 0.8,
        metalness: MATERIALS[p.material]?.group === 'metal' ? 0.5 : 0,
        emissive: sel ? '#ff7a1a' : '#000000', emissiveIntensity: sel ? 0.35 : 0,
        side: p.shape === 'cylinder' || p.shape === 'barrel' ? THREE.DoubleSide : THREE.FrontSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      // 참고용 부품(만들지 않음): 흐리게, 그림자·선 없이, 클릭 안 됨
      const ref = isRef(p);
      if (ref) { mat.transparent = true; mat.opacity = 0.35; mat.depthWrite = false; mesh.userData.ref = true; }
      mesh.position.set(p.pos[0] * S, p.pos[1] * S, p.pos[2] * S);
      // 기울인 부품 (도를 라디안으로, three.js 기본 순서 XYZ 라 도면 계산과 같다)
      if (hasRot(p)) mesh.rotation.set(...rotOf(p).map(v => (v * Math.PI) / 180));
      mesh.castShadow = !ref;
      mesh.receiveShadow = true;
      mesh.userData.id = p.id;
      if (!ref) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 30),
          new THREE.LineBasicMaterial({ color: sel ? '#d35400' : '#2b2b2b', transparent: true, opacity: sel ? 1 : 0.55 })
        );
        mesh.add(edges);
      }
      this.group.add(mesh);
      this.meshes.set(p.id, mesh);
    }
    if (refit || !this.hasFit) { this.fit(); this.hasFit = parts.length > 0; }
    this.requestRender();
  }

  // 표식 지우기: 모양만 버린다 (재질은 나눠 쓰는 것)
  clearMarkers() {
    for (const m of this.markers.children) m.geometry.dispose();
    this.markers.clear();
  }

  // 연결부 표식. 구멍마다 주황 구(볼트·핀은 구멍 축 방향 원기둥, 길이 = 부속 길이), 용접은 맞닿은 직사각형 둘레 선,
  // 구멍 없는 클램프·경첩·본드는 맞닿은 면 가운데 파란 상자. 고른 묶음(selected 글자)은 1.5배(용접 선은 주황).
  // 표식은 userData.joint = 묶음 글자, userData.marker = true 로 누를 수 있다. show 가 false 면 숨긴다
  setJoints(joints, { show = true, selected = null } = {}) {
    this.clearMarkers();
    this.selectedJoint = selected;
    for (const j of joints || []) {
      if (j.type === 'none') continue;
      const on = !!selected && j.group === selected;
      const add = (obj, at) => {
        obj.position.set(at[0] * S, at[1] * S, at[2] * S);
        if (on && !obj.isLine) obj.scale.setScalar(1.5);
        obj.renderOrder = 10;
        obj.userData.joint = j.group;
        obj.userData.marker = true;
        this.markers.add(obj);
      };
      const rect = j.type === 'weld' && j.face ? weldRect(j.face) : null;
      if (rect) add(new THREE.LineSegments(rect, on ? this.markMats.weldOn : this.markMats.weld), j.face.center);
      else if (j.holes?.length && j.type !== 'weld') {
        for (const h of j.holes) {
          let geo;
          if (j.type === 'bolt' || j.type === 'pin') {
            geo = new THREE.CylinderGeometry(0.004, 0.004, (j.fastener?.len || 60) * S, 10);
            if (h.axis === 0) geo.rotateZ(Math.PI / 2);
            else if (h.axis === 2) geo.rotateX(Math.PI / 2);
          } else geo = new THREE.SphereGeometry(0.006, 12, 8);
          add(new THREE.Mesh(geo, this.markMats.hole), h.at);
        }
      } else if (j.face) add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), this.markMats.box), j.face.center);
    }
    this.markers.visible = show !== false;
    this.requestRender();
  }

  // 카메라 맞춤은 참고용(트럭 같은 주변 모양)을 빼고 진짜 부품 기준
  bounds() {
    const all = [...this.meshes.values()];
    const real = all.filter(m => !m.userData.ref);
    const box = new THREE.Box3();
    for (const m of (real.length ? real : all)) box.expandByObject(m);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.6, 0.3));
    return box;
  }

  fit(dir = new THREE.Vector3(1, 0.75, 1.25)) {
    const box = this.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = size / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.15;
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(dir.clone().normalize().multiplyScalar(dist));
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  setView(name) {
    const dirs = {
      front: new THREE.Vector3(0, 0.0001, 1),
      side: new THREE.Vector3(1, 0.0001, 0),
      top: new THREE.Vector3(0, 1, 0.0001),
      iso: new THREE.Vector3(1, 0.75, 1.25)
    };
    this.fit(dirs[name] || dirs.iso);
  }

  // 3D 사진은 연결부 표식 없이 (판매글 사진에 주황 점이 찍히지 않게)
  snapshot() {
    const shown = this.markers.visible;
    this.markers.visible = false;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.markers.visible = shown;
    this.requestRender();
    return url;
  }

  // 누른 곳의 부품 또는 연결부 표식. 표식은 부품 위에 그려지므로 보이는 표식에 닿으면 표식이 먼저고,
  // 표식끼리는 점 표식(구·원기둥·상자)이 선(용접, 누르기 여유가 넓음)보다 먼저다
  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // 방금 다시 만든 표식·부품도 맞게 (화면을 한 번 그리기 전에 눌러도)
    this.scene.updateMatrixWorld();
    const marks = this.markers.visible ? this.markers.children : [];
    const hits = this.raycaster.intersectObjects([...marks, ...[...this.meshes.values()].filter(m => !m.userData.ref)], false);
    return hits.find(h => h.object.userData.marker && !h.object.isLine) || hits.find(h => h.object.userData.marker) || hits[0] || null;
  }

  rayOnPlane(e, plane) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  // 부품만 집는다 (끌기 시작 판정용: 표식이 위에 겹쳐 있어도 고른 부품을 끌 수 있게)
  pickPart(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.scene.updateMatrixWorld();
    return this.raycaster.intersectObjects([...this.meshes.values()].filter(m => !m.userData.ref), false)[0] || null;
  }

  handleDown(e) {
    this.down = { x: e.clientX, y: e.clientY };
    const hit = this.pickPart(e);
    // 표식은 끌기 시작점이 아니다 (누르기만)
    if (hit && !hit.object.userData.marker && hit.object.userData.id === this.selectedId) {
      const vertical = e.shiftKey;
      const normal = vertical
        ? new THREE.Vector3().subVectors(this.camera.position, hit.point).setY(0).normalize()
        : new THREE.Vector3(0, 1, 0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
      this.drag = { mesh: hit.object, plane, start: hit.point.clone(), origin: hit.object.position.clone(), vertical, delta: [0, 0, 0] };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  }

  handleMove(e) {
    if (!this.drag) return;
    const p = this.rayOnPlane(e, this.drag.plane);
    if (!p) return;
    const d = p.sub(this.drag.start).multiplyScalar(1 / S);
    const snap = v => Math.round(v / SNAP) * SNAP;
    const delta = this.drag.vertical ? [0, snap(d.y), 0] : [snap(d.x), 0, snap(d.z)];
    // 바닥 아래로는 못 내려가게
    const mesh = this.drag.mesh;
    const halfH = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).y / 2 / S;
    const minDy = -(this.drag.origin.y / S - halfH);
    if (delta[1] < minDy) delta[1] = Math.ceil(minDy / SNAP) * SNAP;
    this.drag.delta = delta;
    mesh.position.set(this.drag.origin.x + delta[0] * S, this.drag.origin.y + delta[1] * S, this.drag.origin.z + delta[2] * S);
    this.requestRender();
  }

  handleUp(e) {
    const clickLike = this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5;
    if (this.drag) {
      const { mesh, delta } = this.drag;
      this.drag = null;
      this.controls.enabled = true;
      if (delta.some(v => v !== 0)) { this.onMove(mesh.userData.id, delta); return; }
    }
    if (clickLike) {
      const hit = this.pick(e);
      if (hit?.object.userData.marker) this.onSelect(`joint:${hit.object.userData.joint}`);
      else this.onSelect(hit ? hit.object.userData.id : null);
    }
  }
}

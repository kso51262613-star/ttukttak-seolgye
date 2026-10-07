// 3D 화면: 부품 보기, 클릭 선택, 선택한 부품 끌어 옮기기 (Shift = 위아래)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MATERIALS, materialProfile, longAxis } from '../core/materials.js';

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

function partGeometry(p) {
  const [w, h, d] = p.size.map(v => v * S);
  if (p.shape === 'cylinder') return new THREE.CylinderGeometry(w / 2, w / 2, h, 40, 1, true);
  if (p.shape === 'notched') return notchedPlate(w, h, d);
  const prof = materialProfile(p.material);
  if (prof === 'round') return roundRod(w, h, d);
  if (prof === 'angle') return angleBar(w, h, d, (MATERIALS[p.material]?.thickness || 3) * S);
  return new THREE.BoxGeometry(w, h, d);
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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.4, 0);
    this.controls.addEventListener('change', () => this.requestRender());

    this.raycaster = new THREE.Raycaster();
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
        side: p.shape === 'cylinder' ? THREE.DoubleSide : THREE.FrontSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.pos[0] * S, p.pos[1] * S, p.pos[2] * S);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = p.id;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: sel ? '#d35400' : '#2b2b2b', transparent: true, opacity: sel ? 1 : 0.55 })
      );
      mesh.add(edges);
      this.group.add(mesh);
      this.meshes.set(p.id, mesh);
    }
    if (refit || !this.hasFit) { this.fit(); this.hasFit = parts.length > 0; }
    this.requestRender();
  }

  bounds() {
    const box = new THREE.Box3().setFromObject(this.group);
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

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects([...this.meshes.values()], false)[0] || null;
  }

  rayOnPlane(e, plane) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  handleDown(e) {
    this.down = { x: e.clientX, y: e.clientY };
    const hit = this.pick(e);
    if (hit && hit.object.userData.id === this.selectedId) {
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
      this.onSelect(hit ? hit.object.userData.id : null);
    }
  }
}

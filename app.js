import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ATELIER 3D — erster Prototyp. Alle Einstellungen bleiben lokal im Browser.
const STORAGE_KEY = 'atelier3d-prototyp-v1';
const BODY_FIELDS = [
  { key: 'height', label: 'Gesamtgröße', min: 0.8, max: 1.2, step: 0.01, unit: '×' },
  { key: 'head', label: 'Kopfgröße', min: 0.75, max: 1.45, step: 0.01, unit: '×' },
  { key: 'shoulders', label: 'Schulterbreite', min: 0.75, max: 1.4, step: 0.01, unit: '×' },
  { key: 'torso', label: 'Taillenbreite', min: 0.75, max: 1.35, step: 0.01, unit: '×' },
  { key: 'legs', label: 'Beinlänge', min: 0.8, max: 1.2, step: 0.01, unit: '×' }
];
const POSE_FIELDS = [
  { key: 'leftArm', label: 'Arm links anheben', min: -20, max: 160, step: 1, unit: '°' },
  { key: 'rightArm', label: 'Arm rechts anheben', min: -20, max: 160, step: 1, unit: '°' },
  { key: 'leftElbow', label: 'Ellenbogen links', min: 0, max: 135, step: 1, unit: '°' },
  { key: 'rightElbow', label: 'Ellenbogen rechts', min: 0, max: 135, step: 1, unit: '°' },
  { key: 'leftLeg', label: 'Bein links vor / zurück', min: -55, max: 75, step: 1, unit: '°' },
  { key: 'rightLeg', label: 'Bein rechts vor / zurück', min: -55, max: 75, step: 1, unit: '°' },
  { key: 'leftKnee', label: 'Knie links', min: 0, max: 120, step: 1, unit: '°' },
  { key: 'rightKnee', label: 'Knie rechts', min: 0, max: 120, step: 1, unit: '°' }
];
const DEFAULTS = {
  style: 'anime', height: 1, head: 1, shoulders: 1, torso: 1, legs: 1,
  leftArm: 12, rightArm: 12, leftElbow: 0, rightElbow: 0,
  leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0,
  preset: 'neutral', showGrid: true, showJoints: true
};
const PRESETS = {
  neutral: { leftArm: 12, rightArm: 12, leftElbow: 0, rightElbow: 0, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  tpose: { leftArm: 90, rightArm: 90, leftElbow: 0, rightElbow: 0, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  wave: { leftArm: 12, rightArm: 80, leftElbow: 0, rightElbow: 105, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  step: { leftArm: 45, rightArm: 15, leftElbow: 25, rightElbow: 40, leftLeg: -25, rightLeg: 37, leftKnee: 40, rightKnee: 12 }
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const deg = (n) => THREE.MathUtils.degToRad(n);
const state = { ...DEFAULTS };
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (stored && typeof stored === 'object') readState(stored);
} catch (error) { console.warn('Gespeicherte Daten konnten nicht geladen werden.', error); }

function readState(input) {
  for (const f of [...BODY_FIELDS, ...POSE_FIELDS]) {
    const n = Number(input[f.key]);
    if (input[f.key] !== undefined && Number.isFinite(n)) state[f.key] = clamp(n, f.min, f.max);
  }
  if (['anime', 'natural'].includes(input.style)) state.style = input.style;
  if (typeof input.showGrid === 'boolean') state.showGrid = input.showGrid;
  if (typeof input.showJoints === 'boolean') state.showJoints = input.showJoints;
  if (typeof input.preset === 'string') state.preset = input.preset;
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.warn('Lokales Speichern nicht möglich.', error); }
}

const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1f2c');
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const startCamera = new THREE.Vector3(4.4, 2.8, 6.2);
const targetCamera = new THREE.Vector3(0, 1.49, 0);
camera.position.copy(startCamera);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.copy(targetCamera);
controls.minDistance = 2.4;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI * 0.92;
controls.update();
scene.add(new THREE.HemisphereLight(0xd4e1ff, 0x4b465f, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 9, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024,1024);
keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -5;
keyLight.shadow.camera.right = keyLight.shadow.camera.top = 5;
keyLight.shadow.bias = -0.0002;
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0xa89cff, 1.4);
rim.position.set(-4, 4, -5);
scene.add(rim);
const grid = new THREE.GridHelper(12, 24, 0x55516e, 0x33394a);
grid.position.y = -0.035;
grid.material.transparent = true;
grid.material.opacity = 0.42;
scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.ShadowMaterial({ opacity: 0.22 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.041;
floor.receiveShadow = true;
scene.add(floor);

const skinMat = new THREE.MeshStandardMaterial({ color: '#ccb4e6', roughness: 0.76, metalness: 0.01 });
const chestMat = new THREE.MeshStandardMaterial({ color: '#a18ccc', roughness: 0.79 });
const jointMat = new THREE.MeshStandardMaterial({ color: '#73718e', roughness: 0.58, metalness: 0.08 });
const eyeWhite = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
const eyeDark = new THREE.MeshStandardMaterial({ color: '#36304c', roughness: 0.5 });
const mouthMat = new THREE.MeshStandardMaterial({ color: '#827091', roughness: 0.9 });
const joints = [];
function ellipsoid(parent, x, y, z, sx, sy, sz, material, isJoint = false) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  if (isJoint) joints.push(mesh);
  return mesh;
}
function limb(parent, y, length, radius) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(.05,length - radius*2), 6, 14), skinMat);
  mesh.position.y = y;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
const figure = new THREE.Group();
scene.add(figure);
const hips = new THREE.Group();
figure.add(hips);
const pelvis = ellipsoid(hips, 0, 0.04, 0, 0.36, 0.22, 0.22, chestMat);
const torsoGroup = new THREE.Group();
torsoGroup.position.y = 0.12;
hips.add(torsoGroup);
const torso = ellipsoid(torsoGroup, 0, 0.37, 0, .35, .55, .21, skinMat);
const chest = ellipsoid(torsoGroup, 0, 0.63, 0.025, .44, .27, .24, chestMat);
const neck = ellipsoid(torsoGroup, 0, 0.94, 0, .095, .16, .09, skinMat);
const headPivot = new THREE.Group();
headPivot.position.y = 1.07;
torsoGroup.add(headPivot);
ellipsoid(headPivot, 0, 0, 0, 0.12, 0.12, 0.11, jointMat, true);
const faceGroup = new THREE.Group();
headPivot.add(faceGroup);
const skull = ellipsoid(faceGroup, 0, .185, 0, .245, .295, .218, skinMat);
const earL = ellipsoid(faceGroup, -.244, .165, -.005, .055, .095, .055, skinMat);
const earR = ellipsoid(faceGroup, .244, .165, -.005, .055, .095, .055, skinMat);
const eyeL = ellipsoid(faceGroup, -.096, .215, .193, .052, .066, .024, eyeWhite);
const eyeR = ellipsoid(faceGroup, .096, .215, .193, .052, .066, .024, eyeWhite);
const pupilL = ellipsoid(faceGroup, -.096, .215, .218, .028, .043, .01, eyeDark);
const pupilR = ellipsoid(faceGroup, .096, .215, .218, .028, .043, .01, eyeDark);
ellipsoid(faceGroup, 0, .125, .224, .038, .05, .045, skinMat);
const mouth = ellipsoid(faceGroup, 0, .055, .205, .062, .008, .011, mouthMat);

function makeArm(side) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * .445, .76, 0);
  torsoGroup.add(shoulder);
  ellipsoid(shoulder, 0, 0, 0, .125, .13, .13, jointMat, true);
  limb(shoulder, -.27, .54, .115);
  const elbow = new THREE.Group();
  elbow.position.y = -.57;
  shoulder.add(elbow);
  ellipsoid(elbow, 0, 0, 0, .105, .107, .105, jointMat, true);
  limb(elbow, -.245, .46, .092);
  const hand = ellipsoid(elbow, 0, -.52, 0, .095, .16, .065, skinMat);
  hand.rotation.z = 0.04 * side;
  return { shoulder, elbow };
}
function makeLeg(side) {
  const hip = new THREE.Group();
  hip.position.set(side * .22, -.09, 0);
  hips.add(hip);
  ellipsoid(hip, 0, 0, 0, .17, .17, .16, jointMat, true);
  limb(hip, -.38, .73, .17);
  const knee = new THREE.Group();
  knee.position.y = -.78;
  hip.add(knee);
  ellipsoid(knee, 0, 0, 0, .13, .13, .13, jointMat, true);
  limb(knee, -.35, .65, .13);
  ellipsoid(knee, 0, -.72, .08, .14, .10, .23, skinMat);
  return { hip, knee };
}
const armL = makeArm(-1), armR = makeArm(1), legL = makeLeg(-1), legR = makeLeg(1);
const rig = { armL, armR, legL, legR };

function applyCharacter() {
  figure.scale.setScalar(state.height);
  hips.position.y = 1.7 * state.legs;
  legL.hip.scale.y = state.legs;
  legR.hip.scale.y = state.legs;
  faceGroup.scale.setScalar(state.head * (state.style === 'anime' ? 1.13 : 0.92));
  torso.scale.x = .35 * state.torso;
  chest.scale.x = .44 * state.shoulders;
  pelvis.scale.x = .36 * (state.torso * .55 + .45);
  armL.shoulder.position.x = -.445 * state.shoulders;
  armR.shoulder.position.x = .445 * state.shoulders;
  const anime = state.style === 'anime';
  skinMat.color.set(anime ? '#d5bdeb' : '#ccb2a7');
  chestMat.color.set(anime ? '#a28bce' : '#b88e86');
  eyeL.scale.set(anime ? .052 : .032, anime ? .066 : .029, .024);
  eyeR.scale.copy(eyeL.scale);
  pupilL.scale.set(anime ? .028 : .017, anime ? .043 : .019, .011);
  pupilR.scale.copy(pupilL.scale);
  const shoulderSign = 1;
  armL.shoulder.rotation.z = -deg(state.leftArm) * shoulderSign;
  armR.shoulder.rotation.z = deg(state.rightArm) * shoulderSign;
  armL.elbow.rotation.x = -deg(state.leftElbow);
  armR.elbow.rotation.x = -deg(state.rightElbow);
  legL.hip.rotation.x = -deg(state.leftLeg);
  legR.hip.rotation.x = -deg(state.rightLeg);
  legL.knee.rotation.x = deg(state.leftKnee);
  legR.knee.rotation.x = deg(state.rightKnee);
  grid.visible = state.showGrid;
  for (const joint of joints) joint.visible = state.showJoints;
  document.querySelectorAll('[data-style]').forEach(el => el.classList.toggle('is-active', el.dataset.style === state.style));
  document.querySelectorAll('[data-preset]').forEach(el => el.classList.toggle('is-active', el.dataset.preset === state.preset));
  document.getElementById('showGrid').checked = state.showGrid;
  document.getElementById('showJoints').checked = state.showJoints;
}

function buildSliders(fields, container) {
  for (const field of fields) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-control';
    const label = document.createElement('label');
    label.className = 'slider-label';
    const name = document.createElement('span');
    name.textContent = field.label;
    const output = document.createElement('output');
    label.append(name, output);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'slider';
    slider.min = field.min;
    slider.max = field.max;
    slider.step = field.step;
    slider.id = `control-${field.key}`;
    label.htmlFor = slider.id;
    const paint = () => { slider.value = String(state[field.key]); output.value = `${state[field.key]}${field.unit}`; };
    paint();
    slider.addEventListener('input', () => {
      state[field.key] = Number(slider.value);
      if (POSE_FIELDS.includes(field)) state.preset = 'custom';
      paint(); applyCharacter(); saveState();
    });
    wrapper.append(label,slider);
    container.append(wrapper);
  }
}
buildSliders(BODY_FIELDS, document.getElementById('bodyControls'));
buildSliders(POSE_FIELDS, document.getElementById('poseControls'));
function syncSliders() {
  for (const field of [...BODY_FIELDS, ...POSE_FIELDS]) {
    const input = document.getElementById(`control-${field.key}`);
    input.value = String(state[field.key]);
    input.previousElementSibling.querySelector('output').value = `${state[field.key]}${field.unit}`;
  }
}
function changeTab(tab) {
  document.getElementById('bodyPanel').classList.toggle('hidden', tab !== 'body');
  document.getElementById('posePanel').classList.toggle('hidden', tab !== 'pose');
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected', String(active));
  });
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => changeTab(button.dataset.tab)));
document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
  state.style = button.dataset.style; applyCharacter(); saveState();
}));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  Object.assign(state, PRESETS[button.dataset.preset]);
  state.preset = button.dataset.preset;
  syncSliders(); applyCharacter(); saveState(); changeTab('pose');
  toast('Pose angewendet – Gelenke kannst du links anpassen.');
}));
document.getElementById('showGrid').addEventListener('change', e => { state.showGrid = e.target.checked; applyCharacter(); saveState(); });
document.getElementById('showJoints').addEventListener('change', e => { state.showJoints = e.target.checked; applyCharacter(); saveState(); });
document.getElementById('cameraReset').addEventListener('click', () => {
  camera.position.copy(startCamera); controls.target.copy(targetCamera); controls.update(); toast('Kamera zurückgesetzt.');
});
document.getElementById('resetAll').addEventListener('click', () => {
  Object.assign(state,DEFAULTS); syncSliders(); applyCharacter(); saveState(); changeTab('body'); toast('Alle Einstellungen zurückgesetzt.');
});
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
document.getElementById('saveConfig').addEventListener('click', () => {
  download('atelier3d-einstellungen.json', new Blob([JSON.stringify({ app: 'Atelier 3D', version: 1, ...state },null,2)],{type:'application/json'}));
  toast('Einstellungen exportiert.');
});
document.getElementById('loadConfig').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object') throw new Error('Ungültige Datei');
    readState(parsed); syncSliders(); applyCharacter(); saveState(); toast('Einstellungen importiert.');
  } catch { toast('Die JSON-Datei konnte nicht gelesen werden.'); }
  e.target.value = '';
});
document.getElementById('screenshot').addEventListener('click', () => {
  try {
    renderer.render(scene,camera);
    renderer.domElement.toBlob(blob => {
      if (!blob) { toast('PNG konnte nicht erstellt werden.'); return; }
      download('atelier3d-figur.png',blob);toast('3D-Ansicht als PNG gespeichert.');
    }, 'image/png');
  } catch { toast('PNG-Export ist fehlgeschlagen.'); }
});
let toastTimer;
function toast(message) {
  const el = document.getElementById('toast'); el.textContent = message; el.classList.add('is-visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2700);
}

function resize() {
  const width = Math.max(1,stage.clientWidth);
  const height = Math.max(1,stage.clientHeight);
  renderer.setSize(width,height,false);
  camera.aspect = width/height;
  camera.updateProjectionMatrix();
}
const observer = new ResizeObserver(resize);
observer.observe(stage);
window.addEventListener('resize',resize);
applyCharacter();syncSliders();resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene,camera); });

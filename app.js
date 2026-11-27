import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyLimbPose, fingerNames } from './limb-pose.js';
import { enablePoseDrag } from './pose-drag.js';
import { createStudioLight, LIGHT_DEFAULTS, LIGHT_FIELDS } from './studio-light.js';
import { createFacePanel, readFaceSettings } from './face-settings.js';
import { APPEARANCE_FIELDS, createAppearancePanel, readAppearance } from './appearance-settings.js';
import { softMakeupTexture } from './appearance-materials.js';
import { readWardrobe } from './vrm-wardrobe.js';
import { defaultAccessory, localAssetEntries, readAccessories, setAccessory } from './wardrobe-catalog.js';
import { createWardrobeAttachments, disposeWardrobeObject, matchingAccessories } from './wardrobe-attachments.js';
import { createLocalAssetSources, loadLocalWardrobeAsset } from './wardrobe-local.js';
import { createWardrobePanel } from './wardrobe-panel.js';
import { createLocalClothesPanel } from './wardrobe-clothes-panel.js';
import { CLOTHING_SLOTS, clothingSlotsOverlap, readLocalClothes, wearLocalClothing } from './wardrobe-clothes.js';
import { createHairPanel } from './wardrobe-hair.js';
import { createBodyShapePanel } from './body-shape-panel.js';
import { readBodyShapeSettings } from './vrm-body-shapes.js';
import { createPoseLibrary, readLibraryBookmark } from './pose-library.js';
import { createLibraryRig, libraryControls } from './pose-library-rig.js';
import { animeModels, DEFAULT_ANIME_MODEL, readAnimeClothing, readAnimeModel } from './anime25d/catalog.js?v=2532';

// ATELIER 3D — erster Prototyp. Alle Einstellungen bleiben lokal im Browser.
const STORAGE_KEY = 'atelier3d-prototyp-v1';
const IMPORTED_MODEL = 'imported';
const BODY_FIELDS = [
  { key: 'height', label: 'Gesamtgröße', min: 0.8, max: 1.2, step: 0.01, unit: '×' },
  { key: 'head', label: 'Kopfgröße', min: 0.75, max: 1.45, step: 0.01, unit: '×' },
  { key: 'shoulders', label: 'Schulterbreite', min: 0.75, max: 1.4, step: 0.01, unit: '×' },
  { key: 'chest', label: 'Brustumfang', min: 0.75, max: 1.35, step: 0.01, unit: '×' },
  { key: 'torso', label: 'Taillenbreite', min: 0.75, max: 1.35, step: 0.01, unit: '×' },
  { key: 'glutes', label: 'Gesäßumfang', min: 0.75, max: 1.35, step: 0.01, unit: '×' },
  { key: 'legs', label: 'Beinlänge', min: 0.8, max: 1.2, step: 0.01, unit: '×' }
];
const BASIC_POSE_FIELDS = [
  { key: 'headTurn', label: 'Kopf drehen', min: -80, max: 80, step: 1, unit: '°' },
  { key: 'headPitch', label: 'Kinn heben / senken', min: -50, max: 60, step: 1, unit: '°' },
  { key: 'headTilt', label: 'Kopf seitlich neigen', min: -45, max: 45, step: 1, unit: '°' },
  { key: 'torsoTurn', label: 'Oberkörper drehen', min: -45, max: 45, step: 1, unit: '°' },
  { key: 'leftArm', label: 'Arm links anheben', min: -30, max: 180, step: 1, unit: '°' },
  { key: 'rightArm', label: 'Arm rechts anheben', min: -30, max: 180, step: 1, unit: '°' },
  { key: 'leftElbow', label: 'Ellenbogen links', min: -5, max: 150, step: 1, unit: '°' },
  { key: 'rightElbow', label: 'Ellenbogen rechts', min: -5, max: 150, step: 1, unit: '°' },
  { key: 'leftLeg', label: 'Hüfte links beugen / strecken', min: -25, max: 125, step: 1, unit: '°' },
  { key: 'rightLeg', label: 'Hüfte rechts beugen / strecken', min: -25, max: 125, step: 1, unit: '°' },
  { key: 'leftKnee', label: 'Knie links', min: -5, max: 140, step: 1, unit: '°' },
  { key: 'rightKnee', label: 'Knie rechts', min: -5, max: 140, step: 1, unit: '°' }
];
const EXTRA_LIMB_FIELDS = [
  { key: 'leftArmForward', label: 'Arm links vor / zurück', min: -60, max: 180, step: 1, unit: '°' },
  { key: 'rightArmForward', label: 'Arm rechts vor / zurück', min: -60, max: 180, step: 1, unit: '°' },
  { key: 'leftArmTwist', label: 'Oberarm links drehen', min: -70, max: 90, step: 1, unit: '°' },
  { key: 'rightArmTwist', label: 'Oberarm rechts drehen', min: -70, max: 90, step: 1, unit: '°' },
  { key: 'leftForearmTwist', label: 'Unterarm links drehen', min: -90, max: 90, step: 1, unit: '°' },
  { key: 'rightForearmTwist', label: 'Unterarm rechts drehen', min: -90, max: 90, step: 1, unit: '°' },
  { key: 'leftLegSpread', label: 'Bein links seitlich führen', min: -25, max: 45, step: 1, unit: '°' },
  { key: 'rightLegSpread', label: 'Bein rechts seitlich führen', min: -25, max: 45, step: 1, unit: '°' },
  { key: 'leftHipTwist', label: 'Bein links aus der Hüfte drehen', min: -40, max: 45, step: 1, unit: '°' },
  { key: 'rightHipTwist', label: 'Bein rechts aus der Hüfte drehen', min: -40, max: 45, step: 1, unit: '°' }
];
const ANIME_TORSO_FIELDS = [
  { key: 'torsoPitch', label: 'Oberkörper vor / zurück neigen', min: -25, max: 70, step: 1, unit: '°' },
  { key: 'torsoTilt', label: 'Oberkörper seitlich neigen', min: -35, max: 35, step: 1, unit: '°' }
];
const KNEE_TWIST_FIELDS = ['left', 'right'].map((side, i) => ({
  key: side + 'KneeTwist', label: 'Knie ' + ['links', 'rechts'][i] + ' drehen', min: -20, max: 30, step: 1, unit: '°'
}));
const HAND_FIELDS = ['left', 'right'].map(side => [
  { key: side + 'WristBend', label: 'Hand beugen / strecken', min: -65, max: 75, step: 1, unit: '°' },
  { key: side + 'WristSide', label: 'Hand seitlich neigen', min: -20, max: 30, step: 1, unit: '°' },
  ...['Daumen', 'Zeigefinger', 'Mittelfinger', 'Ringfinger', 'Kleinfinger'].map((label, j) => ({
    key: side + fingerNames[j] + 'Curl', label: label + ' beugen', min: 0, max: 100, step: 1, unit: '%'
  }))
]);
const POSE_FIELDS = [...BASIC_POSE_FIELDS, ...ANIME_TORSO_FIELDS, ...EXTRA_LIMB_FIELDS, ...KNEE_TWIST_FIELDS, ...HAND_FIELDS.flat()];
const CHARACTER_FIELDS = [...BODY_FIELDS, ...POSE_FIELDS];
const HIP_FIELDS = new Map([['leftLeg', 'leftKnee'], ['rightLeg', 'rightKnee']]);
const POSE_OFFSETS = {
  headTurn: 0, headPitch: 0, headTilt: 0, torsoTurn: 0,
  torsoPitch: 0, torsoTilt: 0,
  ...Object.fromEntries([...EXTRA_LIMB_FIELDS, ...KNEE_TWIST_FIELDS, ...HAND_FIELDS.flat()].map(({ key }) => [key, 0]))
};
const DEFAULTS = {
  ...POSE_OFFSETS,
  ...LIGHT_DEFAULTS,
  animeTop: 'original',
  clothGravity: true,
  importedModel: null,
  libraryPose: null,
  displayMode: '2.5d', anime25dModel: DEFAULT_ANIME_MODEL, anime25dView: 'front', animeShowRig: false,
  animeClothing: {},
  animeHairPreview: false,
  model: 'mannequin', style: 'anime', height: 1, head: 1, shoulders: 1, torso: 1, legs: 1, chest: 1, glutes: 1,
  leftArm: 12, rightArm: 12, leftElbow: 0, rightElbow: 0,
  leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0,
  preset: 'neutral', showGrid: true, showJoints: true
};
const MODELS = { mannequin: { label: 'Gliederpuppe' } };
const PRESETS = {
  neutral: { leftArm: 12, rightArm: 12, leftElbow: 0, rightElbow: 0, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  tpose: { leftArm: 90, rightArm: 90, leftElbow: 0, rightElbow: 0, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  wave: { leftArm: 12, rightArm: 80, leftElbow: 0, rightElbow: 105, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  step: { leftArm: 45, rightArm: 15, leftElbow: 25, rightElbow: 40, leftLeg: -25, rightLeg: 37, leftKnee: 40, rightKnee: 12 }
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const deg = (n) => THREE.MathUtils.degToRad(n);
const state = { ...DEFAULTS, faces: {}, appearances: {}, wardrobes: {}, accessories: {}, bodyShapes: {}, localClothes: {} };
let initialModel = DEFAULTS.model;
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (stored && typeof stored === 'object') {
    initialModel = readState(stored);
    if (!Object.hasOwn(stored, 'displayMode')) state.displayMode = DEFAULTS.displayMode;
  }
} catch (error) { console.warn('Gespeicherte Daten konnten nicht geladen werden.', error); }

function getPoseLimit(field, settings = state) {
  if (field.key.endsWith('KneeTwist')) {
    const kneeAngle = settings[field.key.replace('Twist', '')];
    const mobility = clamp(kneeAngle / 90, 0, 1);
    return { ...field, min: Math.round(field.min * mobility), max: Math.round(field.max * mobility) };
  }
  const knee = HIP_FIELDS.get(field.key);
  if (!knee) return field;
  // Approximate the gradual release of the hamstrings as the knee bends.
  const max = Math.round(THREE.MathUtils.lerp(90, field.max, clamp(settings[knee] / 90, 0, 1)));
  return { ...field, max };
}

function constrainCoupledJoints() {
  for (const field of BASIC_POSE_FIELDS) {
    if (HIP_FIELDS.has(field.key)) state[field.key] = Math.min(state[field.key], getPoseLimit(field).max);
  }
  for (const field of KNEE_TWIST_FIELDS) {
    const { min, max } = getPoseLimit(field);
    state[field.key] = clamp(state[field.key], min, max);
  }
}

function readRangeValues(fields, input, target) {
  for (const { key, min, max } of fields) {
    const n = Number(input[key]);
    if (input[key] !== undefined && Number.isFinite(n)) target[key] = clamp(n, min, max);
  }
}

function readImportedInfo(input) {
  if (typeof input?.name !== 'string' || !input.name || input.name.length > 255 ||
      !Number.isSafeInteger(input.size) || input.size <= 0) return null;
  const pose = {};
  if (input.pose && typeof input.pose === 'object') {
    readRangeValues(CHARACTER_FIELDS, input.pose, pose);
    pose.libraryPose = readLibraryBookmark(input.pose.libraryPose);
    if (typeof input.pose.preset === 'string') pose.preset = input.pose.preset;
  }
  return { name: input.name, size: input.size, pose };
}

function sameVrmFile(a, b) {
  return a && b && a.name === b.name && a.size === b.size;
}

function readState(input) {
  Object.assign(state, POSE_OFFSETS, LIGHT_DEFAULTS, { chest: DEFAULTS.chest, glutes: DEFAULTS.glutes });
  state.displayMode = input.displayMode === '2.5d' ? '2.5d' : '3d';
  state.anime25dModel = readAnimeModel(input.anime25dModel);
  state.anime25dView = DEFAULTS.anime25dView;
  state.animeShowRig = input.animeShowRig === true;
  state.animeClothing = readAnimeClothing(input.animeClothing);
  state.animeHairPreview = input.animeHairPreview === true;
  state.faces = {};
  state.appearances = {};
  state.bodyShapes = {};
  for (const [id, { bodyShapeProfile }] of Object.entries(MODELS)) {
    if (Object.hasOwn(input.appearances ?? {}, id)) state.appearances[id] = readAppearance(input.appearances[id]);
    if (bodyShapeProfile) {
      const shapes = readBodyShapeSettings(input.bodyShapes?.[id], bodyShapeProfile.fields);
      if (Object.keys(shapes).length) state.bodyShapes[id] = shapes;
    }
  }
  state.libraryPose = readLibraryBookmark(input.libraryPose);
  for (const [id, model] of Object.entries(MODELS)) {
    if (model.url && Object.hasOwn(input.faces ?? {}, id)) {
      state.faces[id] = readFaceSettings(input.faces[id]);
    }
  }
  state.importedModel = readImportedInfo(input.importedModel);
  const wardrobeModels = state.importedModel ? [...Object.keys(MODELS), IMPORTED_MODEL] : Object.keys(MODELS);
  state.accessories = readAccessories(input.accessories, wardrobeModels);
  state.localClothes = readLocalClothes(input.localClothes, Object.keys(MODELS).filter(id =>
    MODELS[id].bodyShapeProfile?.createWardrobe));
  if (state.importedModel && Object.hasOwn(input.faces ?? {}, IMPORTED_MODEL)) {
    state.faces[IMPORTED_MODEL] = readFaceSettings(input.faces[IMPORTED_MODEL]);
  }
  if (state.importedModel && Object.hasOwn(input.appearances ?? {}, IMPORTED_MODEL)) {
    state.appearances[IMPORTED_MODEL] = readAppearance(input.appearances[IMPORTED_MODEL]);
  }
  state.lightEnabled = input.lightEnabled === true;
  if (typeof input.lightColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.lightColor)) {
    state.lightColor = input.lightColor;
  }
  state.animeTop = input.animeTop === 'short' ? 'short' : DEFAULTS.animeTop;
  state.wardrobes = {};
  for (const id of Object.keys(MODELS).filter(id => MODELS[id].url)) {
    if (input.wardrobes?.[id] || (id === 'anime' && state.animeTop === 'short')) {
      state.wardrobes[id] = readWardrobe(input.wardrobes?.[id],
        id === 'anime' ? state.animeTop : undefined, MODELS[id].bodyShapeProfile?.wardrobeLabels);
    }
  }
  state.animeTop = ['original', 'short'].includes(state.wardrobes.anime?.top)
    ? state.wardrobes.anime.top : DEFAULTS.animeTop;
  state.clothGravity = typeof input.clothGravity === 'boolean' ? input.clothGravity : DEFAULTS.clothGravity;
  readRangeValues([...CHARACTER_FIELDS, ...LIGHT_FIELDS], input, state);
  constrainCoupledJoints();
  if (['anime', 'natural'].includes(input.style)) state.style = input.style;
  if (typeof input.showGrid === 'boolean') state.showGrid = input.showGrid;
  if (typeof input.showJoints === 'boolean') state.showJoints = input.showJoints;
  if (typeof input.preset === 'string') state.preset = input.preset;
  if (input.model === IMPORTED_MODEL && state.importedModel) return IMPORTED_MODEL;
  return typeof input.model === 'string' && Object.hasOwn(MODELS, input.model)
    ? input.model
    : DEFAULTS.model;
}
function saveState() {
  if (state.model === IMPORTED_MODEL && state.importedModel) {
    state.importedModel.pose = Object.fromEntries(CHARACTER_FIELDS.map(({ key }) => [key, state[key]]));
    state.importedModel.pose.preset = state.preset;
    state.importedModel.pose.libraryPose = state.libraryPose;
  }
  const status = document.getElementById('saveStatus');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (status.hasAttribute('data-error')) status.textContent = 'Lokal gespeichert';
    status.removeAttribute('data-error');
  } catch (error) {
    console.warn('Lokales Speichern nicht möglich.', error);
    if (!status.hasAttribute('data-error')) status.textContent = 'Speichern fehlgeschlagen';
    status.setAttribute('data-error', '');
  }
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
renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1), false);
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
const ambientLight = new THREE.HemisphereLight(0xd4e1ff, 0x4b465f, 2.1);
scene.add(ambientLight);
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

function makeupPatch(material, x, y, width, height) {
  const geometry = new THREE.PlaneGeometry(width, height, 12, 9);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i) + x;
    const v = positions.getY(i) + y;
    const surface = Math.sqrt(Math.max(0.04, 1 - (u / .245) ** 2 - ((v - .185) / .295) ** 2));
    positions.setXYZ(i, u, v, .218 * surface + .002);
  }
  geometry.computeVertexNormals();
  const patch = new THREE.Mesh(geometry, material);
  faceGroup.add(patch);
  return patch;
}

const blushMaterial = new THREE.MeshStandardMaterial({
  map: softMakeupTexture(), transparent: true, depthWrite: false, roughness: .9
});
const shadowMaterial = blushMaterial.clone();
const cheekPatches = [-1, 1].map(sign => makeupPatch(blushMaterial, sign * .143, .150, .137, .084));
const lidPatches = [-1, 1].map(sign => makeupPatch(shadowMaterial, sign * .096, .277, .115, .045));
const mannequinAppearance = {
  fields: new Map(['skin', 'iris', 'lipstick', 'blush', 'eyeshadow'].map(key => [key, APPEARANCE_FIELDS[key]])),
  apply(settings, style) {
    const anime = style === 'anime';
    skinMat.color.set(settings?.skin?.color ?? (anime ? '#d5bdeb' : '#ccb2a7'));
    chestMat.color.set(settings?.skin?.color ?? (anime ? '#a28bce' : '#b88e86'));
    eyeDark.color.set(settings?.iris?.color ?? '#36304c');
    mouthMat.color.set('#827091');
    const lipstick = settings?.lipstick;
    if (lipstick?.amount) mouthMat.color.lerp(makeupColor.set(lipstick.color), lipstick.amount / 100);
    for (const [entry, material, patches] of [
      [settings?.blush, blushMaterial, cheekPatches], [settings?.eyeshadow, shadowMaterial, lidPatches]
    ]) {
      if (entry) material.color.set(entry.color);
      material.opacity = (entry?.amount ?? 0) / 100;
      for (const patch of patches) patch.visible = material.opacity > 0;
    }
  }
};
const makeupColor = new THREE.Color();


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
  const hand = new THREE.Group();
  hand.position.y = -.46;
  elbow.add(hand);
  ellipsoid(hand, 0, -.074, 0, .068, .091, .042, skinMat);
  const digits = {};
  for (const [i, length] of [.088, .105, .122, .109, .088].entries()) {
    const finger = fingerNames[i];
    let parent = hand;
    digits[finger] = [0.39, 0.34, 0.27].map((ratio, segment) => {
      const joint = new THREE.Group();
      const previousLength = length * (segment === 1 ? .39 : .34);
      joint.position.set(segment ? 0 : side * (-.075 + i * .027), segment ? -previousLength : i ? -.139 : -.062, i ? 0 : .018 * (segment === 0));
      parent.add(joint);
      parent = joint;
      ellipsoid(joint, 0, -length * ratio / 2, 0, i ? .013 : .016, length * ratio * .63, .014, skinMat);
      return { joint, axis: new THREE.Vector3(-1, 0, 0) };
    });
  }
  return { shoulder, elbow, hand, digits };
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
  const foot = ellipsoid(knee, 0, -.72, .08, .14, .10, .23, skinMat);
  return { hip, knee, foot };
}
const armL = makeArm(-1), armR = makeArm(1), legL = makeLeg(-1), legR = makeLeg(1);
const mannequin = {
  object: figure,
  bones: {
    head: headPivot, headTip: skull, spine: torsoGroup,
    leftArm: armL.shoulder, leftElbow: armL.elbow, leftHand: armL.hand, leftPalm: armL.digits.Middle[0].joint,
    rightArm: armR.shoulder, rightElbow: armR.elbow, rightHand: armR.hand, rightPalm: armR.digits.Middle[0].joint,
    leftLeg: legL.hip, leftKnee: legL.knee, leftFoot: legL.foot,
    rightLeg: legR.hip, rightKnee: legR.knee, rightFoot: legR.foot
  },
  applyLimbPose(pose) {
    applyMannequinLimbs(pose);
    mannequinLibrary.adjustLimbs();
  }
};

function applyMannequinLimbs(pose) {
  applyLimbPose(mannequin.bones, pose, 'hanging', { left: armL.digits, right: armR.digits });
}
function applyMannequinJoints(pose) {
  torsoGroup.rotation.set(animeViewport ? deg(pose.torsoPitch) : 0, deg(pose.torsoTurn),
    animeViewport ? deg(pose.torsoTilt) : 0, 'YXZ');
  headPivot.rotation.set(-deg(pose.headPitch), deg(pose.headTurn), deg(pose.headTilt), 'YXZ');
  applyMannequinLimbs(pose);
}

const mannequinNodes = { hips, spine: torsoGroup, head: headPivot };
const mannequinLimbNodes = new Set();
for (const [side, arm, leg] of [['left', armR, legR], ['right', armL, legL]]) {
  Object.assign(mannequinNodes, {
    [side + 'UpperArm']: arm.shoulder, [side + 'LowerArm']: arm.elbow, [side + 'Hand']: arm.hand,
    [side + 'UpperLeg']: leg.hip, [side + 'LowerLeg']: leg.knee, [side + 'Foot']: leg.foot
  });
  for (const node of [arm.shoulder, arm.elbow, arm.hand, leg.hip, leg.knee]) mannequinLimbNodes.add(node);
  for (const [name, chain] of Object.entries(arm.digits)) {
    const suffixes = name === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
    chain.forEach(({ joint }, i) => {
      mannequinNodes[side + name + suffixes[i]] = joint;
      mannequinLimbNodes.add(joint);
    });
  }
}
const mannequinLibrary = createLibraryRig({
  object: figure, nodes: mannequinNodes, driven: new Set([...mannequinLimbNodes, torsoGroup, headPivot]),
  limbNodes: mannequinLimbNodes, restFloor: -1.69
});
const modelSelect = document.getElementById('characterModel');
const localVrmInput = document.getElementById('localVrm');
const importedOption = document.getElementById('importedModelOption');
const importedHint = document.getElementById('importedModelHint');
const removeVrmButton = document.getElementById('removeVrm');
let importedVrm;
let builtinCamera;
function mannequinFootAnchor(foot) {
  const anchor = new THREE.Group();
  anchor.scale.set(1 / foot.scale.x, 1 / foot.scale.y, 1 / foot.scale.z);
  foot.add(anchor);
  return anchor;
}
const mannequinAnchors = {
  ...mannequinNodes, head: faceGroup, chest: torsoGroup,
  leftFoot: mannequinFootAnchor(mannequinNodes.leftFoot), rightFoot: mannequinFootAnchor(mannequinNodes.rightFoot)
};
const localAssetSources = createLocalAssetSources();
const localClothesSessions = new Map();
const wardrobeAttachments = createWardrobeAttachments((asset, error) => {
  if (asset.format === 'local') {
    localAssetSources.remove(asset.id);
  } else {
    state.accessories[state.model][asset.id].visible = false;
  }
  syncWardrobePanel();
  saveState();
  toast(asset.format === 'local' ? error.message : `${asset.name} konnte nicht geladen werden.`);
}, localAssetSources.open);
const emptyAccessories = {};
const wardrobePanel = createWardrobePanel({
  onImport: importWardrobeAsset,
  onOutfit(slot, id) {
    if (!activeVrm?.wardrobe) return;
    for (const item of Object.values(state.localClothes[state.model] ?? {})) {
      if (clothingSlotsOverlap(slot, item.slot) && (slot !== 'dress' || id !== 'none' || item.slot === 'dress')) {
        item.visible = false;
      }
    }
    const outfit = { ...currentOutfit(), [slot]: id };
    if (slot === 'top' || slot === 'bottom') outfit.dress = 'none';
    state.wardrobes[state.model] = readWardrobe(outfit, undefined, activeVrm.wardrobe.labels);
    if (state.model === 'anime' && slot === 'top') {
      state.animeTop = ['original', 'short'].includes(outfit.top) ? outfit.top : DEFAULTS.animeTop;
    }
    applyCharacter();
    saveState();
  },
  onAccessory(id, item) {
    if (item) {
      setAccessory(state.accessories[state.model] ??= {}, id, item);
    } else {
      const equipped = state.accessories[state.model];
      if (equipped[id].source) localAssetSources.remove(id);
      delete equipped[id];
      if (!Object.keys(equipped).length) delete state.accessories[state.model];
    }
    syncWardrobePanel();
    saveState();
  }
});
const localClothesPanel = createLocalClothesPanel({
  onImport: importLocalClothes,
  onShow(id) {
    const items = state.localClothes[state.model];
    if (!items?.[id] || !localClothesSessions.has(id)) return;
    if (items[id].visible) items[id].visible = false;
    else wearLocalClothing(items, id);
    applyCharacter();
    saveState();
  },
  onRemove(id) {
    const items = state.localClothes[state.model];
    if (!items?.[id]) return;
    removeLocalClothing(id);
    delete items[id];
    if (!Object.keys(items).length) delete state.localClothes[state.model];
    applyCharacter();
    saveState();
  }
});
const clothGravityControl = document.getElementById('clothGravity');
const clothPauseButton = document.getElementById('clothPause');
const clothesAvailability = document.getElementById('clothesAvailability');
let clothPaused = false;
const modelStatus = document.getElementById('modelStatus');
const modelLabel = document.getElementById('modelLabel');
const mannequinControls = document.getElementById('mannequinControls');
const lightEnabledInput = document.getElementById('lightEnabled');
const lightColorInput = document.getElementById('lightColor');
const vrmModels = new Map();
let activeVrm;
let modelRequest = 0;
let activeTab = 'figure';
let panelOpen = !window.matchMedia('(max-width: 900px)').matches;
const workspace = document.getElementById('workspace');
const settingsPanel = document.getElementById('settingsPanel');
const toolsToggle = document.getElementById('toggleTools');
const toolButtons = [...document.querySelectorAll('[data-tab]')];
const animeTabs = new Set(['figure', 'pose', 'view', 'files']);
const modeSelect = document.getElementById('displayMode');
const animeModelSelect = document.getElementById('anime25dModel');
animeModelSelect.querySelector('optgroup').replaceChildren(
  ...Object.entries(animeModels).map(([id, model]) => new Option(model.label, id))
);
const animeCredits = document.getElementById('animeModelCredits');
const animeModeStatus = document.getElementById('animeModeStatus');
const animeWarning = document.getElementById('animePoseWarning');
const animeGuide = document.getElementById('animeShowRig');
const animeHairPreview = document.getElementById('animeHairPreview');
const animeHairError = document.getElementById('animeHairError');
const animeClothes = document.getElementById('animeClothes');
const animeClothesFields = document.getElementById('animeClothesFields');
let animeViewport;
let displayRequest = 0;
const facePanel = createFacePanel({
  container: document.getElementById('faceControls'),
  finePanel: document.getElementById('faceFine'),
  fineContainer: document.getElementById('faceFineControls'),
  unavailable: document.getElementById('faceUnavailable'),
  reset: document.getElementById('resetFace'),
  hint: document.getElementById('faceOverride'),
  onChange(settings) {
    if (!activeVrm?.face) return;
    state.faces[state.model] = settings;
    activeVrm.face.set(settings);
    activeVrm.face.update();
    saveState();
  }
});
const appearancePanel = createAppearancePanel({
  groups: {
    figure: document.getElementById('appearanceFigure'),
    clothes: document.getElementById('appearanceClothes'),
    makeup: document.getElementById('appearanceMakeup')
  },
  empty: document.getElementById('appearanceEmpty'),
  reset: document.getElementById('appearanceReset'),
  onChange: updateAppearance
});
const bodyShapePanel = createBodyShapePanel({
  onChange(settings) {
    if (Object.keys(settings).length) state.bodyShapes[state.model] = settings;
    else delete state.bodyShapes[state.model];
    applyCharacter();
    saveState();
  },
  onExport({ inventory, fields }) {
    const report = { model: modelName(state.model), morphTargets: inventory, bodyControls: fields };
    download('atelier3d-shape-keys.json', new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  }
});
const hairPanel = createHairPanel(color => {
  if (!currentAppearance().fields.has('hair')) return;
  const settings = { ...state.appearances[state.model] };
  if (color) settings.hair = { color, amount: 100 };
  else delete settings.hair;
  updateAppearance(settings);
});
function updateAppearance(settings) {
  state.appearances[state.model] = settings;
  applyAppearance();
  syncAppearancePanel();
  saveState();
}
function currentAppearance() {
  return activeVrm ? activeVrm.appearance : mannequinAppearance;
}
function syncAppearancePanel() {
  const appearance = currentAppearance();
  const settings = state.appearances[state.model];
  appearancePanel.show(appearance, settings);
  hairPanel.show(appearance.fields.get('hair'), settings?.hair);
  document.getElementById('wardrobePaletteLink').hidden = ![...appearance.fields.values()]
    .some(field => field.group === 'clothes');
}
function applyAppearance() {
  currentAppearance().apply(state.appearances[state.model], state.style);
}

const studioLight = createStudioLight({
  scene, camera, canvas: renderer.domElement, orbit: controls,
  ambient: ambientLight, key: keyLight, rim,
  moveLight(position) {
    state.lightX = Number(position.x.toFixed(1));
    state.lightY = Number(position.y.toFixed(1));
    state.lightZ = Number(position.z.toFixed(1));
    syncSliders(LIGHT_FIELDS);
    applyLighting();
    saveState();
  }
});

let libraryHold;
let libraryPreview;
const poseLibrary = createPoseLibrary(document.getElementById('poseLibrary'), {
  adopt(bookmark, sample, label) {
    libraryPreview = undefined;
    libraryHold = { sample, reference: referenceControls(sample) };
    state.libraryPose = bookmark;
    Object.assign(state, libraryHold.reference, { preset: 'library' });
    syncSliders();
    applyCharacter();
    saveState();
    toast(label + ' als Pose übernommen.');
  },
  preview(sample) {
    if (!libraryPreview) {
      libraryPreview = sample;
      if (!animeViewport) activeVrm?.applyPose({ ...state, clothGravity: false }, libraryHold, currentOutfit());
      syncSliders();
    }
    libraryPreview = sample;
    showLibraryPreview();
  },
  finishPreview() {
    libraryPreview = undefined;
    syncSliders();
    applyCharacter();
  }
});

function referenceControls(sample) {
  const values = { ...POSE_OFFSETS, ...PRESETS.neutral, ...libraryControls(sample) };
  for (const field of POSE_FIELDS) {
    const { min, max } = getPoseLimit(field, values);
    values[field.key] = clamp(Math.round(values[field.key]), min, max);
  }
  return values;
}

function showLibraryPreview() {
  if (activeVrm && !animeViewport) activeVrm.previewLibrary(libraryPreview);
  else {
    mannequinLibrary.preview(libraryPreview);
    if (animeViewport) updateAnimePose();
  }
}

function clearLibraryPose() {
  poseLibrary.cancel({ restore: false });
  libraryPreview = libraryHold = undefined;
  state.libraryPose = null;
}

async function restoreLibraryPose() {
  const bookmark = state.libraryPose;
  libraryHold = undefined;
  if (!bookmark) return;
  try {
    const sample = await poseLibrary.restore(bookmark);
    if (sample && state.libraryPose === bookmark) {
      libraryHold = { sample, reference: referenceControls(sample) };
      applyCharacter();
    }
  } catch (error) {
    if (state.libraryPose === bookmark) toast('Die gespeicherte Bibliothekspose konnte nicht geladen werden.');
    console.warn('Gespeicherte Bibliothekspose', error);
  }
}

function applyMannequin(pose = state) {
  figure.scale.setScalar(pose.height);
  hips.position.y = 1.7 * pose.legs;
  legL.hip.scale.y = pose.legs;
  legR.hip.scale.y = pose.legs;
  faceGroup.scale.setScalar(pose.head * (pose.style === 'anime' ? 1.13 : 0.92));
  torso.scale.x = .35 * pose.torso;
  chest.scale.x = .44 * pose.shoulders * (1 + (pose.chest - 1) * .6);
  chest.scale.z = .24 * pose.chest;
  pelvis.scale.x = .36 * (pose.torso * .55 + .45) * (1 + (pose.glutes - 1) * .65);
  pelvis.scale.z = .22 * pose.glutes;
  pelvis.position.z = -.06 * (pose.glutes - 1);
  legL.hip.position.x = -.22 * (1 + (pose.glutes - 1) * .30);
  legR.hip.position.x = .22 * (1 + (pose.glutes - 1) * .30);
  armL.shoulder.position.x = -.445 * pose.shoulders;
  armR.shoulder.position.x = .445 * pose.shoulders;
  const anime = pose.style === 'anime';
  eyeL.scale.set(anime ? .052 : .032, anime ? .066 : .029, .024);
  eyeR.scale.copy(eyeL.scale);
  pupilL.scale.set(anime ? .028 : .017, anime ? .043 : .019, .011);
  pupilR.scale.copy(pupilL.scale);
  mannequinLibrary.prepare(libraryHold, applyMannequinJoints);
  applyMannequinJoints(pose);
  mannequinLibrary.apply();
  for (const joint of joints) joint.visible = pose.showJoints;
}

function currentOutfit() {
  return readWardrobe(state.wardrobes[state.model], undefined, MODELS[state.model]?.bodyShapeProfile?.wardrobeLabels);
}

function removeLocalClothing(id) {
  localClothesSessions.get(id)?.dispose();
  localClothesSessions.delete(id);
}

function reconcileLocalClothing() {
  for (const [id, { model, source }] of localClothesSessions) {
    if (JSON.stringify(state.localClothes[model]?.[id]?.source) !== JSON.stringify(source)) {
      removeLocalClothing(id);
    }
  }
}

function localClothingSlots() {
  const slots = new Set();
  for (const [id, item] of Object.entries(state.localClothes[state.model] ?? {})) {
    if (!item.visible || !localClothesSessions.has(id)) continue;
    slots.add(item.slot);
    if (item.slot === 'dress') {
      slots.add('top');
      slots.add('bottom');
    }
  }
  return slots;
}

function syncWardrobePanel(overriddenSlots = localClothingSlots()) {
  const anchors = activeVrm ? activeVrm.attachmentAnchors : mannequinAnchors;
  const equipped = state.accessories[state.model] ?? emptyAccessories;
  const assets = [
    ...matchingAccessories(state.model, anchors),
    ...localAssetEntries(state.model, anchors, activeVrm, equipped, localAssetSources.has)
  ];
  wardrobeAttachments.apply(state.model, anchors, assets, equipped, usesLocalFraming(state.model) ? 1 : state.head);
  wardrobePanel.show({
    model: state.model, wardrobe: activeVrm?.wardrobe, outfit: currentOutfit(), assets, equipped, overriddenSlots
  });
  localClothesPanel.show({
    model: state.model, supported: Boolean(activeVrm?.wardrobe?.attachLocalClothing),
    items: state.localClothes[state.model] ?? {}, sessions: localClothesSessions
  });
}

async function importWardrobeAsset(files, targetId, isCurrent) {
  const { model, accessories } = state;
  const avatar = activeVrm;
  const existing = targetId ? accessories[model]?.[targetId] : undefined;
  if (targetId && !existing?.source) return;
  const id = targetId ?? 'local-' + crypto.randomUUID();
  const result = await loadLocalWardrobeAsset(files, existing?.source);
  const equipped = accessories[model];
  if (!isCurrent() || accessories !== state.accessories || model !== state.model ||
      avatar !== activeVrm || (targetId && !equipped?.[id])) {
    disposeWardrobeObject(result.object);
    return;
  }

  const item = equipped?.[id] ?? { ...defaultAccessory(), anchor: 'head', source: result.source };
  localAssetSources.remember(id, result, item.visible);
  (accessories[model] ??= {})[id] = item;
  syncWardrobePanel();
  saveState();
  return { id, name: item.source.name };
}

async function importLocalClothes(files, { id = null, slot }, isCurrent) {
  const { model, localClothes } = state;
  const wardrobe = activeVrm?.wardrobe;
  const existing = id ? localClothes[model]?.[id] : undefined;
  if (id && !existing) return;
  if (!wardrobe?.attachLocalClothing) throw new Error('Diese Figur unterstützt keine importierte Wechselkleidung.');
  const category = existing?.slot ?? slot;
  if (!Object.hasOwn(CLOTHING_SLOTS, category)) return;
  const result = await loadLocalWardrobeAsset(files, existing?.source, { skinned: true });
  if (!isCurrent() || model !== state.model || wardrobe !== activeVrm?.wardrobe ||
      localClothes !== state.localClothes || (id && localClothes[model]?.[id] !== existing)) {
    disposeWardrobeObject(result.object);
    return;
  }
  let garment;
  try {
    garment = wardrobe.attachLocalClothing(result.object);
  } catch (error) {
    disposeWardrobeObject(result.object);
    throw error;
  }
  id ??= 'local-' + crypto.randomUUID();
  removeLocalClothing(id);
  localClothesSessions.set(id, { ...garment, model, source: result.source });
  const items = localClothes[model] ??= {};
  items[id] = existing ?? { source: result.source, slot: category, visible: false };
  if (!existing) wearLocalClothing(items, id);
  applyCharacter();
  saveState();
  const name = result.source.name;
  const shapeHint = garment.matchedShapes
    ? `Körperform-Shape-Keys: ${garment.matchedShapes} von ${garment.totalShapes}.`
    : 'Die Passform ist für die Originalkörperform vorgesehen.';
  return { id, message: `${name} wurde lokal geladen. ${shapeHint}` };
}

const demoProportions = Object.fromEntries(BODY_FIELDS.map(({ key }) => [key, DEFAULTS[key]]));

function syncPresetButtons() {
  document.querySelectorAll('[data-preset]').forEach(el => el.classList.toggle('is-active', el.dataset.preset === state.preset));
}

function updateAnimePose() {
  const warning = animeViewport.update(state.animeShowRig, state.animeClothing[animeViewport.modelId], state.animeHairPreview);
  if (animeWarning.textContent !== warning) animeWarning.textContent = warning;
  animeWarning.hidden = !warning;
}

function animeClothingOptions() {
  return animeModels[animeViewport?.modelId]?.clothing;
}

function syncAnimeClothing() {
  const id = animeViewport?.modelId;
  const items = Object.entries(animeClothingOptions() ?? {});
  animeClothes.hidden = !items.length;
  animeClothesFields.replaceChildren(...items.map(([layer, name]) => {
    const label = document.createElement('label');
    label.className = 'check-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.layer = layer;
    checkbox.checked = state.animeClothing[id]?.[layer] !== false;
    label.append(checkbox, ' ' + name);
    return label;
  }));
  document.getElementById('animeClothesReset').disabled = !state.animeClothing[id];
}

function syncDisplayUi() {
  const wantsAnime = state.displayMode === '2.5d';
  const animeActive = Boolean(animeViewport);
  modeSelect.value = state.displayMode;
  animeModelSelect.value = state.anime25dModel;
  const credits = animeViewport?.credits;
  animeCredits.hidden = !credits;
  animeCredits.textContent = credits ? `${credits.author} · ${credits.license}` : '';
  document.getElementById('animeFigureOptions').hidden = !wantsAnime;
  document.getElementById('figure3dOptions').hidden = wantsAnime;
  document.getElementById('animeViewControls').hidden = !animeActive;
  document.getElementById('animeTorsoControls').hidden = !animeActive;
  const currentAnime = animeActive && animeViewport.modelId === state.anime25dModel;
  animeHairPreview.parentElement.hidden = !(currentAnime && animeViewport.hairPreview);
  animeHairPreview.checked = state.animeHairPreview;
  animeHairError.hidden = !(currentAnime && animeViewport.hairPreviewError);
  animeGuide.checked = state.animeShowRig;
  animeWarning.hidden = true;
  workspace.classList.toggle('is-anime25d', animeActive);
  controls.enabled = !animeActive;
  stage.setAttribute('aria-label', animeActive ? '2.5D-Anime in Vorderansicht' : 'Interaktive 3D-Ansicht');
  modelLabel.textContent = animeActive ? `2.5D-Anime · ${animeViewport.label}` : modelName(state.model);
  syncAnimeClothing();
  for (const button of toolButtons) button.hidden = animeActive && !allowsAnimeTab(button.dataset.tab);
  changeTab(activeTab, panelOpen);
  syncSliders();
}

async function syncDisplayMode() {
  const request = ++displayRequest;
  if (state.displayMode !== '2.5d') {
    animeViewport?.dispose();
    animeViewport = undefined;
    animeModeStatus.hidden = true;
    syncDisplayUi();
    applyCharacter();
    return;
  }
  const modelId = state.anime25dModel;
  const model = animeModels[modelId];
  if (animeViewport?.modelId !== modelId) {
    syncDisplayUi();
    animeModeStatus.textContent = `${model.label} wird geladen …`;
    animeModeStatus.hidden = false;
    try {
      const { createAnimeViewport } = await import('./anime25d/viewport.js?v=2532');
      if (request !== displayRequest) return;
      const view = await createAnimeViewport({ bones: mannequin.bones, hips, modelId, model });
      if (request !== displayRequest) {
        view.dispose();
        return;
      }
      animeViewport?.dispose();
      animeViewport = view;
    } catch (error) {
      if (request !== displayRequest) return;
      console.warn('2.5D-Modell', error);
      state.anime25dModel = animeViewport?.modelId ?? DEFAULT_ANIME_MODEL;
      if (!animeViewport) state.displayMode = '3d';
      syncDisplayUi();
      animeModeStatus.textContent = `${model.label} konnte nicht geladen werden. ${error.message}`;
      if (animeViewport) updateAnimePose();
      saveState();
      return;
    }
  }
  animeModeStatus.hidden = true;
  syncDisplayUi();
  resize();
  applyCharacter();
}

function applyCharacter(preparedVrm = false) {
  if (animeViewport) {
    applyMannequin({ ...state, ...demoProportions });
    if (libraryPreview) showLibraryPreview();
    else updateAnimePose();
    syncPresetButtons();
    return;
  }
  const overridden = localClothingSlots();
  if (activeVrm && !preparedVrm) {
    const outfit = activeVrm.wardrobe ? currentOutfit() : undefined;
    if (outfit && overridden.size) {
      for (const slot of overridden) outfit[slot] = slot === 'dress' ? 'none' : 'original';
      if (overridden.has('top') || overridden.has('bottom')) outfit.dress = 'none';
    }
    for (const [id, item] of Object.entries(state.localClothes[state.model] ?? {})) {
      const garment = localClothesSessions.get(id);
      if (garment) garment.object.visible = item.visible;
    }
    activeVrm.wardrobe?.equip(outfit);
    activeVrm.face?.set(state.faces[state.model]);
    activeVrm.bodyShapes?.set(state.bodyShapes[state.model]);
    activeVrm.applyPose(libraryPreview ? { ...state, clothGravity: false } : state, libraryHold, outfit);
  } else if (!activeVrm) {
    applyMannequin();
  }
  if (libraryPreview) showLibraryPreview();
  bodyShapePanel.show(activeVrm?.bodyShapes, state.bodyShapes[state.model]);
  applyAppearance();
  syncWardrobePanel(overridden);
  syncMotionControls();
  grid.visible = state.showGrid;
  document.querySelectorAll('[data-style]').forEach(el => el.classList.toggle('is-active', el.dataset.style === state.style));
  syncPresetButtons();
  document.getElementById('showGrid').checked = state.showGrid;
  document.getElementById('showJoints').checked = state.showJoints;
  applyLighting();
}

function syncMotionControls() {
  const { hasSprings, hasCloth } = activeVrm?.motion ?? {};
  const available = hasSprings || hasCloth;
  clothGravityControl.checked = Boolean(available && state.clothGravity);
  clothGravityControl.disabled = !available;
  clothPauseButton.disabled = !available || !state.clothGravity;
  clothPauseButton.textContent = clothPaused ? 'Bewegung fortsetzen' : 'Bewegung einfrieren';
  if (!available) {
    clothesAvailability.textContent = activeVrm
      ? 'Dieses Modell hat keine Spring Bones oder für Stoffbewegung markierten Flächen.'
      : 'Diese Gliederpuppe hat keine bewegliche Kleidung oder Haare.';
  } else if (hasSprings && hasCloth) {
    clothesAvailability.textContent = 'Spring Bones und bewegliche Stoffflächen sind verfügbar.';
  } else {
    clothesAvailability.textContent = hasSprings
      ? 'Die Spring Bones dieses Modells bewegen die dafür vorbereiteten Haare oder Kleidung.'
      : 'Schwerkraft wirkt auf die beweglichen Teile der Kleidung.';
  }
}

function applyLighting() {
  lightEnabledInput.checked = state.lightEnabled;
  lightColorInput.value = state.lightColor;
  const localFraming = usesLocalFraming(state.model);
  const toon = localFraming ? activeVrm?.toon : MODELS[state.model].toon;
  const lightSettings = localFraming ? { ...state, legs: 1 } : state;
  studioLight.apply(lightSettings, activeVrm?.object ?? figure, toon);
  studioLight.showHandle(state.lightEnabled && panelOpen && activeTab === 'light');
}

function getVrmModel(id) {
  if (!vrmModels.has(id)) {
    const loading = import('./vrm-character.js')
      .then(({ loadVrmCharacter }) => loadVrmCharacter(MODELS[id].url, MODELS[id].bodyShapeProfile))
      .catch(error => {
        vrmModels.delete(id);
        throw error;
      });
    vrmModels.set(id, loading);
  }
  return vrmModels.get(id);
}

function modelName(id) {
  return id === IMPORTED_MODEL ? importedVrm.info.name : MODELS[id].label;
}

function syncImportPanel() {
  importedOption.hidden = importedOption.disabled = !importedVrm;
  importedOption.textContent = importedVrm?.info.name ?? '';
  const needsFile = state.importedModel && !importedVrm;
  importedHint.hidden = !needsFile;
  importedHint.textContent = needsFile ? `Wähle ${state.importedModel.name} erneut aus, um das gespeicherte Modell zu öffnen.` : '';
  removeVrmButton.hidden = !state.importedModel;
}

function usesLocalFraming(id) {
  return id === IMPORTED_MODEL || Boolean(MODELS[id]?.bodyShapeProfile);
}

function frameLocalModel(bounds = new THREE.Box3().setFromObject(activeVrm.object, true)) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const halfFov = deg(camera.fov / 2);
  const limitingAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
  const distance = Math.max(controls.minDistance, 1.12 * sphere.radius / Math.sin(limitingAngle));
  const direction = camera.position.clone().sub(controls.target).normalize();
  controls.maxDistance = Math.max(15, distance * 1.5);
  camera.far = Math.max(100, controls.maxDistance + 10);
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  controls.update();
}

function activateModel(id, nextVrm, preparedBounds) {
  const previousVrm = activeVrm;
  const localFraming = usesLocalFraming(id);
  if (localFraming && !usesLocalFraming(state.model)) {
    builtinCamera = { position: camera.position.clone(), target: controls.target.clone() };
  } else if (!localFraming && builtinCamera) {
    camera.position.copy(builtinCamera.position);
    controls.target.copy(builtinCamera.target);
    controls.maxDistance = 15;
    camera.far = 100;
    camera.updateProjectionMatrix();
    controls.update();
    builtinCamera = undefined;
  }
  if (previousVrm !== nextVrm) {
    wardrobePanel.cancelLocalImport();
    if (poseLibrary.previewActive) poseLibrary.cancel({ restore: false });
    libraryPreview = undefined;
    if (previousVrm) scene.remove(previousVrm.object);
    if (nextVrm) scene.add(nextVrm.object);
    activeVrm = nextVrm;
  }
  state.model = id;
  syncImportPanel();
  modelSelect.value = id;
  figure.visible = !activeVrm;
  const bodyHint = document.getElementById('importedBodyHint');
  bodyHint.hidden = !localFraming;
  bodyHint.textContent = nextVrm?.bodyShapes
    ? 'Die Gesamtgröße skaliert die ganze Figur. Modellspezifische Körperformen stehen unter „Erweiterte Körperform“.'
    : 'Bei eigenen Modellen kannst du die Gesamtgröße einstellen.';
  if (nextVrm?.bodyShapes) {
    const shapes = readBodyShapeSettings(state.bodyShapes[id], nextVrm.bodyShapes.fields);
    if (Object.keys(shapes).length) state.bodyShapes[id] = shapes;
    else delete state.bodyShapes[id];
  }
  mannequinControls.classList.toggle('hidden', Boolean(activeVrm));
  document.getElementById('showJoints').disabled = Boolean(activeVrm);
  document.getElementById('jointAvailability').classList.toggle('hidden', !activeVrm);
  if (!animeViewport) modelLabel.textContent = modelName(id);
  modelStatus.textContent = '';
  document.getElementById('faceUnavailable').textContent = localFraming
    ? 'Dieses Modell enthält keine unterstützten Gesichtsausdrücke.'
    : 'Gesichtsausdrücke sind bei den VRM-Figuren im Menü Figur verfügbar.';
  facePanel.show(activeVrm?.face, state.faces[id]);
  syncAppearancePanel();
  syncSliders();
  applyCharacter(Boolean(preparedBounds) && !libraryHold);
  if (localFraming && previousVrm !== nextVrm) frameLocalModel(preparedBounds);
}

async function selectModel(id) {
  const request = ++modelRequest;
  if (id === IMPORTED_MODEL && !importedVrm) id = DEFAULTS.model;
  const label = modelName(id);
  modelSelect.value = id;
  const url = MODELS[id]?.url;
  modelStatus.textContent = url && id !== state.model ? `${label} wird geladen …` : '';
  try {
    const nextVrm = id === IMPORTED_MODEL ? importedVrm.avatar : url ? await getVrmModel(id) : undefined;
    if (request !== modelRequest) return;
    activateModel(id, nextVrm);
    saveState();
  } catch (error) {
    if (request !== modelRequest) return;
    console.warn('VRM konnte nicht geladen werden.', error);
    modelSelect.value = state.model;
    const detail = MODELS[id]?.bodyShapeProfile ? ` ${error.message}` : '';
    modelStatus.textContent = `${label} konnte nicht geladen werden.${detail} Aktive Figur: ${modelName(state.model)}.`;
  }
}

async function importLocalModel(file) {
  const request = ++modelRequest;
  modelSelect.value = state.model;
  modelStatus.textContent = `${file.name} wird lokal geöffnet …`;
  let avatar;
  let bounds;
  const reopening = sameVrmFile(file, state.importedModel);
  const importedPose = reopening ? state.importedModel.pose : undefined;
  try {
    if (!/\.vrm$/i.test(file.name)) throw new Error('Bitte wähle eine Datei mit der Endung .vrm.');
    const { loadLocalVrmCharacter } = await import('./vrm-character.js');
    avatar = await loadLocalVrmCharacter(file);
    if (request !== modelRequest) {
      avatar.dispose();
      return;
    }
    if (reopening) avatar.face?.set(state.faces[IMPORTED_MODEL]);
    avatar.applyPose({ ...state, ...importedPose });
    bounds = new THREE.Box3().setFromObject(avatar.object, true);
    if (bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite)) {
      throw new Error('Das Skelett kann mit der gespeicherten Pose nicht dargestellt werden.');
    }
  } catch (error) {
    avatar?.dispose();
    if (request !== modelRequest) return;
    if (avatar) console.warn('VRM konnte nicht in Pose dargestellt werden.', error);
    modelStatus.textContent = `${file.name}: ${avatar ? 'Das Skelett oder die gespeicherte Pose konnte nicht dargestellt werden.' : error.message}`;
    return;
  }

  const previous = importedVrm;
  const info = { name: file.name, size: file.size };
  if (reopening) {
    Object.assign(state, importedPose);
    if (importedPose && Object.hasOwn(importedPose, 'libraryPose')) restoreLibraryPose();
  } else {
    delete state.faces[IMPORTED_MODEL];
    delete state.appearances[IMPORTED_MODEL];
    delete state.accessories[IMPORTED_MODEL];
    localAssetSources.reconcile(state.accessories);
  }
  importedVrm = { avatar, info };
  state.importedModel = info;
  activateModel(IMPORTED_MODEL, avatar, bounds);
  previous?.avatar.dispose();
  saveState();
  modelStatus.textContent = `${info.name} wurde importiert.`;
}

function releaseImportedModel() {
  const previous = importedVrm;
  importedVrm = undefined;
  if (state.model === IMPORTED_MODEL) activateModel(DEFAULTS.model);
  previous?.avatar.dispose();
  syncImportPanel();
}

function buildSliders(fields, container, apply = applyCharacter) {
  for (const field of fields) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-control';
    if (field.key.endsWith('Curl')) wrapper.setAttribute('data-only-3d', '');
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
      syncSliders(); apply(); saveState();
    });
    wrapper.append(label,slider);
    container.append(wrapper);
  }
}
buildSliders(BODY_FIELDS, document.getElementById('bodyControls'));
buildSliders(BASIC_POSE_FIELDS.filter(field => field.key.startsWith('head')), document.getElementById('headPoseControls'));
buildSliders(BASIC_POSE_FIELDS.filter(field => field.key === 'torsoTurn'), document.getElementById('torsoPoseControls'));
buildSliders(ANIME_TORSO_FIELDS, document.getElementById('animeTorsoControls'));
const limbFields = [...BASIC_POSE_FIELDS, ...EXTRA_LIMB_FIELDS, ...KNEE_TWIST_FIELDS];
buildSliders(limbFields.filter(field => /Arm|Elbow|Forearm/.test(field.key)), document.getElementById('extraLimbControls'));
buildSliders(limbFields.filter(field => /Leg|Knee|Hip/.test(field.key)), document.getElementById('legPoseControls'));
buildSliders(HAND_FIELDS[0], document.getElementById('leftHandControls'));
buildSliders(HAND_FIELDS[1], document.getElementById('rightHandControls'));
buildSliders(LIGHT_FIELDS, document.getElementById('lightControls'), applyLighting);
function syncSliders(fields = [...BODY_FIELDS, ...POSE_FIELDS, ...LIGHT_FIELDS]) {
  constrainCoupledJoints();
  for (const field of fields) {
    const input = document.getElementById(`control-${field.key}`);
    const { min, max } = getPoseLimit(field);
    input.min = min;
    input.max = max;
    input.disabled = min === max || Boolean(!animeViewport && activeVrm?.unavailableFields.has(field.key)) ||
      Boolean(libraryPreview && POSE_FIELDS.includes(field));
    input.value = String(state[field.key]);
    input.previousElementSibling.querySelector('output').value = `${state[field.key]}${field.unit}`;
  }
}
function allowsAnimeTab(tab) {
  return animeTabs.has(tab) || (tab === 'clothes' && Boolean(animeClothingOptions()));
}

function changeTab(tab, open = true) {
  if (animeViewport && !allowsAnimeTab(tab)) tab = 'figure';
  if (activeTab !== tab) settingsPanel.scrollTop = 0;
  activeTab = tab;
  panelOpen = open;
  if (open && tab === 'face') facePanel.show(activeVrm?.face, state.faces[state.model]);
  if (open && tab === 'appearance') syncAppearancePanel();
  workspace.classList.toggle('panel-collapsed', !open);
  settingsPanel.hidden = !open;
  toolsToggle.setAttribute('aria-expanded', String(open));
  toolsToggle.textContent = open ? 'Panel ausblenden' : 'Panel einblenden';
  for (const button of toolButtons) {
    const selected = button.dataset.tab === tab;
    document.getElementById(button.getAttribute('aria-controls')).classList.toggle('hidden', !selected);
    button.classList.toggle('is-active', selected && open);
    button.setAttribute('aria-pressed', String(selected && open));
  }
  studioLight.showHandle(!animeViewport && state.lightEnabled && open && tab === 'light');
}
enablePoseDrag({
  canvas: renderer.domElement, camera, controls, fields: POSE_FIELDS,
  getCharacter: () => libraryPreview || animeViewport ? undefined : activeVrm ?? mannequin,
  getValue: key => state[key],
  getLimit: getPoseLimit,
  getLimbMode: () => document.getElementById('limbDragMode').value,
  updatePose(values) {
    Object.assign(state, values, { preset: 'custom' });
    syncSliders();
    applyCharacter();
  },
  savePose: saveState
});
for (const button of toolButtons) {
  button.addEventListener('click', () => changeTab(button.dataset.tab, !panelOpen || activeTab !== button.dataset.tab));
}
document.querySelectorAll('[data-open-tools]').forEach(button =>
  button.addEventListener('click', () => changeTab(button.dataset.openTools))
);
toolsToggle.addEventListener('click', () => changeTab(activeTab, !panelOpen));
modeSelect.addEventListener('change', () => {
  state.displayMode = modeSelect.value;
  syncDisplayMode();
  saveState();
});
animeModelSelect.addEventListener('change', async () => {
  state.anime25dModel = readAnimeModel(animeModelSelect.value);
  await syncDisplayMode();
  saveState();
});
animeGuide.addEventListener('change', () => {
  state.animeShowRig = animeGuide.checked;
  if (animeViewport) updateAnimePose();
  saveState();
});
animeHairPreview.addEventListener('change', () => {
  state.animeHairPreview = animeHairPreview.checked;
  if (animeViewport) updateAnimePose();
  saveState();
});
animeClothesFields.addEventListener('change', event => {
  const { modelId } = animeViewport;
  const { layer } = event.target.dataset;
  state.animeClothing = readAnimeClothing({
    ...state.animeClothing,
    [modelId]: { ...state.animeClothing[modelId], [layer]: event.target.checked }
  });
  document.getElementById('animeClothesReset').disabled = !state.animeClothing[modelId];
  updateAnimePose();
  saveState();
});
document.getElementById('animeClothesReset').addEventListener('click', () => {
  state.animeClothing = readAnimeClothing({ ...state.animeClothing, [animeViewport.modelId]: {} });
  syncAnimeClothing();
  updateAnimePose();
  saveState();
});
modelSelect.addEventListener('change', () => selectModel(modelSelect.value));
document.getElementById('importVrm').addEventListener('click', () => localVrmInput.click());
localVrmInput.addEventListener('change', () => {
  const file = localVrmInput.files?.[0];
  localVrmInput.value = '';
  if (file) importLocalModel(file);
});
removeVrmButton.addEventListener('click', () => {
  ++modelRequest;
  state.importedModel = null;
  delete state.faces[IMPORTED_MODEL];
  delete state.appearances[IMPORTED_MODEL];
  delete state.accessories[IMPORTED_MODEL];
  localAssetSources.reconcile(state.accessories);
  releaseImportedModel();
  modelSelect.value = state.model;
  modelStatus.textContent = '';
  saveState();
});
lightEnabledInput.addEventListener('change', () => {
  state.lightEnabled = lightEnabledInput.checked;
  applyLighting();
  saveState();
});
lightColorInput.addEventListener('input', () => {
  state.lightColor = lightColorInput.value;
  applyLighting();
  saveState();
});
clothGravityControl.addEventListener('change', () => {
  state.clothGravity = clothGravityControl.checked;
  clothPaused = false;
  applyCharacter();
  saveState();
});
clothPauseButton.addEventListener('click', () => {
  clothPaused = !clothPaused;
  syncMotionControls();
});
document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
  state.style = button.dataset.style; applyCharacter(); saveState();
}));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  clearLibraryPose();
  Object.assign(state, POSE_OFFSETS, PRESETS[button.dataset.preset]);
  state.preset = button.dataset.preset;
  syncSliders(); applyCharacter(); saveState(); changeTab('pose');
  toast('Pose angewendet – Gelenke kannst du links anpassen.');
}));
document.getElementById('showGrid').addEventListener('change', e => { state.showGrid = e.target.checked; applyCharacter(); saveState(); });
document.getElementById('showJoints').addEventListener('change', e => { state.showJoints = e.target.checked; applyCharacter(); saveState(); });
document.getElementById('cameraReset').addEventListener('click', () => {
  camera.position.copy(startCamera);
  controls.target.copy(targetCamera);
  if (usesLocalFraming(state.model)) frameLocalModel();
  controls.update();
  toast('Kamera zurückgesetzt.');
});
document.getElementById('resetAll').addEventListener('click', () => {
  clothPaused = false;
  clearLibraryPose();
  state.faces = {};
  state.appearances = {};
  state.wardrobes = {};
  state.accessories = {};
  state.bodyShapes = {};
  state.localClothes = {};
  localAssetSources.reconcile(state.accessories);
  reconcileLocalClothing();
  wardrobePanel.cancelLocalImport();
  localClothesPanel.cancel();
  Object.assign(state, DEFAULTS, { model: state.model });
  syncDisplayMode();
  releaseImportedModel();
  selectModel(DEFAULTS.model); changeTab('figure', panelOpen); toast('Alle Einstellungen zurückgesetzt.');
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
document.getElementById('importConfig').addEventListener('click', () => document.getElementById('loadConfig').click());
document.getElementById('loadConfig').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object') throw new Error('Ungültige Datei');
    clearLibraryPose();
    const model = readState(parsed);
    localAssetSources.reconcile(state.accessories);
    reconcileLocalClothing();
    wardrobePanel.cancelLocalImport();
    localClothesPanel.cancel();
    restoreLibraryPose();
    clothPaused = false;
    if (!sameVrmFile(importedVrm?.info, state.importedModel)) releaseImportedModel();
    syncSliders(); syncAppearancePanel(); syncDisplayMode(); saveState(); selectModel(model); toast('Einstellungen importiert.');
  } catch { toast('Die JSON-Datei konnte nicht gelesen werden.'); }
  e.target.value = '';
});
document.getElementById('screenshot').addEventListener('click', () => {
  try {
    const isAnime = Boolean(animeViewport);
    studioLight.withoutHandle(() => {
      renderViewport();
      renderer.domElement.toBlob(blob => {
        if (!blob) { toast('PNG konnte nicht erstellt werden.'); return; }
        download(isAnime ? 'atelier3d-anime25d.png' : 'atelier3d-figur.png', blob);
        toast(isAnime ? '2.5D-Ansicht als PNG gespeichert.' : '3D-Ansicht als PNG gespeichert.');
      }, 'image/png');
    });
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
  animeViewport?.resize(width, height);
}
function renderViewport() {
  if (animeViewport) animeViewport.render(renderer);
  else renderer.render(scene, camera);
}
const observer = new ResizeObserver(resize);
observer.observe(stage);
window.addEventListener('resize',resize);
applyCharacter();syncSliders();resize();syncImportPanel();syncAppearancePanel();
if (initialModel !== DEFAULTS.model) selectModel(initialModel);
restoreLibraryPose();
if (state.displayMode === '2.5d') syncDisplayMode();
let lastFrameTime;
renderer.setAnimationLoop(time => {
  const delta = lastFrameTime === undefined ? 0 : (time - lastFrameTime) / 1000;
  lastFrameTime = time;
  poseLibrary.advance(delta);
  if (!animeViewport && !clothPaused && !libraryPreview) activeVrm?.motion.advance(delta);
  if (controls.enabled) controls.update();
  renderViewport();
});

import { MathUtils, TextureLoader } from 'three';
import { bindJoints, bindLocal, openBoneSetup } from './rig-map.js';

const layerKinds = new Set(['body', 'face', 'hair', 'clothing', 'accessory']);
const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
const depthSlots = new Set(['left', 'right'].flatMap(side =>
  ['arm', 'hand', 'leg', 'shoe'].map(part => side + '-' + part)));
const numeric = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const tuple = (value, size, min, max) =>
  Array.isArray(value) && value.length === size && value.every(x => numeric(x, min, max));

function requireValue(condition, description) {
  if (!condition) throw new Error(description);
}

function readArtboard(artboard) {
  const { width, height, originX, originY } = artboard ?? {};
  requireValue([width, height].every(value => Number.isInteger(value) && numeric(value, 32, 4096)) &&
    numeric(originX, 0, width) && numeric(originY, 0, height), 'Ungültiges Zeichenbrett im Modell.');
  return { width, height, originX, originY };
}

function readRig(joints, artboard) {
  requireValue(joints && Object.keys(joints).length === bindJoints.size,
    'Die Bindepose muss alle 19 Gelenke enthalten.');
  const rig = new Map();
  for (const [id, base] of bindJoints) {
    const input = joints[id];
    requireValue(tuple(input?.position, 2, -4096, 4096), `Ungültiger Gelenkpunkt „${id}“.`);
    const [x, y] = input.position;
    requireValue(x >= -artboard.originX && x <= artboard.width - artboard.originX &&
      y >= artboard.originY - artboard.height && y <= artboard.originY, `„${id}“ liegt außerhalb des Zeichenbretts.`);
    const angle = input.angle === undefined ? base.angle : MathUtils.degToRad(input.angle);
    const length = input.length ?? base.length;
    requireValue((input.angle === undefined || numeric(input.angle, -360, 360)) && numeric(length, 0, 4096),
      `Ungültige Ausrichtung oder Länge für „${id}“.`);
    rig.set(id, { ...base, x, y, angle, length });
  }
  for (const side of ['left', 'right']) {
    for (const [joint, other] of [['Elbow', 'Forearm'], ['Knee', 'Shin']]) {
      const a = rig.get(side + joint), b = rig.get(side + other);
      requireValue(a.x === b.x && a.y === b.y, `„${a.id}“ und „${b.id}“ benötigen denselben Gelenkpunkt.`);
    }
  }
  requireValue(rig.get('head').x !== rig.get('torso').x || rig.get('head').y !== rig.get('torso').y,
    'Kopf und Rumpf müssen getrennte Gelenkpunkte haben.');
  return rig;
}

function normalizedWeights(weights, rig, id) {
  requireValue(Array.isArray(weights) && weights.length > 0 && weights.length <= 4 &&
    weights.every(entry => rig.has(entry?.bone) && numeric(entry.weight, 0, 1)), `Ungültige Bone Weights in „${id}“.`);
  const sum = weights.reduce((total, entry) => total + entry.weight, 0);
  requireValue(Math.abs(1 - sum) < .001 && new Set(weights.map(entry => entry.bone)).size === weights.length,
    `Die Bone Weights pro Punkt müssen eindeutig sein und zusammen 1 ergeben („${id}“).`);
  return weights.filter(entry => entry.weight > 0).map(({ bone, weight }) => ({ bone, weight: weight / sum }));
}

function gridMesh(layer, rig) {
  const { id, bone, bounds, mesh = {} } = layer;
  const { columns = 1, rows = 1, bend } = mesh;
  requireValue([columns, rows].every(n => Number.isInteger(n) && n >= 1 && n <= 48),
    `Ungültige Gitterauflösung für „${id}“.`);
  const vertices = [], uvs = [], triangles = [], weights = [];
  const [left, bottom, right, top] = bounds;
  let hinge, upper, lower, center;
  if (bend !== undefined) {
    const joints = { leftElbow: 'leftForearm', rightElbow: 'rightForearm', leftKnee: 'leftShin', rightKnee: 'rightShin' };
    requireValue(typeof bend?.joint === 'string' && Object.hasOwn(joints, bend.joint) &&
      numeric(bend.radius, 1, 4096), `Ungültige Gelenküberblendung für „${id}“.`);
    hinge = rig.get(bend.joint);
    upper = hinge.parent;
    lower = joints[hinge.id];
    center = bindLocal(upper, hinge.x, hinge.y, rig)[0];
  }
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const u = col / columns, v = row / rows;
      const x = MathUtils.lerp(left, right, u), y = MathUtils.lerp(top, bottom, v);
      vertices.push(x, y);
      uvs.push(u, v);
      if (hinge) {
        const distance = bindLocal(upper, x, y, rig)[0] - center;
        const fade = MathUtils.smoothstep(distance, -bend.radius, bend.radius);
        const mid = .78 * (1 - MathUtils.smoothstep(Math.abs(distance), 0, bend.radius));
        weights.push([{ bone: upper, weight: (1 - fade) * (1 - mid) },
          { bone: hinge.id, weight: mid }, { bone: lower, weight: fade * (1 - mid) }]);
      } else weights.push([{ bone, weight: 1 }]);
      if (row < rows && col < columns) {
        const i = row * (columns + 1) + col;
        triangles.push(i, i + columns + 1, i + 1, i + 1, i + columns + 1, i + columns + 2);
      }
    }
  }
  return { vertices, uvs, triangles, weights };
}

function attachmentFor(layer, rig) {
  const data = layer.mesh?.vertices !== undefined ? layer.mesh : gridMesh(layer, rig);
  const { vertices, uvs, triangles, weights } = data;
  const count = vertices?.length / 2;
  requireValue(Number.isInteger(count) && numeric(count, 3, 4096) &&
    tuple(vertices, count * 2, -4096, 4096) && tuple(uvs, count * 2, 0, 1),
    `Ungültige Meshpunkte oder UVs in „${layer.id}“.`);
  requireValue(Array.isArray(triangles) && triangles.length >= 3 && triangles.length <= 24576 &&
    triangles.length % 3 === 0 && triangles.every(index => Number.isInteger(index) && index >= 0 && index < count),
    `Ungültige Dreiecke in „${layer.id}“.`);
  requireValue(weights === undefined || (Array.isArray(weights) && weights.length === count),
    `Anzahl der Bone Weights passt in „${layer.id}“ nicht zum Mesh.`);

  const local = [], influences = [];
  for (let i = 0; i < vertices.length; i += 2) {
    const x = vertices[i], y = vertices[i + 1];
    local.push(...bindLocal(layer.bone, x, y, rig));
    influences.push(normalizedWeights(weights?.[i / 2] ?? [{ bone: layer.bone, weight: 1 }], rig, layer.id)
      .map(({ bone, weight }) => {
        const [localX, localY] = bindLocal(bone, x, y, rig);
        return { bone, weight, x: localX, y: localY };
      }));
  }
  return { name: layer.id, image: layer.id, color: '#ffffff', type: 'mesh',
    vertices: local, uvs, triangles, weights: influences, hull: 0 };
}

function pngPath(path, manifestUrl) {
  requireValue(typeof path === 'string' && /^(?:[\w-]+\/)*[\w-]+\.png$/i.test(path),
    'PNG-Pfade müssen relativ sein und im Modellordner liegen.');
  return new URL(path, manifestUrl).href;
}

export function prepareCharacter(manifest, manifestUrl) {
  requireValue(manifest?.format === 'atelier-anime25d' && manifest.version === 1 &&
    manifest.view === 'front' && typeof manifest.name === 'string' && manifest.name.trim(),
    'Ungültiges Anime-Modellmanifest. Erwartet wird Version 1 in Vorderansicht.');
  const credits = manifest.credits;
  requireValue([credits?.author, credits?.license].every(value => typeof value === 'string' && value.trim()),
    'Urheber und Lizenz müssen im Manifest angegeben sein.');
  const artboard = readArtboard(manifest.artboard);
  const rig = readRig(manifest.joints, artboard);
  requireValue(Array.isArray(manifest.layers) && numeric(manifest.layers.length, 1, 96),
    'Das Modell benötigt mindestens eine und höchstens 96 Ebenen.');

  const order = Object.create(null);
  const depth = Object.create(null);
  const slots = [];
  const files = new Map();
  const attachments = {};
  for (const layer of manifest.layers) {
    const { id, kind, element, bone, bounds, order: layerOrder, depthSlot } = layer ?? {};
    requireValue(typeof id === 'string' && idPattern.test(id) && !files.has(id) &&
      typeof element === 'string' && idPattern.test(element) && layerKinds.has(kind) &&
      rig.has(bone) && numeric(layerOrder, -1000, 1000) &&
      (depthSlot === undefined || depthSlots.has(depthSlot)), 'Die Ebene enthält eine ungültige ID, Kategorie oder Knochenzuordnung.');
    requireValue(tuple(bounds, 4, -4096, 4096) && bounds[2] > bounds[0] && bounds[3] > bounds[1],
      `Ungültiger Bildbereich für „${id}“.`);
    requireValue(layer.mesh === undefined || (layer.mesh && typeof layer.mesh === 'object' && !Array.isArray(layer.mesh)),
      `Ungültige Mesh-Konfiguration für „${id}“.`);
    files.set(id, pngPath(layer.image, manifestUrl));
    order[id] = layerOrder;
    if (depthSlot) depth[id] = depthSlot;
    slots.push({ id, name: element, bone, attachment: id, color: '#ffffff', blend: 'normal' });
    attachments[id] = { [id]: attachmentFor(layer, rig) };
  }

  return { rig, order, depth, files, credits, doc: {
    format: 'openbone', version: 1, name: manifest.name.trim(), ...artboard,
    background: '#1a1f2c', fps: 30, images: [],
    skeleton: { bones: openBoneSetup(rig), slots, skins: [{ id: 'default', name: 'default', attachments }],
      ik: [], transform: [], path: [], physics: [] },
    animations: [], events: [], stateMachines: [], scripts: []
  } };
}

export async function loadCharacterAsset(manifestUrl, prepareTexture) {
  const response = await fetch(manifestUrl);
  requireValue(response.ok, 'Das Modellmanifest konnte nicht geladen werden.');
  const { doc, rig, order, depth, files, credits } = prepareCharacter(await response.json(), manifestUrl);
  const textures = new Map();
  const loader = new TextureLoader();
  const loaded = await Promise.allSettled([...files].map(async ([id, url]) => {
    let texture;
    try {
      texture = await loader.loadAsync(url);
    } catch {
      throw new Error(`PNG-Ebene „${id}“ fehlt oder konnte nicht geöffnet werden.`);
    }
    textures.set(id, texture);
    requireValue(texture.image.width <= 4096 && texture.image.height <= 4096, `PNG-Ebene „${id}“ ist größer als 4096 Pixel.`);
    prepareTexture(texture);
    return { id, name: id, src: '', width: texture.image.width, height: texture.image.height };
  }));
  const failure = loaded.find(result => result.status === 'rejected');
  if (failure) {
    for (const texture of textures.values()) texture.dispose();
    throw failure.reason;
  }
  doc.images = loaded.map(result => result.value);
  if (doc.images.reduce((pixels, image) => pixels + image.width * image.height, 0) > 48_000_000) {
    for (const texture of textures.values()) texture.dispose();
    throw new Error('Die PNG-Ebenen belegen zusammen zu viel Texturspeicher. Schneide transparente Ränder beim Export zu.');
  }
  return { asset: { doc, textures, baseUrl: String(manifestUrl) }, rig, order, depth, credits };
}

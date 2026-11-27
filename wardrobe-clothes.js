import { Group, Matrix4, Uint16BufferAttribute, Vector3 } from 'three';
import { readAssetSource } from './wardrobe-catalog.js';
import { usableSkin } from './wardrobe-geometry.js';

export const CLOTHING_SLOTS = {
  top: 'Oberteil', bottom: 'Unterteil', dress: 'Kleid', shoes: 'Schuhe'
};

export function clothingSlotsOverlap(a, b) {
  return a === b || (a === 'dress' && ['top', 'bottom'].includes(b)) ||
    (b === 'dress' && ['top', 'bottom'].includes(a));
}

export function wearLocalClothing(items, id) {
  const item = items[id];
  for (const [otherId, other] of Object.entries(items)) {
    if (clothingSlotsOverlap(item.slot, other.slot)) other.visible = otherId === id;
  }
}

export function readLocalClothes(input, modelIds) {
  const result = {};
  const used = new Set();
  for (const model of modelIds) {
    const items = {};
    for (const [id, saved] of Object.entries(input?.[model] ?? {})) {
      if (!/^local-[a-f0-9-]{36}$/.test(id) || used.has(id) || typeof saved?.slot !== 'string' ||
          !Object.hasOwn(CLOTHING_SLOTS, saved.slot)) continue;
      const source = readAssetSource(saved.source);
      if (!source) continue;
      items[id] = { source, slot: saved.slot, visible: false };
      if (saved.visible !== false) wearLocalClothing(items, id);
      used.add(id);
    }
    if (Object.keys(items).length) result[model] = items;
  }
  return result;
}

const ignorePoseRaycast = () => {};
const poseTolerance = .0025;

export function bindLocalClothing(body, source, bodyMorphs) {
  const meshes = [];
  source.traverse(node => { if (node.isMesh) meshes.push(node); });
  if (!meshes.length || meshes.some(mesh => !mesh.isSkinnedMesh || !usableSkin(mesh))) {
    throw new Error('Exportiere nur gewichtete Kleidungsmeshes mit Normalen und gültigen Gelenkgewichten.');
  }
  if (meshes.some(mesh => /^SiroinoSotai_(PC|Mobile)(?:$|[_.])/i.test(mesh.name) ||
      /^SiroinoSotai_(PC|Mobile)(?:$|[_.])/i.test(mesh.geometry.name))) {
    throw new Error('Die Datei enthält den SiroinoSotai-Körper. Wähle beim Export nur das Kleidungsstück und die Armatur.');
  }

  source.updateMatrixWorld(true);
  const originalRig = meshes[0].skeleton;
  if (meshes.some(mesh => mesh.skeleton !== originalRig)) {
    throw new Error('Alle Kleidungsmeshes müssen dieselbe SiroinoSotai-Armatur verwenden.');
  }
  const reference = body.skeleton;
  const indices = new Map();
  reference.bones.forEach((bone, index) => indices.set(bone.name, indices.has(bone.name) ? -1 : index));
  const jointMap = new Map();
  const target = new Vector3();
  const pivot = new Vector3();
  const rest = new Matrix4();
  const identity = new Matrix4();

  function resolveJoint(index) {
    if (jointMap.has(index)) return jointMap.get(index);
    const bone = originalRig.bones[index];
    const targetIndex = indices.get(bone.name);
    if (targetIndex === undefined || targetIndex < 0) {
      throw new Error(`Das Gelenk „${bone.name}“ gehört nicht eindeutig zum SiroinoSotai-Skelett.`);
    }
    const inverseBind = originalRig.boneInverses[index];
    const expected = reference.boneInverses[targetIndex];
    pivot.setFromMatrixPosition(rest.copy(inverseBind).invert());
    target.setFromMatrixPosition(rest.copy(expected).invert());
    const inRestPose = rest.multiplyMatrices(bone.matrixWorld, inverseBind).elements
      .every((value, column) => Math.abs(value - identity.elements[column]) < poseTolerance);
    if (!inverseBind.elements.every(Number.isFinite) || Math.abs(inverseBind.determinant()) < 1e-8 ||
        !inRestPose || pivot.distanceTo(target) > poseTolerance) {
      throw new Error(`Die Bindepose von „${bone.name}“ passt nicht. Exportiere bei unveränderter Armatur in der originalen T-Pose und Modellgröße.`);
    }
    jointMap.set(index, targetIndex);
    return targetIndex;
  }

  const jointAttributes = new Map();
  const matchedNames = new Set();
  const shapes = [];
  for (const mesh of meshes) {
    const { geometry } = mesh;
    if (!jointAttributes.has(geometry)) {
      const { position, skinIndex, skinWeight } = geometry.attributes;
      const remapped = new Uint16Array(position.count * 4);
      for (let i = 0; i < position.count; i++) {
        if (!Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i))) {
          throw new Error('Das Kleidungsmesh enthält ungültige Positionen.');
        }
        for (let channel = 0; channel < 4; channel++) {
          const weight = skinWeight.getComponent(i, channel);
          if (weight > 0) remapped[i * 4 + channel] = resolveJoint(skinIndex.getComponent(i, channel));
        }
      }
      jointAttributes.set(geometry, new Uint16BufferAttribute(remapped, 4));
    }
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary ?? {})) {
      const attribute = geometry.morphAttributes.position?.[index];
      if (!bodyMorphs.has(name) || attribute?.count !== geometry.attributes.position.count) continue;
      matchedNames.add(name);
      shapes.push({ mesh, index, sourceIndex: bodyMorphs.get(name) });
    }
  }

  const object = new Group();
  object.name = 'Lokal importierte Kleidung';
  for (const [geometry, attribute] of jointAttributes) geometry.setAttribute('skinIndex', attribute);
  for (const mesh of meshes) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.scale.copy(body.scale);
    mesh.updateMatrix();
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.raycast = ignorePoseRaycast;
    mesh.bindMode = body.bindMode;
    mesh.bind(reference, body.bindMatrix);
    object.add(mesh);
  }
  return {
    object,
    matchedShapes: matchedNames.size,
    totalShapes: bodyMorphs.size,
    sync() {
      for (const { mesh, index, sourceIndex } of shapes) {
        mesh.morphTargetInfluences[index] = body.morphTargetInfluences[sourceIndex];
      }
    }
  };
}

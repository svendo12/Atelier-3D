import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { applyLimbPose, fingerNames } from './limb-pose.js';
import { createVrmMotion } from './vrm-motion.js';
import { createVrmProportions, VRM_SHAPE_KEYS } from './vrm-proportions.js';
import { createVrmFace } from './vrm-face.js';
import { createVrmBodyShapes, preferBodyMesh } from './vrm-body-shapes.js';
import { createVrmAppearance } from './appearance-materials.js';
import { createVrmWardrobe } from './vrm-wardrobe.js';
import { createLibraryRig, libraryControls } from './pose-library-rig.js';
import { checkLocalVrm, createLocalLoadingManager } from './vrm-local.js';

function createLoader(manager) {
  return new GLTFLoader(manager).register(parser => new VRMLoaderPlugin(parser));
}

const loader = createLoader();
const legacyRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const inverseLegacyRotation = legacyRotation.clone().invert();
const radians = THREE.MathUtils.degToRad;
const displayHeight = 3.4;
const correctiveAngles = {
  knee_denim: ['Knee', 35, 120],
  knee: ['Knee', 35, 120],
  hip: ['Leg', 45, 105],
  elbow: ['Elbow', 40, 115],
  shoulder: ['Arm', 100, 175],
  shoulder_forward: ['ArmForward', 55, 120],
  wrist_flex: ['WristBend', 20, 70],
  wrist_extend: ['WristBend', 20, 60, -1]
};
const centerCorrectiveAngles = {
  torso_left: ['torsoTurn', 12, 45, -1],
  torso_right: ['torsoTurn', 12, 45],
  neck_flex: ['headPitch', 15, 50, -1],
  neck_extend: ['headPitch', 15, 55]
};
const jointNames = {
  head: 'head',
  spine: 'spine',
  // Existing poses use left/right as seen from the front. VRM names are anatomical.
  leftArm: 'rightUpperArm',
  rightArm: 'leftUpperArm',
  leftElbow: 'rightLowerArm',
  rightElbow: 'leftLowerArm',
  leftHand: 'rightHand',
  rightHand: 'leftHand',
  leftLeg: 'rightUpperLeg',
  rightLeg: 'leftUpperLeg',
  leftKnee: 'rightLowerLeg',
  rightKnee: 'leftLowerLeg',
  leftFoot: 'rightFoot',
  rightFoot: 'leftFoot'
};

function getFingerRigs(humanoid) {
  const worldPosition = bone => bone.getWorldPosition(new THREE.Vector3());
  return Object.fromEntries([['left', 'right', -1], ['right', 'left', 1]].map(([side, prefix, sign]) => {
    const bone = name => humanoid.getNormalizedBoneNode(prefix + name);
    const metacarpal = bone('MiddleProximal');
    const index = bone('IndexProximal');
    const little = bone('LittleProximal');
    const hand = bone('Hand');
    const across = little && index ? worldPosition(little).sub(worldPosition(index)).normalize() : new THREE.Vector3(sign, 0, 0);
    const along = metacarpal ? worldPosition(metacarpal).sub(worldPosition(hand)).normalize() : new THREE.Vector3(sign, 0, 0);
    const palm = along.clone().cross(across).normalize().multiplyScalar(sign);
    if (!palm.lengthSq()) palm.set(0, -1, 0);
    const digits = Object.fromEntries(fingerNames.map(finger => {
      const suffixes = finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
      const joints = suffixes.map(suffix => bone(finger + suffix));
      const curl = finger === 'Thumb' ? palm.clone().addScaledVector(across, 0.6) : palm;
      return [finger, joints.flatMap((joint, i) => {
        if (!joint) return [];
        const next = joints[i + 1];
        const previous = joints[i - 1];
        const direction = next ? worldPosition(next).sub(worldPosition(joint))
          : previous ? worldPosition(joint).sub(worldPosition(previous)) : along.clone();
        const axis = direction.cross(curl).normalize();
        return [{ joint, axis: axis.lengthSq() ? axis : new THREE.Vector3(0, 0, sign), segment: i }];
      })];
    }));
    return [side, digits];
  }));
}

export async function loadVrmCharacter(url, bodyShapeProfile) {
  if (!bodyShapeProfile) return buildVrmCharacter(await loader.loadAsync(url));
  const response = await fetch(url, { redirect: 'error', cache: 'no-cache' });
  if (response.status === 404) {
    throw new Error(`Kopiere deinen VRM-Export nach ${url.replace(/^\.\//, '')} und wähle die Figur erneut.`);
  }
  if (!response.ok) throw new Error(`Der lokale VRM-Export konnte nicht gelesen werden (HTTP ${response.status}).`);
  return parseEmbeddedVrm(await response.arrayBuffer(), bodyShapeProfile);
}

export async function loadLocalVrmCharacter(file) {
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error('Die ausgewählte Datei konnte nicht gelesen werden.');
  }
  return parseEmbeddedVrm(buffer);
}

async function parseEmbeddedVrm(buffer, bodyShapeProfile) {
  checkLocalVrm(buffer);
  const local = createLocalLoadingManager();
  let gltf;
  try {
    gltf = await createLoader(local.manager).parseAsync(buffer, '');
  } catch (error) {
    console.warn('Three-VRM konnte die lokale Datei nicht lesen.', error);
    throw new Error('Three-VRM kann diese Datei nicht öffnen. Prüfe den VRM-Export auf beschädigte Daten oder nicht unterstützte Erweiterungen.');
  } finally {
    local.release();
  }
  return buildVrmCharacter(gltf, true, bodyShapeProfile);
}

function disposeVrm(root, closeImages) {
  const images = new Set();
  if (closeImages && typeof ImageBitmap !== 'undefined') {
    root.traverse(node => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        const textures = Object.values(material);
        if (material.isShaderMaterial) {
          for (const uniform of Object.values(material.uniforms ?? {})) textures.push(uniform?.value);
        }
        for (const texture of textures) {
          if (texture?.isTexture && texture.source?.data instanceof ImageBitmap) images.add(texture.source.data);
        }
      }
    });
  }
  VRMUtils.deepDispose(root);
  for (const bitmap of images) bitmap.close();
}

async function buildVrmCharacter(gltf, imported = false, bodyShapeProfile) {
  try {
    const vrm = gltf.userData.vrm;
    const version = vrm?.meta?.metaVersion;
    if (!vrm?.humanoid || (version !== '1' && version !== '0')) {
      throw new Error('Die Datei enthält kein unterstütztes VRM 0.x- oder VRM 1.0-Humanoid-Rig.');
    }
    const legacy = version === '0';
    if (legacy) VRMUtils.rotateVRM0(vrm);
    const detailedBody = preferBodyMesh(vrm.scene, gltf.parser, bodyShapeProfile?.meshVariants);

    const bones = {};
    for (const [key, name] of Object.entries(jointNames)) {
      const bone = vrm.humanoid.getNormalizedBoneNode(name);
      if (!bone) throw new Error(`VRM-Gelenk fehlt: ${name}`);
      bones[key] = bone;
    }

    const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y <= 0 || !size.toArray().every(Number.isFinite)) {
      throw new Error('Das Modell hat keine gültigen Abmessungen.');
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const object = new THREE.Group();
    const scale = imported ? displayHeight / Math.max(size.y, size.x / 1.4, size.z / 1.4) : displayHeight / size.y;
    const fullBodyId = gltf.parser.json.extras?.atelierWardrobeBodyIndices;
    const fullBodyIndex = !imported && Number.isInteger(fullBodyId)
      ? await gltf.parser.getDependency('accessor', fullBodyId)
      : undefined;
    const bodyShapes = bodyShapeProfile && createVrmBodyShapes(vrm, gltf.parser, bodyShapeProfile);
    const wardrobe = imported ? bodyShapeProfile?.createWardrobe?.(detailedBody, bodyShapes?.fields)
      : createVrmWardrobe(vrm, fullBodyIndex);
    const applyProportions = imported ? undefined : createVrmProportions(vrm, bounds.min.y);
    const face = createVrmFace(vrm);
    const appearance = createVrmAppearance(vrm, gltf.parser, !imported, !imported || Boolean(wardrobe));
    vrm.scene.position.set(-center.x, -bounds.min.y, -center.z);
    object.scale.setScalar(scale);
    object.add(vrm.scene);
    const corrections = [];
    let toon = false;
    const tops = { original: [], short: [] };
    const contactMeshes = [];
    vrm.scene.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      if (node.isSkinnedMesh) node.frustumCulled = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      toon ||= materials.some(material => material.isMToonMaterial);
      if (imported) return;
      if (materials.some(material => material.name === 'Tops_01_CLOTH')) tops.original.push(node);
      if (materials.some(material => material.name === 'Atelier_Cropped_Top')) tops.short.push(node);
      if (materials.some(material => material.name === 'Bottoms_01_CLOTH')) contactMeshes.push(node);
      for (const [name, index] of Object.entries(node.morphTargetDictionary ?? {})) {
        const match = /^atelier_(left|right|center)_(.+)$/.exec(name);
        if (!match) continue;
        const side = match[1] === 'center' ? '' : match[1];
        const angles = (side ? correctiveAngles : centerCorrectiveAngles)[match[2]];
        if (angles) {
          const [joint, start, end, direction = 1] = angles;
          corrections.push({ node, index, key: side + joint, start, end, direction });
        }
      }
    });

    const hemMeshes = new Set([...tops.original, ...tops.short]);
    const motion = createVrmMotion({ vrm, object, builtin: !imported, height: size.y, bones, hemMeshes, contactMeshes });
    const fingers = getFingerRigs(vrm.humanoid);
    bones.leftPalm = fingers.left.Middle[0]?.joint;
    bones.rightPalm = fingers.right.Middle[0]?.joint;
    const unavailableFields = new Set();
    const armBasis = {};
    if (imported) {
      for (const field of VRM_SHAPE_KEYS) unavailableFields.add(field);
      for (const side of ['left', 'right']) {
        const shoulder = bones[side + 'Arm'].getWorldPosition(new THREE.Vector3());
        const elbow = bones[side + 'Elbow'].getWorldPosition(new THREE.Vector3());
        const direction = elbow.sub(shoulder);
        if (direction.lengthSq()) {
          const basis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
          armBasis[side] = [basis, basis.clone().invert()];
        }
        for (const finger of fingerNames) {
          if (!fingers[side][finger].length) unavailableFields.add(side + finger + 'Curl');
        }
      }
    }
    const limbJoints = Object.entries(bones)
      .filter(([name]) => !['head', 'spine', 'leftPalm', 'rightPalm'].includes(name))
      .map(([, bone]) => bone);
    const fingerJoints = Object.values(fingers).flatMap(hand => Object.values(hand).flatMap(digit => digit.map(({ joint }) => joint)));
    const canonicalLimbs = [...limbJoints, ...fingerJoints];
    const rotateLegacyJoint = ({ quaternion }) => quaternion.premultiply(inverseLegacyRotation).multiply(legacyRotation);
    const applyManualLimbs = pose => {
      applyLimbPose(bones, pose, 'tpose', fingers, armBasis);
      // The normalized rig keeps its original bind axes when a VRM 0.x root is turned around.
      if (legacy) canonicalLimbs.forEach(rotateLegacyJoint);
    };
    const applyManual = pose => {
      bones.spine.rotation.set(0, radians(pose.torsoTurn), 0);
      bones.head.rotation.set(-radians(pose.headPitch), radians(pose.headTurn), radians(pose.headTilt), 'YXZ');
      if (legacy) {
        rotateLegacyJoint(bones.spine);
        rotateLegacyJoint(bones.head);
      }
      applyManualLimbs(pose);
    };
    const limbNodes = new Set(canonicalLimbs.filter(node => node !== bones.leftFoot && node !== bones.rightFoot));
    const nodes = Object.fromEntries(
      Object.entries(vrm.humanoid.normalizedHumanBones).map(([name, { node }]) => [name, node])
    );
    const libraryRig = createLibraryRig({
      object, legacy, height: size.y, nodes,
      driven: new Set([...limbNodes, bones.spine, bones.head]), limbNodes
    });
    const resolvePose = pose => {
      vrm.update(0);
      face?.limitMorphWeights();
      bodyShapes?.apply();
      wardrobe?.syncBodyShapes?.();
      for (const { node, index, key, start, end, direction } of corrections) {
        node.morphTargetInfluences[index] = THREE.MathUtils.smoothstep(pose[key] * direction, start, end);
      }
    };
    const shapeKeys = ['height', ...VRM_SHAPE_KEYS];
    let lastShape = shapeKeys.map(() => 1);
    return {
      object,
      bones,
      attachmentAnchors: { ...nodes, chest: nodes.upperChest ?? nodes.chest ?? nodes.spine },
      baseScale: scale,
      legacy,
      toon,
      unavailableFields,
      motion,
      dispose() {
        motion.dispose();
        disposeVrm(gltf.scene, imported);
      },
      face,
      bodyShapes,
      appearance,
      wardrobe,
      applyLimbPose(pose) {
        applyManualLimbs(pose);
        libraryRig.adjustLimbs();
      },
      previewLibrary(sample) {
        libraryRig.preview(sample);
        resolvePose(libraryControls(sample));
        if (wardrobe) motion.retarget(false, false);
      },
      applyPose(pose, hold, outfit) {
        const shape = shapeKeys.map(key => pose[key]);
        const shapeChanged = shape.some((value, i) => value !== lastShape[i]);
        lastShape = shape;
        object.scale.setScalar(scale * pose.height);
        applyProportions?.(pose);
        wardrobe?.fit?.(pose, outfit);
        libraryRig.prepare(hold, applyManual);
        applyManual(pose);
        libraryRig.apply();
        resolvePose(pose);
        motion.retarget(pose.clothGravity, shapeChanged);
      }
    };
  } catch (error) {
    disposeVrm(gltf.scene, imported);
    throw error;
  }
}

import * as THREE from 'three';

export const VRM_SHAPE_KEYS = ['head', 'shoulders', 'torso', 'legs', 'chest', 'glutes'];
const blend = THREE.MathUtils.smoothstep;

// Each rest-space field drives both the surface and the skeleton. Applying the
// same fields before posing keeps clothes and joints aligned across body sizes.
function createFields(humanoid, ground) {
  const getPoint = name => humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3());
  const hips = getPoint('hips');
  const head = getPoint('head');
  const neck = getPoint('neck') ?? head.clone().lerp(hips, 0.15);
  const arms = [getPoint('leftUpperArm'), getPoint('rightUpperArm')];
  const shoulderY = (arms[0].y + arms[1].y) / 2;
  const halfShoulder = Math.abs(arms[0].x - arms[1].x) / 2;
  const hipY = (getPoint('leftUpperLeg').y + getPoint('rightUpperLeg').y) / 2;
  const trunkLength = Math.max(0.15, shoulderY - hipY);
  const waistY = hipY + 0.32 * trunkLength;
  const neckTransition = Math.max(0.04, head.y - neck.y);
  const chest = getPoint('upperChest') ?? getPoint('chest') ?? hips.clone().lerp(neck, 0.8);
  const chestY = shoulderY - 0.18 * trunkLength;
  const hipCenter = getPoint('leftUpperLeg').lerp(getPoint('rightUpperLeg'), 0.5);
  const seatY = hipY - 0.12 * trunkLength;

  return [
    (point, offset) => {
      const amount = blend(point.y, head.y - neckTransition * 0.7, head.y + neckTransition * 0.24);
      return offset.subVectors(point, head).multiplyScalar(amount);
    },
    (point, offset) => {
      const region = blend(point.y, waistY, shoulderY - trunkLength * 0.08)
        * (1 - blend(point.y, shoulderY + trunkLength * 0.16, head.y));
      return offset.set(THREE.MathUtils.clamp(point.x, -halfShoulder, halfShoulder) * region, 0, 0);
    },
    (point, offset) => {
      const region = blend(point.y, hipY - trunkLength * 0.32, waistY)
        * (1 - blend(point.y, waistY + trunkLength * 0.12, shoulderY - trunkLength * 0.05));
      const flank = 1 - blend(Math.abs(point.x), halfShoulder, halfShoulder * 1.7);
      return offset.set(point.x * region * flank, 0, 0);
    },
    (point, offset) => offset.set(0, THREE.MathUtils.clamp(point.y - ground, 0, hipY - ground), 0),
    (point, offset) => {
      const band = blend(point.y, waistY + 0.08 * trunkLength, chestY - 0.10 * trunkLength)
        * (1 - blend(point.y, chestY, shoulderY - 0.015 * trunkLength));
      const x = point.x - chest.x;
      const z = point.z - chest.z;
      const insideRibcage = 1 - blend(Math.abs(x), 0.80 * halfShoulder, 1.37 * halfShoulder);
      return offset.set(x * 0.60, 0, z).multiplyScalar(band * insideRibcage);
    },
    (point, offset) => {
      const band = blend(point.y, hipY - 0.52 * trunkLength, seatY - 0.08 * trunkLength)
        * (1 - blend(point.y, seatY, waistY));
      const x = point.x - hipCenter.x;
      const z = point.z - hipCenter.z;
      const nearHips = 1 - blend(Math.abs(x), 0.93 * halfShoulder, 1.50 * halfShoulder);
      const back = 1 - 0.65 * blend(z, -0.04 * trunkLength, 0.18 * trunkLength);
      return offset.set(x * 0.65, 0, z * back).multiplyScalar(band * nearHips);
    }
  ];
}

function addSurfaceFields(mesh, fields) {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const originalMap = { ...mesh.morphTargetDictionary };
  const positionTargets = geometry.morphAttributes.position ??= [];
  const normalTargets = geometry.morphAttributes.normal ??= [];
  const targetOffset = positionTargets.length;
  const localFromWorld = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).invert();
  const worldNormal = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const localNormal = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).transpose();
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const before = new THREE.Vector3();
  const stepT = new THREE.Vector3();
  const stepB = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  const epsilon = 0.0001;
  const exampleStrength = 0.2;

  for (let i = normalTargets.length; i < targetOffset; i++) {
    normalTargets.push(new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3));
  }
  for (const field of fields) {
    const deltaPosition = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    const deltaNormal = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      field(point, before);
      offset.copy(before).applyMatrix3(localFromWorld);
      deltaPosition.setXYZ(i, offset.x, offset.y, offset.z);

      normal.fromBufferAttribute(normals, i).applyMatrix3(worldNormal).normalize();
      tangent.crossVectors(Math.abs(normal.y) < 0.95 ? up : right, normal).normalize();
      bitangent.crossVectors(normal, tangent);
      // Estimate the change in the normal from two nearby points on the surface.
      field(sample.copy(point).addScaledVector(tangent, epsilon), stepT);
      field(sample.copy(point).addScaledVector(bitangent, epsilon), stepB);
      tangent.addScaledVector(stepT.sub(before), exampleStrength / epsilon);
      bitangent.addScaledVector(stepB.sub(before), exampleStrength / epsilon);
      offset.crossVectors(tangent, bitangent).applyMatrix3(localNormal).normalize();
      offset.sub(normal.fromBufferAttribute(normals, i)).divideScalar(exampleStrength);
      deltaNormal.setXYZ(i, offset.x, offset.y, offset.z);
    }
    positionTargets.push(deltaPosition);
    normalTargets.push(deltaNormal);
  }

  geometry.morphTargetsRelative = true;
  mesh.updateMorphTargets();
  Object.assign(mesh.morphTargetDictionary, originalMap);
  VRM_SHAPE_KEYS.forEach((key, index) => { mesh.morphTargetDictionary['proportion_' + key] = targetOffset + index; });
  return amounts => amounts.forEach((amount, index) => {
    mesh.morphTargetInfluences[targetOffset + index] = amount;
  });
}

export function createVrmProportions(vrm, ground) {
  vrm.scene.updateMatrixWorld(true);
  const fields = createFields(vrm.humanoid, ground);
  const restDeltas = node => {
    const point = node.getWorldPosition(new THREE.Vector3());
    return fields.map(field => field(point, new THREE.Vector3()));
  };
  const skeletons = new Set();
  const meshes = [];
  vrm.scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !mesh.geometry.getAttribute('normal')) return;
    // Visually identical material instances may share geometry in the source.
    mesh.geometry = mesh.geometry.clone();
    meshes.push(mesh);
    skeletons.add(mesh.skeleton);
  });
  const surfaceUpdates = meshes.map(mesh => addSurfaceFields(mesh, fields));
  const rawBones = new Set([...skeletons].flatMap(skeleton => skeleton.bones));
  const normalizedBones = new Set(Object.values(vrm.humanoid.normalizedHumanBones).map(({ node }) => node));
  const deltasByBone = new Map([...rawBones, ...normalizedBones].map(bone => [bone, restDeltas(bone)]));
  const rest = [...deltasByBone].map(([bone, deltas]) => {
    const parentDeltas = deltasByBone.get(bone.parent);
    const fromWorld = new THREE.Matrix3().setFromMatrix4(bone.parent.matrixWorld).invert();
    return {
      bone, position: bone.position.clone(),
      offsets: deltas.map((delta, index) => {
        const local = delta.clone();
        if (parentDeltas) local.sub(parentDeltas[index]);
        return local.applyMatrix3(fromWorld);
      })
    };
  });
  const binds = [...skeletons].flatMap(skeleton => skeleton.bones.map((bone, index) => ({
    offsets: deltasByBone.get(bone),
    base: skeleton.boneInverses[index].clone(),
    target: skeleton.boneInverses[index]
  })));
  const scratch = new THREE.Vector3();
  const translation = new THREE.Matrix4();
  let previous = VRM_SHAPE_KEYS.map(() => 0);

  return state => {
    const amounts = VRM_SHAPE_KEYS.map(key => state[key] - 1);
    if (amounts.every((amount, i) => amount === previous[i])) return;
    previous = amounts;
    for (const update of surfaceUpdates) update(amounts);
    for (const { bone, position, offsets } of rest) {
      bone.position.copy(position);
      offsets.forEach((offset, i) => bone.position.addScaledVector(offset, amounts[i]));
    }
    for (const { base, target, offsets } of binds) {
      scratch.set(0, 0, 0);
      offsets.forEach((offset, i) => scratch.addScaledVector(offset, -amounts[i]));
      target.copy(base).multiply(translation.makeTranslation(scratch.x, scratch.y, scratch.z));
    }
  };
}

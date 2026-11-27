import { MathUtils } from 'three';
import { createSurfaceCloth } from './cloth-gravity.js';
import { createSkirtFit } from './wardrobe-skirt-fit.js';

const timeStep = 1 / 60;
const springSteps = 120;
const smooth = MathUtils.smoothstep;

function clothProfile(mesh, builtin, hemMeshes) {
  const positions = mesh.geometry.getAttribute('position');
  const weights = mesh.geometry.getAttribute('_atelier_cloth');
  if (!positions) return;
  if (weights?.itemSize === 1 && weights.count === positions.count) {
    for (let i = 0; i < weights.count; i++) {
      if (Number.isFinite(weights.getX(i)) && weights.getX(i) > 0) {
        return {
          mobility: (_, index) => {
            const weight = weights.getX(index);
            return Number.isFinite(weight) ? MathUtils.clamp(weight, 0, 1) : 0;
          }
        };
      }
    }
  }
  if (!builtin || !mesh.isSkinnedMesh) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (hemMeshes.has(mesh)) {
    mesh.geometry.computeBoundingBox();
    const hemY = mesh.geometry.boundingBox.min.y;
    return { hem: true, mobility: ({ y }) => 1 - smooth(y, hemY + 0.025, hemY + 0.20) };
  }

  // The fitted suits share a material per outfit. Taper the motion around the
  // cuffs, sleeves and shirt hem in each supplied asset's bind coordinates.
  if (materials.some(material => material.name === 'male_casualsuit04')) {
    return { travel: 0.035, mobility: ({ x, y }) => Math.max(
      0.65 * (1 - smooth(y, 0.06, 0.19)),
      smooth(y, 0.895, 0.94) * (1 - smooth(y, 0.96, 1.06)),
      0.75 * smooth(Math.abs(x), 0.225, 0.30) * smooth(y, 1.14, 1.28)
    ) };
  }
  if (materials.some(material => material.name === 'female_sportsuit01')) {
    return { travel: 0.020, mobility: ({ x, y }) => Math.max(
      0.55 * (1 - smooth(y, 0.075, 0.17)),
      0.75 * (1 - smooth(y, 1.12, 1.185)) * smooth(y, 1.04, 1.10),
      0.60 * smooth(Math.abs(x), 0.22, 0.28) * smooth(y, 1.21, 1.28)
    ) };
  }
}

function createSpringMotion(manager) {
  if (!manager?.joints.size) return;

  const joints = [...manager.joints].map(({ bone, settings }) => ({
    bone, settings, power: Math.max(0.12, settings.gravityPower), radius: settings.hitRadius
  }));
  const radii = manager.colliders.filter(({ shape }) => typeof shape.radius === 'number')
    .map(({ shape }) => ({ shape, radius: shape.radius }));
  for (const { settings } of joints) {
    settings.gravityDir.set(0, -1, 0);
    settings.dragForce = Math.max(settings.dragForce, 0.18);
  }
  let enabled = false;
  let remaining = 0;
  let accumulator = 0;
  return {
    retarget(next, scale, units, shapeChanged) {
      if (!next && !enabled && !shapeChanged) return;
      if (next !== enabled || shapeChanged) {
        manager.reset();
        if (shapeChanged) manager.setInitState();
        accumulator = 0;
      }
      if (next) {
        for (const { settings, power, radius } of joints) {
          settings.gravityPower = power * units;
          settings.hitRadius = radius * scale;
        }
        for (const { shape, radius } of radii) shape.radius = radius * scale;
      }
      enabled = next;
      remaining = next ? springSteps : 0;
    },
    advance(delta) {
      if (!remaining) return;
      accumulator = Math.min(accumulator + delta, 5 * timeStep);
      while (accumulator >= timeStep && remaining > 0) {
        manager.update(timeStep);
        accumulator -= timeStep;
        remaining--;
        // A degenerate collider on an imported model can make a joint invalid.
        if (joints.some(({ bone: { quaternion: { x, y, z, w } } }) => !Number.isFinite(x + y + z + w))) {
          manager.reset();
          remaining = 0;
        }
      }
    }
  };
}

export function createVrmMotion({ vrm, object, builtin, height, bones, hemMeshes, contactMeshes }) {
  const springs = createSpringMotion(vrm.springBoneManager);
  const surfaces = [];
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const profile = clothProfile(mesh, builtin, hemMeshes);
    if (profile) {
      const fit = mesh.userData.skirt && createSkirtFit(mesh.userData.skirt, vrm.humanoid);
      surfaces.push({ mesh, profile, fit });
    }
  });
  const units = builtin ? 1 : height / 1.65;
  const hips = vrm.humanoid.getNormalizedBoneNode('hips');
  const hemColliders = [{ start: hips, end: bones.spine, radius: 0.12 }];
  const garmentColliders = [...hemColliders];
  for (const side of ['left', 'right']) {
    const thigh = { start: bones[side + 'Leg'], end: bones[side + 'Knee'], radius: 0.078 };
    hemColliders.push(thigh);
    garmentColliders.push(thigh,
      { start: bones[side + 'Knee'], end: bones[side + 'Foot'], radius: 0.06 },
      { start: bones[side + 'Arm'], end: bones[side + 'Elbow'], radius: 0.055 }
    );
  }

  return {
    hasSprings: Boolean(springs),
    hasCloth: surfaces.length > 0,
    retarget(enabled, shapeChanged) {
      if (!(springs || surfaces.length)) return;
      object.updateMatrixWorld(true);
      const scale = object.scale.x;
      springs?.retarget(enabled, scale, scale * units, shapeChanged);
      if (!enabled) object.updateMatrixWorld(true);
      for (const surface of surfaces) {
        const { mesh, profile, fit } = surface;
        if (!mesh.visible || (!enabled && !fit)) {
          if (surface.fitted) surface.cloth.reset();
          surface.fitted = surface.active = false;
          continue;
        }
        if (surface.cloth === undefined) {
          surface.cloth = createSurfaceCloth(mesh, {
            ...profile, units, fit,
            colliderBones: profile.hem ? hemColliders : garmentColliders,
            contactMeshes: profile.hem ? contactMeshes : []
          }) ?? null;
        }
        surface.fitted = Boolean(surface.cloth);
        surface.active = enabled && surface.fitted;
        surface.cloth?.retarget(scale * units, enabled);
      }
    },
    advance(delta) {
      springs?.advance(delta);
      for (const surface of surfaces) {
        if (surface.active) surface.cloth.advance(delta);
      }
    },
    dispose() {
      for (const { cloth } of surfaces) cloth?.dispose();
    }
  };
}

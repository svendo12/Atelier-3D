import * as THREE from 'three';

const radians = THREE.MathUtils.degToRad;
const euler = new THREE.Euler();
const leftBasis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
const rightBasis = leftBasis.clone().invert();

export const fingerNames = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const fingerBends = [75, 95, 65];

export function applyLimbPose(bones, pose, armRestPose, fingers, restArms) {
  for (const [side, direction, defaultBasis, defaultInverse] of [
    ['left', -1, leftBasis, rightBasis],
    ['right', 1, rightBasis, leftBasis]
  ]) {
    const [armBasis, inverseBasis] = restArms?.[side] ?? [defaultBasis, defaultInverse];
    const arm = bones[side + 'Arm'].quaternion;
    const forearm = bones[side + 'Elbow'].quaternion;
    arm.setFromEuler(euler.set(
      -radians(pose[side + 'ArmForward']),
      direction * radians(pose[side + 'ArmTwist']),
      direction * radians(pose[side + 'Arm']), 'ZXY'
    ));
    forearm.setFromEuler(euler.set(
      -radians(pose[side + 'Elbow']), direction * radians(pose[side + 'ForearmTwist']), 0, 'XYZ'
    ));
    const wrist = bones[side + 'Hand'].quaternion;
    wrist.setFromEuler(euler.set(-radians(pose[side + 'WristBend']), 0, direction * radians(pose[side + 'WristSide']), 'XYZ'));
    if (armRestPose === 'tpose') {
      // Convert the studio's hanging arms to the VRM skeleton's outward-pointing rest axes.
      arm.multiply(inverseBasis);
      forearm.premultiply(armBasis).multiply(inverseBasis);
      wrist.premultiply(armBasis).multiply(inverseBasis);
    }

    bones[side + 'Leg'].quaternion.setFromEuler(euler.set(
      -radians(pose[side + 'Leg']),
      direction * radians(pose[side + 'HipTwist']),
      direction * radians(pose[side + 'LegSpread']), 'XZY'
    ));
    bones[side + 'Knee'].rotation.set(radians(pose[side + 'Knee']), direction * radians(pose[side + 'KneeTwist']), 0, 'XYZ');
    for (const finger of fingerNames) {
      fingers[side][finger].forEach(({ joint, axis, segment }, index) => {
        segment ??= index;
        const arc = finger === 'Thumb' ? [28, 48, 65][segment] : fingerBends[segment];
        joint.quaternion.setFromAxisAngle(axis, radians(arc * pose[side + finger + 'Curl'] / 100));
      });
    }
  }
}

import { Quaternion, Vector3 } from 'three';

export const pixelsPerUnit = 150;
const neutralArm = Math.PI / 15;
const setupY = {
  pelvis: 255, torso: 273, head: 433.5, shoulder: 387, hip: 241.5, knee: 124.5, foot: 16.5
};

function joint(id, parent, x, y, angle = 0, length = 0) {
  return { id, parent, x, y, angle, length };
}

function chain(side, sign) {
  const armAngle = -Math.PI / 2 + sign * neutralArm;
  const dx = Math.cos(armAngle), dy = Math.sin(armAngle);
  const shoulderX = sign * 66.75;
  const elbow = [shoulderX + dx * 85.5, setupY.shoulder + dy * 85.5];
  const wrist = [elbow[0] + dx * 69, elbow[1] + dy * 69];
  return [
    joint(side + 'Arm', 'torso', shoulderX, setupY.shoulder, armAngle, 85.5),
    joint(side + 'Elbow', side + 'Arm', ...elbow, armAngle),
    joint(side + 'Forearm', side + 'Elbow', ...elbow, armAngle, 69),
    joint(side + 'Hand', side + 'Forearm', ...wrist, armAngle, 33),
    joint(side + 'Thigh', 'pelvis', sign * 33, setupY.hip, -Math.PI / 2, 117),
    joint(side + 'Knee', side + 'Thigh', sign * 33, setupY.knee, -Math.PI / 2),
    joint(side + 'Shin', side + 'Knee', sign * 33, setupY.knee, -Math.PI / 2, 108),
    joint(side + 'Foot', side + 'Shin', sign * 33, setupY.foot, -Math.PI / 2, 16)
  ];
}

export const bindJoints = new Map([
  joint('pelvis', null, 0, setupY.pelvis),
  joint('torso', 'pelvis', 0, setupY.torso),
  joint('head', 'torso', 0, setupY.head),
  ...chain('left', -1), ...chain('right', 1)
].map(bone => [bone.id, bone]));

export function bindLocal(boneId, x, y) {
  const bone = bindJoints.get(boneId);
  const cos = Math.cos(bone.angle), sin = Math.sin(bone.angle);
  const dx = x - bone.x, dy = y - bone.y;
  return [cos * dx + sin * dy, -sin * dx + cos * dy];
}

export function openBoneSetup() {
  return [...bindJoints.values()].map(({ id, parent, x, y, angle, length }) => {
    const local = parent ? bindLocal(parent, x, y) : [x, y];
    return {
      id, name: id, parent, x: local[0], y: local[1], length,
      rotation: (angle - (bindJoints.get(parent)?.angle ?? 0)) * 180 / Math.PI,
      scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, inherit: 'normal'
    };
  });
}

export function createRigProjection(bones, hips) {
  const world = node => node.getWorldPosition(new Vector3()).multiplyScalar(pixelsPerUnit);
  const local = (node, x, y, z) => node.localToWorld(new Vector3(x, y, z)).multiplyScalar(pixelsPerUnit);
  const front = new Vector3(0, 0, 1);
  const results = new Map();
  let shortened;

  function frame(id, origin, cos, sin, along = 1, across = 1) {
    results.set(id, { a: cos * along, b: -sin * across, c: sin * along, d: cos * across, x: origin.x, y: origin.y });
  }
  function segment(id, origin, end, width = 1) {
    const delta = end.clone().sub(origin);
    const projected = Math.hypot(delta.x, delta.y);
    const rest = bindJoints.get(id);
    const angle = projected > .01 ? Math.atan2(delta.y, delta.x) : rest.angle;
    const fraction = projected / Math.max(.01, delta.length());
    shortened ||= fraction < .38;
    frame(id, origin, Math.cos(angle), Math.sin(angle), Math.max(.18, projected / rest.length), width);
    return angle;
  }
  function hinge(id, point, a, b) {
    const turn = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    const angle = a + turn * .5;
    frame(id, point, Math.cos(angle), Math.sin(angle));
  }
  function upright(id, origin, xAxis, yAxis, referenceWidth, referenceHeight) {
    const angle = Math.atan2(-yAxis.x, yAxis.y);
    const width = Math.max(.45, Math.hypot(xAxis.x, xAxis.y) / referenceWidth);
    const height = Math.max(.55, Math.hypot(yAxis.x, yAxis.y) / referenceHeight);
    frame(id, origin, Math.cos(angle), Math.sin(angle), width, height);
  }

  return () => {
    shortened = false;
    hips.updateWorldMatrix(true, true);
    const hipCenter = world(hips);
    const waist = world(bones.spine);
    const neck = world(bones.head);
    const hipLine = world(bones.rightLeg).sub(world(bones.leftLeg));
    const shoulderLine = world(bones.rightArm).sub(world(bones.leftArm));
    const up = neck.clone().sub(waist);
    upright('pelvis', hipCenter, hipLine, local(hips, 0, 1, 0).sub(hipCenter), 66, 150);
    upright('torso', waist, shoulderLine, up, 133.5, 160.5);
    upright('head', neck, local(bones.head, 1, 0, 0).sub(neck), local(bones.head, 0, 1, 0).sub(neck), 150, 150);

    const order = {};
    const chains = [];
    for (const side of ['left', 'right']) {
      const shoulder = world(bones[side + 'Arm']);
      const elbow = world(bones[side + 'Elbow']);
      const wrist = world(bones[side + 'Hand']);
      const palm = local(bones[side + 'Hand'], 0, -.22, 0);
      const upperAngle = segment(side + 'Arm', shoulder, elbow);
      const foreAngle = segment(side + 'Forearm', elbow, wrist);
      segment(side + 'Hand', wrist, palm);
      hinge(side + 'Elbow', elbow, upperAngle, foreAngle);

      const thigh = world(bones[side + 'Leg']);
      const knee = world(bones[side + 'Knee']);
      const ankle = world(bones[side + 'Foot']);
      const foot = bones[side + 'Foot'].position;
      const toe = local(bones[side + 'Knee'], foot.x, foot.y - .1067, foot.z);
      const thighAngle = segment(side + 'Thigh', thigh, knee);
      const shinAngle = segment(side + 'Shin', knee, ankle);
      segment(side + 'Foot', ankle, toe);
      hinge(side + 'Knee', knee, thighAngle, shinAngle);

      const armDepth = (.18 * shoulder.z + .32 * elbow.z + .5 * wrist.z - waist.z) / pixelsPerUnit;
      const legDepth = (.52 * knee.z + .48 * ankle.z - hipCenter.z) / pixelsPerUnit;
      order[side + '-arm'] = armDepth > .16 ? 38 + armDepth * 2 : 16 + armDepth * 2;
      order[side + '-hand'] = armDepth > .16 ? 39 + armDepth * 2 : 17 + armDepth * 2;
      order[side + '-leg'] = legDepth > .26 ? 33 + legDepth * 2 : 5 + legDepth * 2;
      order[side + '-shoe'] = order[side + '-leg'] + .2;
      chains.push([neck, shoulder, elbow, wrist, palm], [hipCenter, thigh, knee, ankle, toe]);
    }

    const headFront = front.clone().applyQuaternion(bones.head.getWorldQuaternion(new Quaternion()));
    const torsoFront = front.clone().applyQuaternion(bones.spine.getWorldQuaternion(new Quaternion()));
    const limitations = [];
    if (headFront.z < .77 || torsoFront.z < .77) limitations.push('Starke Drehung: Die Zeichnung zeigt weiterhin die Vorderseite.');
    if (shortened) limitations.push('Starke Verkürzung: Gelenke können sich in der Vorderansicht überdecken.');
    return { frames: results, order, chains: [[hipCenter, waist, neck], ...chains], warning: limitations.join(' ') };
  };
}

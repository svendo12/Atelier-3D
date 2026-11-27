import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

const up = new Vector3(0, 1, 0);
const flip = new Quaternion().setFromAxisAngle(up, Math.PI);
const unflip = flip.clone().invert();
const identity = new Quaternion();
const down = new Vector3(0, -1, 0);
const digits = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];

function readWorld(sample, name, target) {
  const offset = sample.indices.get(name);
  if (offset === undefined || sample.frame[offset] === null) return false;
  target.fromArray(sample.frame, offset).normalize();
  return true;
}

export function libraryControls(sample) {
  const studio = {};
  const rotation = new Quaternion();
  const parent = new Quaternion();
  const euler = new Euler();
  const angle = MathUtils.radToDeg;
  function local(name, ancestor, order, basis, transform = 'none') {
    if (!readWorld(sample, name, rotation)) rotation.identity();
    if (readWorld(sample, ancestor, parent)) rotation.premultiply(parent.invert());
    if (transform === 'upper') rotation.multiply(basis);
    if (transform === 'lower') rotation.multiply(basis).premultiply(parent.copy(basis).invert());
    return euler.setFromQuaternion(rotation, order);
  }
  const head = local('head', 'upperChest', 'YXZ');
  Object.assign(studio, { headPitch: -angle(head.x), headTurn: angle(head.y), headTilt: angle(head.z) });
  studio.torsoTurn = angle(local('upperChest', 'hips', 'YXZ').y);
  for (const [label, side, sign] of [['left', 'right', -1], ['right', 'left', 1]]) {
    const basis = new Quaternion().setFromUnitVectors(down, new Vector3(sign, 0, 0));
    const arm = local(side + 'UpperArm', side + 'Shoulder', 'ZXY', basis, 'upper');
    studio[label + 'Arm'] = angle(arm.z) / sign;
    studio[label + 'ArmForward'] = -angle(arm.x);
    studio[label + 'ArmTwist'] = angle(arm.y) / sign;
    const elbow = local(side + 'LowerArm', side + 'UpperArm', 'XYZ', basis, 'lower');
    studio[label + 'Elbow'] = -angle(elbow.x);
    studio[label + 'ForearmTwist'] = angle(elbow.y) / sign;
    const hand = local(side + 'Hand', side + 'LowerArm', 'XYZ', basis, 'lower');
    studio[label + 'WristBend'] = -angle(hand.x);
    studio[label + 'WristSide'] = angle(hand.z) / sign;
    const hip = local(side + 'UpperLeg', 'hips', 'XZY');
    studio[label + 'Leg'] = -angle(hip.x);
    studio[label + 'HipTwist'] = angle(hip.y) / sign;
    studio[label + 'LegSpread'] = angle(hip.z) / sign;
    const knee = local(side + 'LowerLeg', side + 'UpperLeg', 'XYZ');
    studio[label + 'Knee'] = angle(knee.x);
    studio[label + 'KneeTwist'] = angle(knee.y) / sign;
  }
  return studio;
}

export function createLibraryRig({ object, nodes, driven, limbNodes, legacy = false, height = 3.4, restFloor = 0 }) {
  const entries = new Map(Object.entries(nodes).map(([name, node]) => [name, {
    name, node, alignment: new Quaternion(), world: new Quaternion(), local: new Quaternion(), offset: new Quaternion()
  }]));
  const byNode = new Map([...entries.values()].map(entry => [entry.node, entry]));
  for (const entry of entries.values()) {
    let ancestor = entry.node.parent;
    while (ancestor && !byNode.has(ancestor)) ancestor = ancestor.parent;
    entry.parent = byNode.get(ancestor);
  }
  const direction = new Vector3();
  const point = new Vector3();
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    for (const [bone, child, axis] of [
      ['UpperArm', 'LowerArm', new Vector3(sign, 0, 0)], ['LowerArm', 'Hand', new Vector3(sign, 0, 0)],
      ['UpperLeg', 'LowerLeg', down], ['LowerLeg', 'Foot', down]
    ]) {
      const entry = entries.get(side + bone);
      const tip = nodes[side + child];
      if (!entry || !tip) continue;
      direction.subVectors(tip.getWorldPosition(point), entry.node.getWorldPosition(new Vector3()));
      if (direction.lengthSq()) entry.alignment.setFromUnitVectors(axis, direction.normalize());
    }
    const palm = entries.get(side + 'LowerArm')?.alignment;
    for (const entry of entries.values()) {
      if (palm && (entry.name === side + 'Hand' ||
        (entry.name.startsWith(side) && digits.some(finger => entry.name.includes(finger))))) entry.alignment.copy(palm);
    }
  }
  const floorProbes = [];
  const screenHeight = () => height * object.scale.x;
  for (const side of ['left', 'right']) {
    const foot = nodes[side + 'Foot'];
    if (!foot) continue;
    const ankle = foot.getWorldPosition(new Vector3());
    const toes = nodes[side + 'Toes']?.getWorldPosition(new Vector3());
    const footSpan = height * object.scale.x;
    for (const anchor of [
      ankle.clone().setY(restFloor).addScaledVector(new Vector3(0, 0, -1), footSpan * 0.018),
      (toes ?? ankle.clone().addScaledVector(new Vector3(0, 0, 1), footSpan * 0.043)).setY(restFloor)
    ]) floorProbes.push({ foot, local: foot.worldToLocal(anchor) });
  }
  const supports = [['head', .07], ['hips', .066], ['spine', .07], ['leftHand', .018], ['rightHand', .018],
    ['leftLowerLeg', .032], ['rightLowerLeg', .032]].filter(([name]) => nodes[name]);
  const scratch = new Quaternion();
  let hold;
  let poseKey;

  function target(sample) {
    function set(entry) {
      if (entry.sample === sample) return;
      if (entry.parent) set(entry.parent);
      if (readWorld(sample, entry.name, entry.world)) {
        entry.world.multiply(scratch.copy(entry.alignment).invert());
        entry.local.copy(entry.world);
        if (entry.parent) entry.local.premultiply(scratch.copy(entry.parent.world).invert());
        if (legacy) entry.local.premultiply(unflip).multiply(flip);
      } else {
        entry.world.copy(entry.parent?.world ?? identity);
        entry.local.identity();
      }
      entry.sample = sample;
    }
    for (const entry of entries.values()) set(entry);
  }

  function ground(sample) {
    object.position.y = 0;
    let bottom = Infinity;
    for (const { foot, local } of floorProbes) {
      bottom = Math.min(bottom, foot.localToWorld(point.copy(local)).y);
    }
    for (const [name, radius] of supports) {
      bottom = Math.min(bottom, nodes[name].getWorldPosition(point).y - screenHeight() * radius);
    }
    if (Number.isFinite(bottom)) object.position.y = sample.lift * screenHeight() - bottom;
  }

  return {
    prepare(next, applyManual) {
      if (poseKey === next) return;
      poseKey = hold = next;
      if (!next) {
        for (const { node } of entries.values()) if (!driven.has(node)) node.quaternion.identity();
        object.position.y = 0;
        return;
      }
      target(next.sample);
      applyManual(next.reference);
      for (const entry of entries.values()) {
        entry.offset.copy(entry.local);
        if (driven.has(entry.node)) entry.offset.premultiply(scratch.copy(entry.node.quaternion).invert());
      }
    },
    adjustLimbs() {
      if (!hold) return;
      for (const { node, offset } of entries.values()) {
        if (limbNodes.has(node)) node.quaternion.multiply(offset);
      }
    },
    apply() {
      if (!hold) {
        for (const { node } of entries.values()) if (!driven.has(node)) node.quaternion.identity();
        object.position.y = 0;
        return;
      }
      for (const { node, offset } of entries.values()) {
        if (driven.has(node)) node.quaternion.multiply(offset);
        else node.quaternion.copy(offset);
      }
      ground(hold.sample);
    },
    preview(sample) {
      target(sample);
      for (const { node, local } of entries.values()) node.quaternion.copy(local);
      ground(sample);
    }
  };
}

import * as THREE from 'three';

const segments = [
  ['head', 'headTip'], ['spine', 'head'],
  ['leftArm', 'leftElbow'], ['leftElbow', 'leftHand'], ['leftHand', 'leftPalm'],
  ['rightArm', 'rightElbow'], ['rightElbow', 'rightHand'], ['rightHand', 'rightPalm'],
  ['leftLeg', 'leftKnee'], ['leftKnee', 'leftFoot'],
  ['rightLeg', 'rightKnee'], ['rightKnee', 'rightFoot']
];
const limbModes = {
  leftArm: { alternate: 'leftArmForward', twist: 'leftArmTwist' },
  rightArm: { alternate: 'rightArmForward', twist: 'rightArmTwist' },
  leftElbow: { twist: 'leftForearmTwist' },
  rightElbow: { twist: 'rightForearmTwist' },
  leftHand: { standard: 'leftWristBend', alternate: 'leftWristSide' },
  rightHand: { standard: 'rightWristBend', alternate: 'rightWristSide' },
  leftLeg: { alternate: 'leftLegSpread', twist: 'leftHipTwist' },
  rightLeg: { alternate: 'rightLegSpread', twist: 'rightHipTwist' },
  leftKnee: { twist: 'leftKneeTwist' },
  rightKnee: { twist: 'rightKneeTwist' }
};

function pickBodyPart(character, camera, pointer, viewport, raycaster) {
  const { object, bones } = character;
  camera.updateMatrixWorld();
  object.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2(
    (pointer.x - viewport.left) / viewport.width * 2 - 1,
    1 - (pointer.y - viewport.top) / viewport.height * 2
  ), camera);

  const meshes = [];
  object.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    // Skinned bounds are cached by Three.js and may describe a previous pose.
    if (mesh.isSkinnedMesh) {
      mesh.boundingSphere = null;
      mesh.boundingBox = null;
    }
    meshes.push(mesh);
  });
  const [hit] = raycaster.intersectObjects(meshes, false);
  if (!hit) return;

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const line = new THREE.Line3(start, end);
  let part;
  let bestDistance = Infinity;
  for (const [from, to] of segments) {
    bones[from].getWorldPosition(start);
    if (to === 'headTip' && !bones.headTip) {
      // VRM has a head joint but no joint for the top of the skull.
      bones.spine.getWorldPosition(end);
      end.subVectors(start, end).multiplyScalar(0.28).add(start);
    } else if (bones[to]) {
      bones[to].getWorldPosition(end);
    } else {
      // Finger joints are optional in VRM. Estimate the palm from the forearm.
      bones[from.replace('Hand', 'Elbow')].getWorldPosition(end);
      end.subVectors(start, end).multiplyScalar(0.28).add(start);
    }
    const distance = line.closestPointToPoint(hit.point, true, closest).distanceToSquared(hit.point);
    if (distance < bestDistance) {
      part = from;
      bestDistance = distance;
    }
  }
  return { part, point: hit.point };
}

function projectPoint(point, camera, viewport) {
  point.project(camera);
  return new THREE.Vector2(point.x * viewport.width / 2, -point.y * viewport.height / 2);
}

function makeLimbDrag(character, part, worldPoint, camera, viewport, field, getValue, fields) {
  const bone = character.bones[part];
  const pose = Object.fromEntries(fields.map(({ key }) => [key, getValue(key)]));
  const startValue = pose[field.key];
  const localPoint = bone.worldToLocal(worldPoint.clone());

  // Project the grabbed point along the joint's allowed arc. Keeping the original
  // screen position as the origin prevents a jump when the button is pressed.
  const origin = projectPoint(worldPoint.clone(), camera, viewport);
  const values = Array.from({ length: 25 }, (_, i) => field.min + i * (field.max - field.min) / 24);
  values.push(startValue);
  values.sort((a, b) => a - b);
  const samples = values.map(value => {
    pose[field.key] = value;
    character.applyLimbPose(pose);
    const point = projectPoint(bone.localToWorld(localPoint.clone()), camera, viewport);
    return { value, point: point.sub(origin) };
  });
  pose[field.key] = startValue;
  character.applyLimbPose(pose);
  character.object.updateMatrixWorld(true);

  const axisTravel = Math.max(...samples.map(sample => sample.point.length()));
  return (delta, current) => {
    // When looking along the joint arc, vertical dragging still works.
    if (axisTravel < 12) return startValue - delta.y * 0.55;
    let best = { value: current, score: Infinity };
    for (let i = 1; i < samples.length; i++) {
      const first = samples[i - 1];
      const next = samples[i];
      const span = next.point.clone().sub(first.point);
      const length = span.lengthSq();
      const fraction = length ? THREE.MathUtils.clamp(delta.clone().sub(first.point).dot(span) / length, 0, 1) : 0;
      const point = span.multiplyScalar(fraction).add(first.point);
      const value = THREE.MathUtils.lerp(first.value, next.value, fraction);
      // Favor continuity when the projected curve crosses itself.
      const score = point.distanceToSquared(delta) + 0.015 * (value - current) ** 2;
      if (score < best.score) best = { value, score };
    }
    return best.value;
  };
}

export function enablePoseDrag({ canvas, camera, controls, fields, getCharacter, getValue, getLimit, getLimbMode, updatePose, savePose }) {
  const raycaster = new THREE.Raycaster();
  const limits = Object.fromEntries(fields.map(field => [field.key, field]));
  let drag;

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 2 || event.buttons !== 2 || !controls.enabled || drag) return;
    const viewport = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(event.clientX, event.clientY);
    const character = getCharacter();
    if (!character) return;
    const hit = pickBodyPart(character, camera, pointer, viewport, raycaster);
    if (!hit) return;

    const { part, point } = hit;
    let calculate;
    if (part === 'head' && !event.shiftKey) {
      const turn = getValue('headTurn');
      const pitch = getValue('headPitch');
      calculate = delta => ({ headTurn: turn + delta.x * 0.55, headPitch: pitch - delta.y * 0.55 });
    } else if (part === 'head' || part === 'spine') {
      const key = part === 'head' ? 'headTilt' : 'torsoTurn';
      const start = getValue(key);
      calculate = delta => ({ [key]: start + delta.x * 0.55 });
    } else {
      const mode = event.ctrlKey ? 'twist' : event.shiftKey ? 'alternate' : getLimbMode();
      const movement = limbModes[part];
      const key = movement?.[mode] ?? movement?.standard ?? part;
      if (movement?.twist === key) {
        const start = getValue(key);
        calculate = delta => ({ [key]: start + delta.x * 0.55 });
      } else {
        const solve = makeLimbDrag(character, part, point, camera, viewport, getLimit(limits[key]), getValue, fields);
        calculate = delta => ({ [key]: solve(delta, getValue(key)) });
      }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    controls.enabled = false;
    drag = { pointerId: event.pointerId, pointer, character, calculate, changed: false };
    canvas.classList.add('is-posing');
    canvas.setPointerCapture(event.pointerId);
  }, { capture: true });

  function finishDrag() {
    const finished = drag;
    if (!finished) return;
    drag = undefined;
    controls.enabled = true;
    canvas.classList.remove('is-posing');
    if (canvas.hasPointerCapture(finished.pointerId)) canvas.releasePointerCapture(finished.pointerId);
    if (finished.changed) savePose();
  }

  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.pointerId) return;
    if (!(event.buttons & 2) || drag.character !== getCharacter()) {
      finishDrag();
      return;
    }
    const delta = new THREE.Vector2(event.clientX, event.clientY).sub(drag.pointer);
    if (!drag.changed && delta.lengthSq() < 9) return;
    const values = drag.calculate(delta);
    for (const [key, value] of Object.entries(values)) {
      const { min, max } = getLimit(limits[key]);
      values[key] = THREE.MathUtils.clamp(Math.round(value), min, max);
      if (values[key] === getValue(key)) delete values[key];
    }
    if (Object.keys(values).length) {
      updatePose(values);
      drag.changed = true;
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if (event.pointerId === drag?.pointerId) finishDrag();
    });
  }
  window.addEventListener('blur', finishDrag);
}

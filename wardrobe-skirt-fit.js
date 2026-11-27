import { MathUtils, Quaternion, Vector3 } from 'three';

// Blend rigid rotations about each thigh's own pivot. The earlier matrix
// blend squeezed opposing cloth panels as the two thigh angles diverged.
export function createSkirtFit({ rings, segments }, humanoid) {
  const hips = humanoid.getNormalizedBoneNode('hips');
  const frame = new Quaternion();
  const inverse = new Quaternion();
  const rotation = new Quaternion();
  const dual = new Quaternion();
  const conjugate = new Quaternion();
  const translation = new Quaternion();
  const offset = new Vector3();
  const nearest = new Vector3();
  const origin = new Vector3();
  const legs = ['left', 'right'].map(name => {
    const hip = humanoid.getNormalizedBoneNode(name + 'UpperLeg');
    const knee = humanoid.getNormalizedBoneNode(name + 'LowerLeg');
    const start = hip.getWorldPosition(new Vector3());
    const end = knee.getWorldPosition(new Vector3());
    const rest = end.clone().sub(start).applyQuaternion(hips.getWorldQuaternion(inverse).invert()).normalize();
    return { hip, knee, start, end, rest, direction: new Vector3(), rotation: new Quaternion(), dual: new Quaternion() };
  });
  const [left, right] = legs;

  return (particles, scale) => {
    hips.getWorldPosition(origin);
    hips.getWorldQuaternion(frame);
    inverse.copy(frame).invert();
    for (const leg of legs) {
      leg.hip.getWorldPosition(leg.start);
      leg.knee.getWorldPosition(leg.end);
      leg.direction.subVectors(leg.end, leg.start).applyQuaternion(inverse).normalize();
      leg.rotation.setFromUnitVectors(leg.rest, leg.direction);
      nearest.subVectors(leg.start, origin).applyQuaternion(inverse);
      offset.copy(nearest).sub(nearest.applyQuaternion(leg.rotation));
      leg.dual.set(.5 * offset.x, .5 * offset.y, .5 * offset.z, 0).multiply(leg.rotation);
    }
    for (const p of particles) {
      const row = Math.floor(p.vertex / segments) / rings;
      if (row <= .13) continue;
      const angle = p.vertex % segments * (2 * Math.PI / segments);
      const total = (.72 + .13 * Math.cos(angle)) * MathUtils.smoothstep(row, .13, .94);
      const sector = MathUtils.smoothstep(Math.sin(angle), -.57, .57);
      const a = total * sector;
      const b = total - a;

      rotation.set(left.rotation.x * a + right.rotation.x * b,
        left.rotation.y * a + right.rotation.y * b, left.rotation.z * a + right.rotation.z * b,
        1 - total + left.rotation.w * a + right.rotation.w * b);
      const length = rotation.length();
      rotation.normalize();
      dual.set((left.dual.x * a + right.dual.x * b) / length, (left.dual.y * a + right.dual.y * b) / length,
        (left.dual.z * a + right.dual.z * b) / length, (left.dual.w * a + right.dual.w * b) / length);
      translation.copy(dual).multiply(conjugate.copy(rotation).conjugate());
      p.target.sub(origin).applyQuaternion(inverse).applyQuaternion(rotation)
        .add(offset.set(2 * translation.x, 2 * translation.y, 2 * translation.z))
        .applyQuaternion(frame).add(origin);

      // Bound corrections against the thigh around the moving part of the hem.
      const influence = MathUtils.smoothstep(row, .36, .88);
      for (const leg of legs) {
        nearest.subVectors(leg.end, leg.start);
        const fraction = MathUtils.clamp(offset.subVectors(p.target, leg.start).dot(nearest) / nearest.lengthSq(), 0, 1);
        nearest.multiplyScalar(fraction).add(leg.start);
        offset.subVectors(p.target, nearest);
        const distance = offset.length();
        const radius = (.083 - .025 * fraction) * scale;
        if (distance > 1e-7 && distance < radius) {
          p.target.addScaledVector(offset, Math.min(.012 * scale, radius - distance) * influence / distance);
        }
      }
    }
  };
}

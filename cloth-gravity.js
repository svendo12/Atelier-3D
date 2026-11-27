import * as THREE from 'three';

const timeStep = 1 / 60;
const settleSteps = 72;
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);

function copyVectorAttribute(attribute) {
  const values = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    values[i * 3] = attribute.getX(i);
    values[i * 3 + 1] = attribute.getY(i);
    values[i * 3 + 2] = attribute.getZ(i);
  }
  return new THREE.BufferAttribute(values, 3).setUsage(THREE.DynamicDrawUsage);
}

// Apply bounded cloth offsets on top of the skinned and morphed pose.
export function createSurfaceCloth(mesh, { mobility, units = 1, travel = 0.045, fit, colliderBones, contactMeshes = [] }) {
  const baseGeometry = mesh.geometry;
  const geometry = baseGeometry.clone();
  const position = copyVectorAttribute(geometry.getAttribute('position'));
  geometry.setAttribute('position', position);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const normals = copyVectorAttribute(geometry.getAttribute('normal'));
  geometry.setAttribute('normal', normals);
  const rest = position.array.slice();
  const restNormals = normals.array.slice();
  const particles = [];
  const particleByVertex = [];
  const welded = new Map();
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = point.toArray().map(value => Math.round(value * 1e5 / units)).join(',');
    const weight = mobility(point, i);
    if (!welded.has(key)) {
      welded.set(key, {
        vertex: i, mobility: weight, target: new THREE.Vector3(), position: new THREE.Vector3(),
        previous: new THREE.Vector3(), reference: new THREE.Vector3(), skinned: new THREE.Vector3(),
        inverseSkin: new THREE.Matrix3(), vertices: []
      });
      particles.push(welded.get(key));
    }
    const particle = welded.get(key);
    // Keep a seam pinned when either copy of a shared vertex is pinned.
    particle.mobility = Math.min(particle.mobility, weight);
    particle.vertices.push(i);
    particleByVertex.push(particle);
  }
  const moving = particles.filter(particle => particle.mobility > 0);
  const deformed = fit ? particles : moving;
  if (!moving.length) {
    geometry.dispose();
    return;
  }
  mesh.geometry = geometry;
  const edges = [];
  const index = geometry.index;
  const seen = new Set();
  const vertexAt = index ? offset => index.getX(offset) : offset => offset;
  const indexCount = index?.count ?? position.count;
  for (let i = 0; i + 2 < indexCount; i += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const a = particleByVertex[vertexAt(i + corner)];
      const b = particleByVertex[vertexAt(i + (corner + 1) % 3)];
      if (a === b || !(a.mobility || b.mobility)) continue;
      const key = Math.min(a.vertex, b.vertex) + ':' + Math.max(a.vertex, b.vertex);
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a, b, length: 0 });
      }
    }
  }

  geometry.computeVertexNormals();
  const referenceNormals = normals.array.slice();
  normals.array.set(restNormals);
  let colliders = [];
  let remaining = 0;
  let accumulator = 0;
  let initialized = false;
  let scale = 1;

  function reset() {
    position.array.set(rest);
    normals.array.set(restNormals);
    position.needsUpdate = normals.needsUpdate = true;
    initialized = false;
    remaining = accumulator = 0;
  }

  function retarget(worldUnits, settle = true) {
    position.array.set(rest);
    mesh.updateWorldMatrix(true, true);
    mesh.updateMatrixWorld(true);
    // The armature and garment are siblings under the same scene.
    scale = worldUnits;
    const delta = new THREE.Vector3();
    for (const particle of particles) {
      particle.reference.copy(particle.target);
      mesh.getVertexPosition(particle.vertex, particle.skinned).applyMatrix4(mesh.matrixWorld);
      particle.target.copy(particle.skinned);
    }
    fit?.(particles, scale);
    for (const particle of particles) {
      delta.subVectors(particle.target, particle.reference);
      const reach = travel * scale * particle.mobility;
      if (!settle || !initialized || delta.lengthSq() > (2 * reach) ** 2) {
        particle.position.copy(particle.target);
        particle.previous.copy(particle.target);
      } else {
        particle.previous.addVectors(particle.target, delta.subVectors(particle.previous, particle.reference).clampLength(0, reach));
        particle.position.addVectors(particle.target, delta.subVectors(particle.position, particle.reference).clampLength(0, reach));
      }
    }
    const origin = new THREE.Vector3();
    const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
    const transform = new THREE.Matrix4();
    const toWorld = (vertex, point) => mesh.applyBoneTransform(vertex, point).applyMatrix4(mesh.matrixWorld);
    for (const particle of deformed) {
      if (!mesh.isSkinnedMesh) {
        particle.inverseSkin.setFromMatrix4(mesh.matrixWorld).invert();
        continue;
      }
      const vertex = particle.vertex;
      toWorld(vertex, origin.set(0, 0, 0));
      toWorld(vertex, x.copy(axisX)).sub(origin);
      toWorld(vertex, y.copy(axisY)).sub(origin);
      toWorld(vertex, z.copy(axisZ)).sub(origin);
      transform.makeBasis(x, y, z);
      const determinant = transform.determinant();
      if (Math.abs(determinant) < 1e-5 * scale ** 3 || !Number.isFinite(determinant)) {
        particle.inverseSkin.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      } else {
        particle.inverseSkin.setFromMatrix4(transform).invert();
      }
    }
    for (const edge of edges) edge.length = edge.a.target.distanceTo(edge.b.target);
    colliders = colliderBones.map(({ start, end, radius }) => ({
      segment: new THREE.Line3(start.getWorldPosition(new THREE.Vector3()), end.getWorldPosition(new THREE.Vector3())),
      radius: radius * scale
    }));
    for (const p of moving) {
      p.clearances = colliders.map(({ segment, radius }) =>
        Math.min(radius, segment.closestPointToPoint(p.target, true, closest).distanceTo(p.target))
      );
    }
    if (settle) updateFabricContacts();
    initialized = settle;
    remaining = settle ? settleSteps : 0;
    if (!settle) accumulator = 0;
    writeSurface();
  }

  const offset = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const other = new THREE.Vector3();
  const reference = new THREE.Vector3();
  function updateFabricContacts() {
    const faces = [];
    const bounds = new THREE.Sphere();
    const face = new THREE.Triangle();
    for (const surface of contactMeshes) {
      if (!surface.visible) continue;
      const count = surface.geometry.getAttribute('position').count;
      const vertices = Array.from({ length: count }, (_, i) =>
        surface.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(surface.matrixWorld)
      );
      const surfaceIndex = surface.geometry.index;
      for (let i = 0; i < surfaceIndex.count; i += 3) {
        face.set(vertices[surfaceIndex.getX(i)], vertices[surfaceIndex.getX(i + 1)], vertices[surfaceIndex.getX(i + 2)]);
        faces.push({
          triangle: face.clone(),
          normal: face.getNormal(new THREE.Vector3()),
          bounds: bounds.setFromPoints([face.a, face.b, face.c]).clone()
        });
      }
    }
    for (const p of moving) {
      let minimum = (0.075 * scale) ** 2;
      p.contact = undefined;
      for (const { triangle, normal, bounds } of faces) {
        if (bounds.distanceToPoint(p.target) > Math.sqrt(minimum)) continue;
        triangle.closestPointToPoint(p.target, closest);
        offset.subVectors(p.target, closest);
        const distance = offset.lengthSq();
        const clearance = offset.dot(normal);
        if (distance < minimum && clearance >= -0.004 * scale) {
          minimum = distance;
          p.contact = { normal, origin: closest.clone(), clearance: Math.min(clearance, 0.004 * scale) };
        }
      }
    }
  }
  function simulate() {
    for (const p of moving) {
      offset.subVectors(p.position, p.previous).multiplyScalar(0.91);
      p.previous.copy(p.position);
      p.position.add(offset).addScaledVector(other.subVectors(p.target, p.position), 135 * timeStep ** 2);
      p.position.y -= 9.81 * scale * p.mobility * timeStep ** 2;
    }
    for (let iteration = 0; iteration < 4; iteration++) {
      for (const { a, b, length } of edges) {
        offset.subVectors(b.position, a.position);
        const current = offset.length();
        if (current < 1e-8) continue;
        offset.multiplyScalar((current - length) / current * 0.58 / (a.mobility + b.mobility));
        a.position.addScaledVector(offset, a.mobility);
        b.position.addScaledVector(offset, -b.mobility);
      }
      for (const p of moving) {
        offset.subVectors(p.position, p.target).clampLength(0, travel * scale * p.mobility);
        p.position.copy(p.target).add(offset);
        for (const [i, { segment }] of colliders.entries()) {
          // Permit the existing skinned fit and prevent gravity from pushing the hem farther inside.
          const clearance = p.clearances[i];
          segment.closestPointToPoint(p.position, true, closest);
          offset.subVectors(p.position, closest);
          const distance = offset.length();
          if (distance > 1e-6 && distance < clearance) p.position.addScaledVector(offset, clearance / distance - 1);
        }
        p.position.y = Math.max(p.position.y, Math.min(-0.035, p.target.y));
        if (p.contact) {
          const { origin, normal, clearance } = p.contact;
          const separation = offset.subVectors(p.position, origin).dot(normal);
          if (separation < clearance) p.position.addScaledVector(normal, clearance - separation);
        }
      }
    }
  }

  function writeSurface() {
    for (const p of deformed) {
      offset.subVectors(p.position, p.skinned).applyMatrix3(p.inverseSkin);
      for (const i of p.vertices) {
        position.setXYZ(i, rest[i * 3] + offset.x, rest[i * 3 + 1] + offset.y, rest[i * 3 + 2] + offset.z);
      }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    for (const p of particles) {
      offset.set(0, 0, 0);
      for (const i of p.vertices) {
        other.fromBufferAttribute(normals, i).sub(reference.fromArray(referenceNormals, i * 3));
        offset.add(other);
      }
      offset.multiplyScalar(1 / p.vertices.length);
      for (const i of p.vertices) {
        other.fromArray(restNormals, i * 3).add(offset).normalize();
        normals.setXYZ(i, other.x, other.y, other.z);
      }
    }
    normals.needsUpdate = true;
  }

  return {
    reset,
    retarget,
    dispose() {
      mesh.geometry = baseGeometry;
      geometry.dispose();
    },
    advance(delta) {
      if (!remaining) return;
      accumulator += Math.min(delta, timeStep * 8);
      let stepped = false;
      while (accumulator >= timeStep && remaining > 0) {
        simulate();
        remaining--;
        accumulator -= timeStep;
        stepped = true;
      }
      if (stepped) writeSurface();
    }
  };
}

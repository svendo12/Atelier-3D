import * as THREE from 'three';

const vector = new THREE.Vector3();
const color = new THREE.Color();

export function usableSkin(mesh) {
  if (!mesh?.geometry.index || !mesh.skeleton || !Number.isFinite(mesh.bindMatrix.determinant()) ||
      Math.abs(mesh.bindMatrix.determinant()) < 1e-8) return false;
  const { position, normal, skinIndex, skinWeight } = mesh.geometry.attributes;
  if (!position?.count || ![normal, skinIndex, skinWeight].every(attribute => attribute?.count === position.count) ||
      skinIndex.itemSize !== 4 || skinWeight.itemSize !== 4) return false;
  const boneCount = mesh.skeleton.bones.length;
  for (let i = 0; i < position.count; i++) {
    let total = 0;
    for (let j = 0; j < 4; j++) {
      const bone = skinIndex.getComponent(i, j);
      const weight = skinWeight.getComponent(i, j);
      if (!Number.isInteger(bone) || bone < 0 || bone >= boneCount || !Number.isFinite(weight) || weight < 0) return false;
      total += weight;
    }
    if (Math.abs(total - 1) > .012) return false;
  }
  return true;
}

export function bindGarment(source, geometry, material, name) {
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.bindMode = source.bindMode;
  source.parent.add(mesh);
  mesh.bind(source.skeleton, source.bindMatrix);
  return mesh;
}

function geometryFor(source, triangles) {
  const original = source.geometry;
  const data = new THREE.BufferGeometry();
  const indices = new Map();
  const vertices = [];
  const selected = [];
  for (const index of triangles) {
    if (!indices.has(index)) {
      indices.set(index, vertices.length);
      vertices.push(index);
    }
    selected.push(indices.get(index));
  }
  const copyAttribute = attribute => {
    const values = vertices.flatMap(index => Array.from({ length: attribute.itemSize }, (_, column) => attribute.getComponent(index, column)));
    const TypedArray = attribute.normalized ? Float32Array : attribute.array.constructor;
    return new THREE.BufferAttribute(new TypedArray(values), attribute.itemSize);
  };
  for (const [key, value] of Object.entries(original.attributes)) data.setAttribute(key, copyAttribute(value));
  for (const [key, values] of Object.entries(original.morphAttributes)) data.morphAttributes[key] = values.map(copyAttribute);
  data.morphTargetsRelative = original.morphTargetsRelative;
  data.setIndex(selected);
  return data;
}

export function completeBody(source, fullIndex) {
  const fullGeometry = source.geometry.clone();
  fullGeometry.setIndex(fullIndex);
  fullGeometry.computeVertexNormals();
  const full = bindGarment(source, fullGeometry, source.material, 'Atelier Körperanprobe');
  const original = new Set();
  const originalIndex = source.geometry.index;
  for (let i = 0; i < originalIndex.count; i += 3) {
    original.add([originalIndex.getX(i), originalIndex.getX(i+1), originalIndex.getX(i+2)].join('/'));
  }
  const position = source.geometry.getAttribute('position');
  const lower = [];
  const upper = [];
  for (let i = 0; i < fullIndex.count; i += 3) {
    const tri = [fullIndex.getX(i), fullIndex.getX(i+1), fullIndex.getX(i+2)];
    if (original.has(tri.join('/'))) continue;
    const y = tri.reduce((value, v) => value + position.getY(v), 0) / 3;
    if (y >= 1) upper.push(...tri);
    else if (y > .10) lower.push(...tri);
  }
  full.morphTargetDictionary = { ...source.morphTargetDictionary };
  const restoreSkin = (triangles, name) => {
    const part = bindGarment(source, geometryFor(full, triangles), source.material, name);
    part.morphTargetDictionary = { ...source.morphTargetDictionary };
    return part;
  };
  return {
    full,
    upper: restoreSkin(upper, 'Atelier Haut unter Oberteilen'),
    lower: restoreSkin(lower, 'Atelier Haut unter Unterteilen'),
    disposeFittingMesh() {
      full.removeFromParent();
      fullGeometry.dispose();
    }
  };
}

function originalMaterials(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

// MakeHuman's shirt and trousers share one material but have disjoint triangles.
export function splitSportswear(source) {
  const pos = source.geometry.getAttribute('position');
  const index = source.geometry.index;
  const upper = [];
  const lower = [];
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    (pos.getY(tri[0]) > 1 ? upper : lower).push(...tri);
  }
  const old = source.geometry;
  const lowerGeometry = geometryFor(source, lower);
  const topGeometry = geometryFor(source, upper);
  source.geometry = topGeometry;
  old.dispose();
  return bindGarment(source, lowerGeometry, originalMaterials(source), 'Atelier Sporthose');
}

export function makeFabric(name, key, shade, { side = THREE.DoubleSide, roughness = .85 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: shade, roughness, side, vertexColors: true });
  material.name = 'Atelier ' + name;
  material.userData.wardrobeColor = { key: 'clothing:' + key, label: name, color: shade };
  return material;
}

export function shapeTop(source, material, name, type, realistic) {
  // Strip material groups for duplicated toon outlines. The new fabric has its own material.
  const geometry = source.geometry.clone();
  geometry.clearGroups();
  const position = geometry.getAttribute('position');
  const colors = [];
  const mobility = [];
  geometry.computeBoundingBox();
  const hem = geometry.boundingBox.min.y;
  const maxY = geometry.boundingBox.max.y;
  const { smoothstep } = THREE.MathUtils;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const hemBand = 1 - smoothstep(y, hem + .012, hem + .15);
    const cuff = smoothstep(Math.abs(x), realistic ? .23 : .17, realistic ? .295 : .25);
    if (type === 'oversize') {
      position.setXYZ(i, x * (1.10 + .15 * hemBand),
        y - .047 * hemBand - .010 * cuff, z + (z - .012) * (.085 + .09 * hemBand));
    } else if (type === 'crop') {
      position.setXYZ(i, x * (1 + .045 * hemBand), y + .034 * hemBand, z + (z - .031) * .23 * hemBand);
    } else if (type === 'banded') {
      position.setXYZ(i, x * (1 + .065 * cuff - .045 * hemBand), y - .015 * cuff + .012 * hemBand,
        z + (z - .035) * (.024 + .052 * cuff));
    } else {
      const body = 1 - smoothstep(Math.abs(x), .105, .21);
      position.setXYZ(i, x + .003 * Math.sign(x), y - .012 * hemBand, z + (z - .022) * .052 * body);
    }

    const collar = (1 - smoothstep(Math.abs(x), .061, .087)) * smoothstep(y, maxY - .035, maxY - .009);
    const edge = Math.max(1 - smoothstep(y, hem + .003, hem + .014), .70 * collar, .9 * cuff);
    const fold = .035 * (1 + Math.cos(x * 170));
    const edgeShade = type === 'banded' ? .48 : .23;
    color.setRGB(1, 1, 1).multiplyScalar(1 - edgeShade * edge - fold);
    colors.push(...color.toArray());
    mobility.push(type === 'oversize' ? .86 * hemBand : .44 * hemBand);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('_atelier_cloth', new THREE.Float32BufferAttribute(mobility, 1));
  const mesh = bindGarment(source, geometry, material, name);
  mesh.morphTargetDictionary = { ...source.morphTargetDictionary };
  return mesh;
}

function interpolate(a, b, t) {
  return {
    position: a.position.clone().lerp(b.position, t),
    normal: a.normal.clone().lerp(b.normal, t).normalize(),
    refs: [...a.refs.map(([index, weight]) => [index, weight * (1-t)]),
      ...b.refs.map(([index, weight]) => [index, weight * t])]
  };
}

function clipPolygon(input, distance) {
  const result = [];
  let previous = input.at(-1);
  let old = distance(previous.position);
  for (const vertex of input) {
    const next = distance(vertex.position);
    if ((old < 0) !== (next < 0)) result.push(interpolate(previous, vertex, old / (old - next)));
    if (next >= 0) result.push(vertex);
    previous = vertex;
    old = next;
  }
  return result;
}

function transferWeights(ids, weights, refs) {
  const mix = new Map();
  for (const [index, fraction] of refs) {
    for (let channel = 0; channel < 4; channel++) {
      const id = ids.getComponent(index, channel);
      mix.set(id, (mix.get(id) ?? 0) + weights.getComponent(index, channel) * fraction);
    }
  }
  const chosen = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = chosen.reduce((sum, item) => sum + item[1], 0);
  if (total <= 0) return [[0, 1], [0, 0], [0, 0], [0, 0]];
  while (chosen.length < 4) chosen.push([0, 0]);
  return chosen.map(([id, weight]) => [id, weight / total]);
}

function fittingSamples(position, normal) {
  // UV splits on the body must produce a single edge in the projected garment.
  const shared = new Map();
  const vertices = Array.from({ length: position.count }, (_, i) => {
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    const key = point.toArray().map(value => Math.round(value * 1e5)).join('/');
    const n = vector.fromBufferAttribute(normal, i);
    if (!shared.has(key)) shared.set(key, { position: point, normal: new THREE.Vector3(), refs: [[i, 1]] });
    const sample = shared.get(key);
    sample.normal.add(n);
    return sample;
  });
  for (const sample of shared.values()) sample.normal.normalize();
  return vertices;
}

export function fitFabric(source, material, name, regions, expand, shade, morphNames) {
  const sourceGeometry = source.geometry;
  const position = sourceGeometry.getAttribute('position');
  const normal = sourceGeometry.getAttribute('normal');
  const ids = sourceGeometry.getAttribute('skinIndex');
  const weights = sourceGeometry.getAttribute('skinWeight');
  const indices = sourceGeometry.index;
  const usedMorphs = Object.entries(source.morphTargetDictionary ?? {}).filter(([key, index]) =>
    (morphNames ? morphNames.has(key) : key.startsWith('atelier_')) && sourceGeometry.morphAttributes.position?.[index]);
  const transferNormals = morphNames && usedMorphs.every(([, index]) =>
    sourceGeometry.morphAttributes.normal?.[index]?.count === position.count);
  const vertices = fittingSamples(position, normal);
  const positions = [];
  const normals = [];
  const colors = [];
  const skinIndex = [];
  const skinWeight = [];
  const attributes = usedMorphs.map(() => []);
  const normalAttributes = transferNormals && usedMorphs.map(() => []);
  const vertexReuse = new Map();
  const faces = [];

  function append(vertex) {
    const key = vertex.refs.map(([i, f]) => i + ':' + f.toFixed(6)).sort().join('/');
    if (vertexReuse.has(key)) return vertexReuse.get(key);
    const next = positions.length / 3;
    vertexReuse.set(key, next);
    const clearance = typeof expand === 'function' ? expand(vertex.position) : expand;
    positions.push(...vertex.position.clone().addScaledVector(vertex.normal, clearance).toArray());
    normals.push(...vertex.normal.toArray());
    const lightness = shade(vertex.position);
    colors.push(lightness, lightness, lightness);
    const currentWeights = transferWeights(ids, weights, vertex.refs);
    skinIndex.push(...currentWeights.map(([id]) => id));
    skinWeight.push(...currentWeights.map(([, weight]) => weight));
    function transferMorph(attribute, values) {
      const delta = new THREE.Vector3();
      for (const [sourceIndex, amount] of vertex.refs) {
        delta.addScaledVector(vector.fromBufferAttribute(attribute, sourceIndex), amount);
      }
      values.push(...delta.toArray());
    }
    usedMorphs.forEach(([, index], channel) => {
      transferMorph(sourceGeometry.morphAttributes.position[index], attributes[channel]);
      if (transferNormals) transferMorph(sourceGeometry.morphAttributes.normal[index], normalAttributes[channel]);
    });
    return next;
  }

  for (let i = 0; i < indices.count; i += 3) {
    const triangle = [vertices[indices.getX(i)], vertices[indices.getX(i + 1)], vertices[indices.getX(i + 2)]];
    for (const region of regions) {
      let polygon = triangle;
      for (const distance of region) {
        polygon = clipPolygon(polygon, distance);
        if (!polygon.length) break;
      }
      for (let corner = 1; corner + 1 < polygon.length; corner++) {
        const a = append(polygon[0]), b = append(polygon[corner]), c = append(polygon[corner + 1]);
        if (a !== b && b !== c && c !== a) faces.push(a, b, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(faces);
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = attributes.map(values => new THREE.Float32BufferAttribute(values, 3));
  if (transferNormals) {
    geometry.morphAttributes.normal = normalAttributes.map(values => new THREE.Float32BufferAttribute(values, 3));
  }
  const mesh = bindGarment(source, geometry, material, name);
  mesh.morphTargetDictionary = Object.fromEntries(usedMorphs.map(([key], index) => [key, index]));
  return mesh;
}

export function makePlatformShoes(source, material) {
  const geometry = source.geometry.clone();
  geometry.clearGroups();
  geometry.computeBoundingBox();
  const soleY = geometry.boundingBox.min.y;
  const positions = geometry.getAttribute('position');
  const centers = [new THREE.Vector3(), new THREE.Vector3()];
  const counts = [0, 0];
  for (let i = 0; i < positions.count; i++) {
    const side = positions.getX(i) < 0 ? 0 : 1;
    centers[side].add(vector.fromBufferAttribute(positions, i));
    counts[side]++;
  }
  centers.forEach((center, side) => center.divideScalar(counts[side] || 1));
  const colors = [];
  const { smoothstep } = THREE.MathUtils;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const center = centers[x < 0 ? 0 : 1];
    const sole = 1 - smoothstep(y - soleY, .020, .046);
    positions.setXYZ(i, x + (x - center.x) * .18 * sole,
      y + .012 * sole * smoothstep(y - soleY, 0, .020), z + (z - center.z) * .105 * sole);
    const shade = 1 - .63 * sole;
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = bindGarment(source, geometry, material, 'Atelier Plateauschuhe');
  mesh.morphTargetDictionary = { ...source.morphTargetDictionary };
  return mesh;
}

function bodySection(geometry, y, centerZ, segments) {
  const positions = geometry.getAttribute('position');
  const profile = Array(segments).fill(0);
  for (let i = 0; i < geometry.index.count; i += 3) {
    const edges = [];
    for (let j = 0; j < 3; j++) {
      const a = geometry.index.getX(i + j);
      const b = geometry.index.getX(i + (j + 1) % 3);
      const ya = positions.getY(a), yb = positions.getY(b);
      if ((ya > y) === (yb > y)) continue;
      const f = (y - ya) / (yb - ya);
      edges.push([THREE.MathUtils.lerp(positions.getX(a), positions.getX(b), f),
        THREE.MathUtils.lerp(positions.getZ(a), positions.getZ(b), f) - centerZ]);
    }
    if (edges.length !== 2) continue;
    const [[ax, az], [bx, bz]] = edges;
    const ex = bx - ax, ez = bz - az;
    for (let j = 0; j < segments; j++) {
      const angle = 2 * Math.PI * j / segments;
      const x = Math.sin(angle), z = Math.cos(angle);
      const cross = x * ez - z * ex;
      if (Math.abs(cross) < 1e-8) continue;
      const t = (ax * z - az * x) / cross;
      if (t >= 0 && t <= 1) profile[j] = Math.max(profile[j], (ax * ez - az * ex) / cross);
    }
  }
  return profile;
}

export function makeSkirt(source, humanoid, material, {
  waist, waistWidth, waistDepth, centerZ, name = 'Atelier A-Linien-Rock',
  length = .315, flareWidth = .091, flareDepth = .055, pleatDepth = .013, spineBlend = 0
}) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const weight = [];
  const skinIndex = [];
  const skinWeight = [];
  const index = [];
  const rings = 12;
  const segments = 64;
  const hips = source.skeleton.bones.indexOf(humanoid.getRawBoneNode('hips'));
  const spine = source.skeleton.bones.indexOf(humanoid.getRawBoneNode('spine'));
  const { smoothstep } = THREE.MathUtils;
  const waistOutline = bodySection(source.geometry, waist, centerZ, segments);
  for (let row = 0; row <= rings; row++) {
    const t = row / rings;
    const flare = t ** .75;
    for (let i = 0; i < segments; i++) {
      const angle = 2 * Math.PI * i / segments;
      const across = Math.sin(angle);
      const depth = Math.cos(angle);
      const fold = Math.cos(angle * 16);
      const pleat = fold * pleatDepth * smoothstep(t, .06, .52);
      const authoredRadius = Math.hypot(across * waistWidth, depth * waistDepth);
      const radius = waistOutline[i] ? Math.abs(waistOutline[i]) + .009 : authoredRadius;
      const fitWeight = 1 - smoothstep(t, 0, .37);
      const x = THREE.MathUtils.lerp(across * waistWidth, across * radius, fitWeight) + across * (flareWidth * flare + pleat);
      const z = centerZ + THREE.MathUtils.lerp(depth * waistDepth, depth * radius, fitWeight) + depth * (flareDepth * flare + pleat);
      const y = waist - length * t + fold * pleatDepth * (.008 / .013) * t ** 3;
      positions.push(x, y, z);
      const belt = 1 - smoothstep(t, .065, .13);
      const hem = smoothstep(t, .94, .98);
      const darkness = .19 * belt + .13 * hem + (.06 + .04 * Math.cos(angle * 16)) * t;
      colors.push(1 - darkness, 1 - darkness, 1 - darkness);
      weight.push(.78 * smoothstep(t, .29, .96));
      const chestWeight = spineBlend * (1 - smoothstep(t, .02, .34));
      skinIndex.push(hips, spine, hips, hips);
      skinWeight.push(1 - chestWeight, chestWeight, 0, 0);
    }
  }
  for (let row = 0; row < rings; row++) {
    for (let i = 0; i < segments; i++) {
      const a = row * segments + i;
      const b = a + segments;
      const next = row * segments + (i + 1) % segments;
      index.push(a, b, next, next, b, next + segments);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setAttribute('_atelier_cloth', new THREE.Float32BufferAttribute(weight, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = bindGarment(source, geometry, material, name);
  mesh.userData.skirt = { rings, segments };
  return mesh;
}

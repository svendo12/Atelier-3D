const facePattern = /face|mimik|smile|blink|eye|mouth|lip|brow|jaw|nose|tongue|cheek|顔|表情|口|目|眉/i;
const clothingPattern = /clo(?:th|thing)|dress|outfit|shirt|skirt|pants|sleeve|shoe|wear|衣装|服|スカート|袖/i;
const bodyPattern = /waist|chest|body|shoulder|breast|bust|belly|stomach|hip|thigh|muscle|torso|arm|leg|taille|brust|hüft|körper|体型|体形|胴|胸|肩|腰|腹|腕|脚|太もも/i;
const technicalPattern = /^(?:atelier_|proportion_)|corrective|collision|helper|hide|mask|blendshape|補正|貫通|非表示/i;

export const SHAPE_CATEGORIES = {
  body: 'Körperform',
  face: 'Gesicht',
  clothing: 'Kleidung',
  technical: 'Technisch oder ungeklärt'
};

export function readBodyShapeSettings(input, fields) {
  const entries = [];
  for (const { key, min, max, initial } of fields) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || !Object.hasOwn(input ?? {}, key)) continue;
    const value = input[key];
    if (!Number.isFinite(value)) continue;
    const clamped = Math.min(max, Math.max(min, value));
    if (clamped !== initial) entries.push([key, clamped]);
  }
  return Object.fromEntries(entries);
}

function maxPositionDelta(geometry, index) {
  const base = geometry.getAttribute('position');
  const target = geometry.morphAttributes.position?.[index];
  if (!target) return null;
  if (!base || target.count !== base.count || target.itemSize !== 3) return null;
  const relative = geometry.morphTargetsRelative;
  let squared = 0;
  for (let i = 0; i < target.count; i++) {
    const x = target.getX(i) - (relative ? 0 : base.getX(i));
    const y = target.getY(i) - (relative ? 0 : base.getY(i));
    const z = target.getZ(i) - (relative ? 0 : base.getZ(i));
    const delta = x * x + y * y + z * z;
    if (!Number.isFinite(delta)) return null;
    squared = Math.max(squared, delta);
  }
  return Math.sqrt(squared);
}

function expressionBindings(manager) {
  const reserved = new Map();
  for (const expression of manager?.expressions ?? []) {
    for (const bind of expression.binds) {
      for (const mesh of bind.primitives ?? []) {
        if (!reserved.has(mesh)) reserved.set(mesh, new Map());
        const indices = reserved.get(mesh);
        if (!indices.has(bind.index)) indices.set(bind.index, []);
        indices.get(bind.index).push(expression.expressionName);
      }
    }
  }
  return reserved;
}

function shapeCategory(name, mesh, expressions, categoryHint) {
  if (expressions.length) return 'face';
  if (categoryHint) return categoryHint;
  if (!name || /^\d+$/.test(name)) return 'technical';
  if (clothingPattern.test(name) || clothingPattern.test(mesh)) return 'clothing';
  if (technicalPattern.test(name)) return 'technical';
  if (facePattern.test(name)) return 'face';
  return bodyPattern.test(name) ? 'body' : 'technical';
}

function sourceMesh(node, parser) {
  return parser.json.meshes?.[parser.associations.get(node)?.meshes];
}

export function preferBodyMesh(scene, parser, variants) {
  if (!variants) return;
  const primary = [];
  const secondary = [];
  scene.traverse(node => {
    if (!node.isSkinnedMesh || !node.visible) return;
    const name = sourceMesh(node, parser)?.name;
    if (name === variants.primary) primary.push(node);
    if (name === variants.secondary) secondary.push(node);
  });
  if (primary.length !== 1 || secondary.length !== 1) return;
  const [detailed] = primary;
  const [simplified] = secondary;
  const { bones, boneInverses } = detailed.skeleton;
  if (detailed.parent !== simplified.parent || !detailed.matrix.equals(simplified.matrix) ||
      !detailed.bindMatrix.equals(simplified.bindMatrix) || bones.length !== simplified.skeleton.bones.length ||
      !bones.every((bone, index) => bone === simplified.skeleton.bones[index] &&
        boneInverses[index].equals(simplified.skeleton.boneInverses[index]))) return;
  simplified.visible = false;
  return detailed;
}

export function createVrmBodyShapes(vrm, parser, profile) {
  const inventory = [];
  const targets = new Map();
  const reserved = expressionBindings(vrm.expressionManager);
  vrm.scene.traverse(node => {
    if (!node.isMesh || !node.morphTargetInfluences?.length) return;
    const association = parser.associations.get(node);
    const source = sourceMesh(node, parser);
    const mesh = source?.name || node.name || node.parent?.name || 'Mesh ohne Namen';
    const hasProfileCategory = source?.name &&
      (source.name === profile.meshVariants?.primary || source.name === profile.meshVariants?.secondary);
    const names = new Map(Object.entries(node.morphTargetDictionary ?? {}).map(([name, index]) => [index, name]));
    node.morphTargetInfluences.forEach((initial, index) => {
      const runtimeName = names.get(index);
      const declaredName = source?.extras?.targetNames?.[index];
      const name = typeof declaredName === 'string' && declaredName
        ? declaredName : runtimeName && !/^\d+$/.test(runtimeName) ? runtimeName : null;
      const expressions = reserved.get(node)?.get(index) ?? [];
      const categoryHint = hasProfileCategory ? profile.category?.(name) : undefined;
      const category = shapeCategory(name, mesh, expressions, categoryHint);
      const positionDelta = maxPositionDelta(node.geometry, index);
      const row = {
        name, index, mesh, primitive: association?.primitives ?? null, category, expressions, initial: Number.isFinite(initial) ? initial : null,
        positionDelta, approved: false
      };
      inventory.push(row);
      if (!name) return;
      if (!targets.has(name)) targets.set(name, []);
      targets.get(name).push({ node, row });
    });
  });

  const fields = [];
  const usedTargets = new Set();
  const channels = [];
  for (const { key, label, group, min, max, step, negative, positive } of profile.fields) {
    if (!label || !group || ![min, max, step].every(Number.isFinite) || min >= max || step <= 0) continue;
    const names = positive ? [positive, ...(negative ? [negative] : [])] : [key];
    if (new Set(names).size !== names.length || names.some(name => usedTargets.has(name) || technicalPattern.test(name))) continue;
    const bindings = names.map(name => targets.get(name));
    if (!bindings.every(matches => matches?.length && new Set(matches.map(({ node }) => node)).size === matches.length &&
        matches.some(({ row }) => row.category !== 'clothing' && row.positionDelta > 1e-7) &&
        matches.every(({ row }) => row.category !== 'face' && row.expressions.length === 0))) continue;
    const initial = positive ? 0 : bindings[0][0].row.initial;
    if (!Number.isFinite(initial) || initial < min || initial > max ||
        bindings.some(matches => matches.some(({ row }) => row.initial !== initial))) continue;

    names.forEach(name => usedTargets.add(name));
    for (const matches of bindings) for (const { row } of matches) row.approved = true;
    fields.push({ key, label, group, min, max, step, initial, positive: positive ?? key, negative });
    channels.push({ key, positive, initial, bindings });
  }

  let values = {};
  return {
    inventory,
    fields,
    hint: profile.hint,
    set(input) { values = readBodyShapeSettings(input, fields); },
    apply() {
      for (const { key, positive, initial, bindings } of channels) {
        const value = Object.hasOwn(values, key) ? values[key] : initial;
        for (const [side, matches] of bindings.entries()) {
          const weight = positive ? Math.max(0, side === 0 ? value : -value) : value;
          for (const { node, row } of matches) node.morphTargetInfluences[row.index] = weight;
        }
      }
    }
  };
}

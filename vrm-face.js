import { VRMExpression, VRMExpressionManager, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';
import { FACE_GROUPS } from './face-settings.js';

// The CC0 model's VRM 0.x expressions lost their bindings during its VRM 1.0
// conversion. Its original blend shapes are still exported under these names.
const hairSampleShapes = {
  happy: 'ALL_Joy', sad: 'ALL_Sorrow', angry: 'ALL_Angry', surprised: 'ALL_Surprised', relaxed: 'ALL_Fun',
  blink: 'EYE_Close', blinkLeft: 'EYE_Close_L', blinkRight: 'EYE_Close_R',
  aa: 'MTH_A', ih: 'MTH_I', ou: 'MTH_U', ee: 'MTH_E', oh: 'MTH_O'
};

function restoreHairSampleBindings(vrm, manager) {
  for (const [name, shape] of Object.entries(hairSampleShapes)) {
    let expression = manager.getExpression(name);
    if (expression?.binds.length) continue;
    const bindings = new Map();
    vrm.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const [target, index] of Object.entries(mesh.morphTargetDictionary ?? {})) {
        if (!target.endsWith('Fcl_' + shape)) continue;
        if (!hasShape(mesh, index)) continue;
        if (!bindings.has(index)) bindings.set(index, []);
        bindings.get(index).push(mesh);
      }
    });
    if (!bindings.size) continue;
    if (!expression) {
      expression = new VRMExpression(name);
      manager.registerExpression(expression);
      vrm.scene.add(expression);
    }
    for (const [index, primitives] of bindings) {
      expression.addBind(new VRMExpressionMorphTargetBind({ primitives, index, weight: 1 }));
    }
  }
}

const detailGroups = [
  {
    label: 'Augenbrauen',
    options: [
      ['browRaise', 'Brauen heben', 'browInnerUp', 'BRW_Surprised'],
      ['leftBrowRaise', 'Linke Braue außen heben', 'browOuterUpRight'],
      ['rightBrowRaise', 'Rechte Braue außen heben', 'browOuterUpLeft'],
      ['leftBrowLower', 'Linke Braue senken', 'browDownRight'],
      ['rightBrowLower', 'Rechte Braue senken', 'browDownLeft'],
      ['browFrown', 'Brauen zusammenziehen', '', 'BRW_Angry'],
      ['browSad', 'Brauen traurig neigen', '', 'BRW_Sorrow'],
      ['browJoy', 'Brauen freudig anheben', '', 'BRW_Joy']
    ]
  },
  {
    label: 'Lider und Wangen',
    options: [
      ['leftEyeWide', 'Linkes Auge weiten', 'eyeWideRight'],
      ['rightEyeWide', 'Rechtes Auge weiten', 'eyeWideLeft'],
      ['eyeWide', 'Beide Augen weiten', '', 'EYE_Surprised'],
      ['leftSquint', 'Linkes Auge zusammenkneifen', 'eyeSquintRight', 'EYE_Joy_R'],
      ['rightSquint', 'Rechtes Auge zusammenkneifen', 'eyeSquintLeft', 'EYE_Joy_L'],
      ['eyeFrown', 'Lider anspannen', '', 'EYE_Angry'],
      ['leftCheek', 'Linke Wange heben', 'cheekSquintRight'],
      ['rightCheek', 'Rechte Wange heben', 'cheekSquintLeft']
    ]
  },
  {
    label: 'Mund und Kiefer',
    options: [
      ['jawOpen', 'Kiefer öffnen', 'jawOpen', 'MTH_Surprised'],
      ['leftSmile', 'Linken Mundwinkel heben', 'mouthSmileRight'],
      ['rightSmile', 'Rechten Mundwinkel heben', 'mouthSmileLeft'],
      ['leftFrown', 'Linken Mundwinkel senken', 'mouthFrownRight'],
      ['rightFrown', 'Rechten Mundwinkel senken', 'mouthFrownLeft'],
      ['leftPress', 'Lippen links pressen', 'mouthPressRight'],
      ['rightPress', 'Lippen rechts pressen', 'mouthPressLeft'],
      ['mouthUp', 'Mundwinkel heben', '', 'MTH_Up'],
      ['mouthDown', 'Mundwinkel senken', '', 'MTH_Down'],
      ['mouthWide', 'Mund verbreitern', '', 'MTH_Large'],
      ['mouthSmall', 'Mund verkleinern', '', 'MTH_Small']
    ]
  }
];

function hasShape(mesh, index) {
  const positions = mesh.geometry.morphAttributes.position?.[index];
  if (!positions) return false;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getX(i) || positions.getY(i) || positions.getZ(i)) return true;
  }
  return false;
}

function addDetailExpressions(vrm, manager) {
  const definitions = new Map();
  for (const { options } of detailGroups) {
    for (const [key, , realistic, anime] of options) {
      if (realistic) definitions.set(realistic, key);
      if (anime) definitions.set('Fcl_' + anime, key);
    }
  }
  const expressions = new Map();
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary ?? {})) {
      const marker = name.indexOf('Fcl_');
      const key = definitions.get(marker === -1 ? name : name.slice(marker));
      if (!key || !hasShape(mesh, index)) continue;
      const id = 'detail:' + key;
      if (!expressions.has(id)) {
        // Keep the studio control ID separate from the names authored in the model.
        let name = 'atelier.face.' + key;
        while (manager.getExpression(name)) name += '_';
        const expression = new VRMExpression(name);
        manager.registerExpression(expression);
        vrm.scene.add(expression);
        expressions.set(id, expression);
      }
      expressions.get(id).addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index, weight: 1 }));
    }
  });
  return expressions;
}

function blendWeights(settings, supported, editable) {
  const weights = new Map();
  for (const [name, value] of Object.entries(settings?.mix ?? {})) {
    if (editable.has(name)) weights.set(name, value / 100);
  }
  for (const { key, options } of FACE_GROUPS) {
    const entry = settings?.[key];
    if (entry && supported.has(entry.name)) {
      weights.set(entry.name, Math.max(weights.get(entry.name) ?? 0, entry.strength / 100));
    }
    if (key === 'eyes') continue;
    const total = options.reduce((sum, [name]) => sum + (weights.get(name) ?? 0), 0);
    if (total > 1) {
      for (const [name] of options) {
        if (weights.has(name)) weights.set(name, weights.get(name) / total);
      }
    }
  }
  const blink = weights.get('blink');
  if (blink && (weights.has('blinkLeft') || weights.has('blinkRight')) &&
    supported.has('blinkLeft') && supported.has('blinkRight')) {
    weights.delete('blink');
    for (const side of ['blinkLeft', 'blinkRight']) {
      weights.set(side, Math.max(blink, weights.get(side) ?? 0));
    }
  }
  return weights;
}

export function createVrmFace(vrm) {
  const manager = vrm.expressionManager ?? new VRMExpressionManager();
  if (vrm.meta.name === 'HairSample_Male') restoreHairSampleBindings(vrm, manager);

  const supported = new Map();
  for (const { options } of FACE_GROUPS) {
    for (const [name] of options) {
      const expression = manager.getExpression(name);
      if (expression?.binds.length) supported.set(name, expression);
    }
  }
  const custom = Object.values(manager.customExpressionMap)
    .filter(({ expressionName, binds }) => expressionName.length <= 233 && binds.length > 0);
  const editable = new Map([
    ...supported,
    ...addDetailExpressions(vrm, manager),
    ...custom.map(expression => ['custom:' + expression.expressionName, expression])
  ]);
  if (!editable.size) return;
  vrm.expressionManager = manager;

  const fineGroups = [
    ...detailGroups.map(({ label, options }) => ({
      label, options: options.map(([key, caption]) => ['detail:' + key, caption])
    })),
    ...FACE_GROUPS.map(({ label, options }) => ({ label, options })),
    { label: 'Modellspezifische Ausdrücke', options: custom.map(({ expressionName }) => ['custom:' + expressionName, expressionName]) }
  ].map(({ label, options }) => ({ label, options: options.filter(([id]) => editable.has(id)) }))
    .filter(({ options }) => options.length);

  const morphs = new Map();
  for (const expression of editable.values()) {
    for (const bind of expression.binds) {
      if (!(bind instanceof VRMExpressionMorphTargetBind)) continue;
      for (const mesh of bind.primitives) {
        if (!morphs.has(mesh)) morphs.set(mesh, new Set());
        morphs.get(mesh).add(bind.index);
      }
    }
  }

  function limitMorphWeights() {
    for (const [mesh, indices] of morphs) {
      for (const index of indices) {
        const weights = mesh.morphTargetInfluences;
        if (weights?.[index] > 1) weights[index] = 1;
      }
    }
  }
  return {
    supported,
    editable,
    fineGroups,
    set(settings) {
      const weights = blendWeights(settings, supported, editable);
      for (const [id, expression] of editable) expression.weight = weights.get(id) ?? 0;
    },
    limitMorphWeights,
    update() {
      manager.update();
      limitMorphWeights();
    },
    overrideHint(settings) {
      const affected = new Set();
      for (const [id, weight] of blendWeights(settings, supported, editable)) {
        if (!weight) continue;
        const expression = editable.get(id);
        if (expression.overrideBlink !== 'none') affected.add('Augenschluss');
        if (expression.overrideMouth !== 'none') affected.add('Mundformen');
      }
      return affected.size
        ? 'Bei dieser Kombination können VRM-Regeln ' + [...affected].join(' und ') + ' abschwächen.'
        : '';
    }
  };
}

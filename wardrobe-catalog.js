export const ACCESSORY_GROUPS = {
  glasses: 'Brillen',
  hats: 'Hüte und Mützen',
  hairAccessories: 'Haarschmuck',
  props: 'Sonstige Gegenstände',
  local: 'Lokal importiert'
};
export const ACCESSORY_ANCHORS = {
  head: 'Kopf', leftHand: 'Linke Hand der Figur', rightHand: 'Rechte Hand der Figur',
  chest: 'Oberkörper', leftFoot: 'Linker Fuß der Figur', rightFoot: 'Rechter Fuß der Figur'
};

const localPositions = {
  head: [0, .225, .10], leftHand: [0, -.035, .04], rightHand: [0, -.035, .04],
  chest: [0, .025, .18], leftFoot: [0, .06, .07], rightFoot: [0, .06, .07]
};
const mannequinPositions = {
  head: [0, .50, .20], leftHand: [0, -.09, .11], rightHand: [0, -.09, .11],
  chest: [0, .63, .34], leftFoot: [0, .09, .16], rightFoot: [0, .09, .16]
};

const authored = {
  kind: 'rigid', format: 'generated', author: 'Atelier 3D',
  source: './wardrobe-props.js', license: 'CC0-1.0'
};
const fit = (position, scale, rotation = [0, 0, 0]) => ({ position, scale, rotation });

// Offsets are in the local axes of the reference bone. Each listed model has its own fit.
export const ACCESSORIES = [
  {
    ...authored, id: 'round-glasses', name: 'Runde Brille', category: 'glasses', anchor: 'head',
    fits: {
      mannequin: fit([0, .215, .265], 3.05),
      realistic: fit([0, .04, .126], 1.0),
      'realistic-female': fit([0, .037, .115], .96)
    }
  },
  {
    ...authored, id: 'baseball-cap', name: 'Basecap', category: 'hats', anchor: 'head',
    fits: {
      mannequin: fit([0, .350, -.008], 2.28),
      realistic: fit([0, .109, .008], 1.05)
    }
  },
  {
    ...authored, id: 'hair-bow', name: 'Haarschleife', category: 'hairAccessories', anchor: 'head',
    fits: {
      'realistic-female': fit([.056, .109, .095], .8, [-9, 26, 26]),
      anime: fit([.091, .141, .093], 1.05, [-8, 28, 27]),
      'anime-male': fit([.105, .151, .118], 1.05, [-8, 28, 27])
    }
  },
  {
    ...authored, id: 'paintbrush', name: 'Zeichenpinsel', category: 'props', anchor: 'rightHand', slot: 'rightHand',
    fits: {
      mannequin: fit([.014, -.093, .049], 1.85, [6, 0, -74]),
      realistic: fit([-.081, -.029, .006], 1.0, [69, 0, 21]),
      'realistic-female': fit([-.072, -.024, .005], .92, [69, 0, 21]),
      anime: fit([-.051, -.018, .007], .9, [72, 0, 20]),
      'anime-male': fit([-.058, -.020, .012], .9, [72, 0, 20])
    }
  }
];

export const ACCESSORY_TRANSFORM_FIELDS = [
  ...['X', 'Y', 'Z'].map((axis, i) => ({
    key: 'position', i, label: 'Position ' + axis, unit: 'cm', min: -30, max: 30, step: .1
  })),
  ...['X', 'Y', 'Z'].map((axis, i) => ({
    key: 'rotation', i, label: 'Drehung ' + axis, unit: '°', min: -180, max: 180, step: 1
  })),
  { key: 'scale', label: 'Größe', unit: '%', min: 25, max: 250, step: 1 }
];

export const LOCAL_ACCESSORY_SCALE = { min: 1, max: 1000 };

export const defaultAccessory = () => ({
  position: [0, 0, 0], rotation: [0, 0, 0], scale: 100, visible: true
});

export function setAccessory(equipped, id, item) {
  const asset = ACCESSORIES.find(candidate => candidate.id === id);
  if (asset?.slot && item.visible) {
    for (const other of ACCESSORIES) {
      if (other.id !== id && other.slot === asset.slot && equipped[other.id]?.visible) {
        equipped[other.id] = { ...equipped[other.id], visible: false };
      }
    }
  }
  equipped[id] = item;
}

export function localAssetEntries(model, anchors, rig, equipped, hasFiles) {
  const options = Object.keys(ACCESSORY_ANCHORS).filter(anchor => anchors[anchor]);
  const unit = rig ? 2 / rig.baseScale : 2;
  const forward = rig?.legacy ? -1 : 1;
  return Object.entries(equipped).flatMap(([id, item]) => {
    if (!item.source || !options.length) return [];
    const anchor = options.includes(item.anchor) ? item.anchor : options[0];
    const position = rig
      ? localPositions[anchor].map((value, axis) => value * unit * (axis === 2 ? forward : 1))
      : mannequinPositions[anchor];
    return [{
      id, category: 'local', kind: 'rigid', format: 'local', name: item.source.name,
      source: item.source, anchor, options, missing: !hasFiles(id, item.source), offsetUnit: .01 * unit,
      fits: { [model]: fit(position, unit, [0, forward < 0 ? 180 : 0, 0]) }
    }];
  });
}

function fileDescription(file) {
  if (typeof file?.name !== 'string' || !file.name || file.name.length > 255 ||
      /[\\/\x00-\x1f]/.test(file.name) || !Number.isSafeInteger(file.size) || file.size < 0) return;
  return { name: file.name, size: file.size };
}

export function describeAssetSource(file, companions) {
  const root = fileDescription(file);
  const descriptions = companions.map(fileDescription);
  if (!root || descriptions.some(entry => !entry)) {
    throw new Error('Mindestens ein Dateiname ist für den Projektspeicher ungültig.');
  }
  return { ...root, companions: descriptions.sort((a, b) => a.name.localeCompare(b.name, 'en')) };
}

export function readAssetSource(input) {
  const root = fileDescription(input);
  if (!root || root.size === 0 || !/\.gl(?:b|tf)$/i.test(root.name) || !Array.isArray(input.companions)) return;
  const companions = input.companions.map(fileDescription);
  if (companions.some(file => !file)) return;
  return describeAssetSource(root, companions);
}

function readTransform(saved, local = false) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
  const item = defaultAccessory();
  for (const field of ACCESSORY_TRANSFORM_FIELDS) {
    const { key, i } = field;
    const { min, max } = local && key === 'scale' ? LOCAL_ACCESSORY_SCALE : field;
    const value = i === undefined ? saved[key] : saved[key]?.[i];
    if (!Number.isFinite(value)) continue;
    const clamped = Math.max(min, Math.min(max, value));
    if (i === undefined) item[key] = clamped;
    else item[key][i] = clamped;
  }
  item.visible = saved.visible !== false;
  return item;
}

export function readAccessories(input, models = []) {
  const result = {};
  for (const asset of ACCESSORIES) {
    for (const model of Object.keys(asset.fits)) {
      const item = readTransform(input?.[model]?.[asset.id]);
      if (item) setAccessory(result[model] ??= {}, asset.id, item);
    }
  }
  const usedIds = new Set();
  for (const model of models) {
    for (const [id, saved] of Object.entries(input?.[model] ?? {})) {
      if (!/^local-[a-f0-9-]{36}$/.test(id) || usedIds.has(id)) continue;
      const source = readAssetSource(saved?.source);
      const item = readTransform(saved, true);
      if (!item || !source) continue;
      const anchor = typeof saved.anchor === 'string' && Object.hasOwn(ACCESSORY_ANCHORS, saved.anchor)
        ? saved.anchor : 'head';
      (result[model] ??= {})[id] = { ...item, source, anchor };
      usedIds.add(id);
    }
  }
  return result;
}

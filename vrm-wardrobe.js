import * as THREE from 'three';
import { completeBody, fitFabric, makeFabric, makePlatformShoes, makeSkirt, shapeTop, splitSportswear, usableSkin } from './wardrobe-geometry.js';

export const WARDROBE_DEFAULTS = { top: 'original', bottom: 'original', dress: 'none', shoes: 'original', necklace: 'none', earrings: 'none' };
const ids = {
  top: ['original', 'short', 'oversize', 'long-sleeve', 'banded'],
  bottom: ['original', 'leggings', 'skirt', 'capri'],
  dress: ['none', 'sport-dress'],
  shoes: ['original', 'platform'],
  necklace: ['none', 'silver', 'pendant', 'pearls'],
  earrings: ['none', 'studs', 'hoops', 'drops']
};
const clamp = THREE.MathUtils.smoothstep;

export function readWardrobe(input, fallbackTop = WARDROBE_DEFAULTS.top, labels) {
  return Object.fromEntries(Object.entries(ids).map(([slot, choices]) => {
    const fallback = slot === 'top' ? fallbackTop : WARDROBE_DEFAULTS[slot];
    const value = input?.[slot];
    const available = typeof value === 'string' &&
      (labels ? Object.hasOwn(labels[slot] ?? {}, value) : choices.includes(value));
    return [slot, available ? value : fallback];
  }));
}

function byMaterial(root, name) {
  let result;
  root.traverse(node => {
    if (!node.isSkinnedMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.some(material => material.name === name)) result = node;
  });
  return result;
}

function materialForJewelry(key, label, tint, metallic) {
  const material = new THREE.MeshStandardMaterial({ color: tint, metalness: metallic, roughness: metallic ? .32 : .48 });
  material.name = 'Atelier ' + label;
  material.userData.wardrobeColor = { key, label, color: tint };
  return material;
}

function piece(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  parent.add(mesh);
  return mesh;
}
function pearl(parent, size, material, position) {
  return piece(parent, new THREE.SphereGeometry(size, 14, 10), material, position);
}

function addNecklaces(vrm, realistic) {
  const chest = vrm.humanoid.getNormalizedBoneNode('upperChest') ??
    vrm.humanoid.getNormalizedBoneNode('chest') ?? vrm.humanoid.getNormalizedBoneNode('spine');
  const root = new THREE.Group();
  const anchor = new THREE.Vector3(0, realistic ? 1.325 : 1.302, realistic ? .040 : -.020);
  root.position.copy(chest.worldToLocal(anchor.clone()));
  chest.add(root);
  const chestLocalZ = root.position.z;
  const result = {};
  for (const [id, label, depth, tint] of [
    ['silver', 'Silberkette', .088, '#bfc8d5'],
    ['pendant', 'Kette mit Anhänger', .112, '#d6ad54'],
    ['pearls', 'Perlenkette', .071, '#f4e4d4']
  ]) {
    const group = new THREE.Group();
    group.name = label;
    root.add(group);
    const material = materialForJewelry('clothing:necklace-' + id, label, tint, id === 'pearls' ? 0 : .51);
    const width = realistic ? .059 : .047;
    const forward = .100 + (id === 'pendant' ? .034 : 0);
    const back = realistic ? .053 : .051;
    const middle = (forward-back)/2;
    const points = [];
    for (let i = 0; i < 72; i++) {
      const angle = i * 2 * Math.PI / 72;
      const front = Math.cos(angle);
      const x = Math.sin(angle) * width;
      const y = .030 - depth * ((1+front)*.5) ** 1.23;
      const z = middle + (forward+back)*.5 * front;
      points.push(new THREE.Vector3(x,y,z));
    }
    const path = new THREE.CatmullRomCurve3(points, true);
    if (id === 'pearls') {
      for (let i = 0; i < 38; i++) pearl(group, .0055, material, path.getPointAt(i/38));
    } else {
      piece(group, new THREE.TubeGeometry(path, 88, id === 'silver' ? .0023 : .0028, 7, true), material, new THREE.Vector3());
      if (id === 'pendant') {
        const front = path.getPoint(0);
        const charm = piece(group, new THREE.CylinderGeometry(.012, .012, .0048, 28), material,
          front.clone().add(new THREE.Vector3(0,-.011,.002)));
        charm.rotation.x = Math.PI / 2;
      }
    }
    result[id] = [group];
  }
  return {
    items: result,
    fit(state, top) {
      root.scale.x = 1 + (state.shoulders - 1) * .45;
      root.scale.z = 1 + (state.chest - 1) * .30;
      // A thicker shirt needs slightly more room in front of the chest.
      root.position.z = chestLocalZ + (state.chest - 1) * .037 + (top === 'oversize' ? .016 : 0);
    }
  };
}

function addEarrings(vrm, realistic) {
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  const attachments = [];
  const result = { studs: [], hoops: [], drops: [] };
  const designs = [
    ['studs', 'Perlenstecker', '#f3e7d5', .2],
    ['hoops', 'Creolen', '#dbad52', .56],
    ['drops', 'Tropfenohrringe', '#308c9c', .34]
  ].map(([id, label, shade, metal]) => [id, label, materialForJewelry('clothing:earrings-' + id, label, shade, metal)]);
  for (const sign of [-1, 1]) {
    const root = new THREE.Group();
    const anchor = new THREE.Vector3(sign * (realistic ? .0725 : .104), realistic ? 1.463 : 1.421, realistic ? .049 : -.024);
    root.position.copy(head.worldToLocal(anchor));
    attachments.push({ root, position: root.position.clone() });
    head.add(root);
    for (const [id, label, material] of designs) {
      const group = new THREE.Group();
      group.name = label;
      root.add(group);
      result[id].push(group);
      if (id === 'studs') {
        pearl(group, .0068, material, new THREE.Vector3(sign * .002, -.001, .005));
      } else if (id === 'hoops') {
        const ring = piece(group, new THREE.TorusGeometry(.020, .0027, 10, 34), material,
          new THREE.Vector3(sign * .009, -.019, realistic ? .006 : .008));
        ring.scale.x = .78;
        ring.rotation.y = sign * -.38;
      } else {
        pearl(group, .0044, material, new THREE.Vector3(0,0,.006));
        const stem = piece(group, new THREE.CylinderGeometry(.0016,.0016,.030,10), material,
          new THREE.Vector3(sign * .005,-.015,.009));
        stem.rotation.z = sign * .23;
        const crystal = piece(group, new THREE.OctahedronGeometry(.013), material,
          new THREE.Vector3(sign * .018,-.036,.014));
        crystal.scale.set(.72,1.38,.68);
      }
    }
  }
  return { items: result, fit: state => {
    for (const { root, position } of attachments) {
      root.position.copy(position);
      root.position.x *= state.head;
      root.position.z *= state.head;
      root.position.y *= 1 + (state.head - 1) * .45;
    }
  } };
}

function makeLongShirt(top, body, realistic) {
  const fabric = makeFabric('Langarmshirt', 'long-sleeve', '#c5a989');
  const shirt = shapeTop(top, fabric, 'Atelier Langarmshirt', 'layer', realistic);
  const sleeveStart = realistic ? .232 : .230;
  const sleeveEnd = realistic ? .563 : .510;
  const sleeve = fitFabric(body, fabric, 'Atelier Lange Ärmel',
    [-1, 1].map(sign => [
      point => sign * point.x - sleeveStart, point => sleeveEnd - sign * point.x, point => point.y - 1.13
    ]),
    point => .0025 + .008 * clamp(Math.abs(point.x), sleeveStart + .012, sleeveStart + .093),
    point => .98 - .22 * clamp(Math.abs(point.x), sleeveEnd - .024, sleeveEnd - .007));
  return [shirt, sleeve];
}

function makeSportDress(fittedBody, humanoid, realistic) {
  const fabric = makeFabric('Sportkleid', 'sport-dress', '#526b92');
  const waist = realistic ? 1.070 : 1.050;
  const neckline = realistic ? 1.25 : 1.218;
  const shoulder = realistic ? 1.37 : 1.334;
  const outerEdge = realistic ? .157 : .131;
  const bodice = fitFabric(fittedBody, fabric, 'Atelier Sportkleid Oberteil', [[
    point => point.y - (waist - .047),
    point => THREE.MathUtils.lerp(neckline, shoulder, clamp(Math.abs(point.x), .055, .101)) - point.y,
    point => outerEdge - .027 * clamp(point.y, neckline - .082, neckline + .014)
      + .022 * clamp(point.y, shoulder - .075, shoulder - .022) - Math.abs(point.x)
  ]], .015, point => .94 - .18 * (1 - clamp(point.y, waist - .033, waist + .002)));
  const skirt = makeSkirt(fittedBody, humanoid, fabric, {
    name: 'Atelier Sportkleid Rock', waist, length: .300, waistWidth: realistic ? .143 : .125,
    waistDepth: realistic ? .105 : .096, centerZ: realistic ? .062 : .043,
    flareWidth: .108, flareDepth: .100, pleatDepth: .005, spineBlend: .43
  });
  const tights = fitFabric(fittedBody, fabric, 'Atelier Sportkleid Innenhose',
    [[point => (waist - .059) - point.y, point => point.y - (waist - .312)]], .011, () => .79);
  return [bodice, skirt, tights];
}

export function createVrmWardrobe(vrm, fullBodyIndex) {
  const realistic = vrm.meta.name === 'Atelier 3D - Realistisch weiblich';
  const anime = vrm.meta.name === 'VRM1_Constraint_Twist_Sample';
  if (!realistic && !anime) return;

  const top = byMaterial(vrm.scene, realistic ? 'female_sportsuit01' : 'Tops_01_CLOTH');
  const body = byMaterial(vrm.scene, realistic ? 'body' : 'Body_00_SKIN');
  const originalShort = !realistic && byMaterial(vrm.scene, 'Atelier_Cropped_Top');
  if (!usableSkin(top) || !usableSkin(body) || (realistic ? !fullBodyIndex : !usableSkin(originalShort))) return;
  const lowerTemplate = realistic ? top : byMaterial(vrm.scene, 'Bottoms_01_CLOTH');
  if (!usableSkin(lowerTemplate) || !['hips', 'spine', 'leftUpperLeg', 'rightUpperLeg'].every(name =>
    body.skeleton.bones.includes(vrm.humanoid.getRawBoneNode(name)))) return;
  const bottom = realistic ? splitSportswear(top) : lowerTemplate;
  const expandedBody = realistic ? completeBody(body, fullBodyIndex) : undefined;
  const fittedBody = expandedBody?.full ?? body;

  const shortMaterial = realistic && makeFabric('Kurzes Top', 'crop-top', '#6a3e5b');
  const short = originalShort || shapeTop(top, shortMaterial, 'Atelier Kurzes Top', 'crop', realistic);
  const banded = shapeTop(short, makeFabric('Kurzarmshirt mit Bündchen', 'banded', '#7b527f'),
    'Atelier Kurzarmshirt mit Bündchen', 'banded', realistic);
  const oversize = shapeTop(top, makeFabric('Oversize-Shirt', 'oversize', '#578282'),
    'Atelier Oversize-Shirt', 'oversize', realistic);
  const long = makeLongShirt(top, fittedBody, realistic);
  const waist = realistic ? .997 : .988;
  const beltWidth = realistic ? .145 : .127;
  const leggings = fitFabric(fittedBody, makeFabric('Leggings', 'leggings', '#3a455e'), 'Atelier Leggings',
    [[p => waist - p.y, p => p.y - .083]], .010,
    p => 1 - .16 * Math.max(clamp(p.y, waist-.035,waist-.012), 1-clamp(p.y,.091,.112)));
  const hem = realistic ? .337 : .325;
  const capri = fitFabric(fittedBody, makeFabric('Caprihose', 'capri', '#617061'), 'Atelier Caprihose',
    [[p => waist - p.y, p => p.y - hem]], .013,
    p => .97 - .28 * Math.max(1 - clamp(p.y, hem + .012, hem + .032), clamp(p.y, waist - .042, waist - .016)));
  const skirtMaterial = makeFabric('A-Linien-Rock', 'skirt', '#8a4f66');
  const skirt = makeSkirt(fittedBody, vrm.humanoid, skirtMaterial, {
    waist: waist + .016, waistWidth: beltWidth, waistDepth: .108, centerZ: realistic ? .066 : .042
  });
  const lining = fitFabric(fittedBody, new THREE.MeshStandardMaterial({ color: '#322e3a', roughness: .9, vertexColors: true }),
    'Atelier Rockfutter', [[p => waist-p.y, p => p.y-(realistic ? .745 : .755)]], .008, () => .85);
  const dress = makeSportDress(fittedBody, vrm.humanoid, realistic);
  const shoes = byMaterial(vrm.scene, realistic ? 'shoes02' : 'Shoes_01_CLOTH');
  const platforms = usableSkin(shoes) && ['leftFoot', 'rightFoot'].every(name =>
    shoes.skeleton.bones.includes(vrm.humanoid.getRawBoneNode(name))) &&
    makePlatformShoes(shoes, makeFabric('Plateauschuhe', 'platform', '#8c6269'));
  expandedBody?.disposeFittingMesh();
  const necklaces = addNecklaces(vrm, realistic);
  const earrings = addEarrings(vrm, realistic);

  const groups = {
    top: { original: [top], short: [short], oversize: [oversize], 'long-sleeve': long, banded: [banded] },
    bottom: { original: [bottom], leggings: [leggings], skirt: [skirt], capri: [capri] },
    dress: { none: [], 'sport-dress': dress },
    ...(platforms && { shoes: { original: [shoes], platform: [platforms] } }),
    necklace: { none: [], ...necklaces.items },
    earrings: { none: [], ...earrings.items }
  };
  const labels = {
    top: { original: realistic ? 'Sportshirt' : 'Weißes T-Shirt', short: realistic ? 'Kurzes Top' : 'Blaues Kurzshirt',
      oversize: 'Oversize-Shirt', 'long-sleeve': 'Langarmshirt', banded: 'Kurzarmshirt mit Bündchen' },
    bottom: { original: realistic ? 'Sporthose' : 'Shorts', leggings: 'Leggings', skirt: 'A-Linien-Rock', capri: 'Caprihose' },
    dress: { none: 'Ohne Kleid', 'sport-dress': 'Sportkleid' },
    ...(platforms && { shoes: { original: 'Originalschuhe', platform: 'Plateauschuhe' } }),
    necklace: { none: 'Ohne Halskette', silver: 'Silberkette', pendant: 'Kette mit Anhänger', pearls: 'Perlenkette' },
    earrings: { none: 'Ohne Ohrringe', studs: 'Perlenstecker', hoops: 'Creolen', drops: 'Tropfenohrringe' }
  };
  function equip(settings) {
    const wearsDress = settings.dress === 'sport-dress';
    const wearsSkirt = !wearsDress && settings.bottom === 'skirt';
    lining.visible = wearsSkirt;
    if (expandedBody) {
      expandedBody.upper.visible = wearsDress || settings.top !== 'original';
      expandedBody.lower.visible = wearsDress || wearsSkirt || settings.bottom === 'capri';
    }
    for (const [slot, items] of Object.entries(groups)) {
      const selection = settings[slot] ?? WARDROBE_DEFAULTS[slot];
      const coveredByDress = wearsDress && (slot === 'top' || slot === 'bottom');
      for (const [id, objects] of Object.entries(items)) {
        for (const object of objects) object.visible = !coveredByDress && id === selection;
      }
    }
  }
  equip(WARDROBE_DEFAULTS);
  return {
    labels,
    equip,
    fit(state, outfit) {
      necklaces.fit(state, outfit?.dress === 'sport-dress' ? undefined : outfit?.top);
      earrings.fit(state);
    }
  };
}

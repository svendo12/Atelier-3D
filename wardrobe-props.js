import * as THREE from 'three';

// The example accessory designs in this module are available under CC0 1.0.
function finish(color, metalness = 0, roughness = .55) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function piece(root, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function wire(root, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return piece(root, new THREE.TubeGeometry(curve, 16, radius, 8, false), material);
}

function roundGlasses(root) {
  const frame = finish('#302b36', .57, .28);
  const hinge = finish('#be9f67', .55, .32);
  for (const side of [-1, 1]) {
    const rim = piece(root, new THREE.TorusGeometry(.0265, .0019, 10, 40), frame, side * .034);
    rim.scale.y = .88;
    piece(root, new THREE.SphereGeometry(.0026, 8, 6), hinge, side * .063);
    wire(root, [
      [side * .058, .007, 0], [side * .078, .008, -.008],
      [side * .084, .006, -.058], [side * .081, .003, -.102], [side * .077, -.013, -.123]
    ], .0022, frame);
  }
  wire(root, [[-.010, .008, 0], [0, .014, -.004], [.010, .008, 0]], .0018, frame);
}

function baseballCap(root) {
  const fabric = finish('#405879', 0, .88);
  const trim = finish('#303e58', 0, .93);
  const crown = piece(root, new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), fabric);
  crown.scale.set(.104, .086, .113);
  const band = piece(root, new THREE.CylinderGeometry(1, 1, .012, 32, 1, true), trim, 0, -.005);
  band.scale.set(.104, 1, .113);
  const bill = piece(root, new THREE.SphereGeometry(1, 28, 12), fabric, 0, -.017, .094);
  bill.scale.set(.092, .007, .076);
  bill.rotation.x = .18;
  piece(root, new THREE.SphereGeometry(.006, 12, 8), trim, 0, .086);
}

function bowRibbon(root, material, side) {
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(side * .012, .004, side * .038, .028, side * .049, .023);
  outline.bezierCurveTo(side * .058, .020, side * .058, -.019, side * .046, -.022);
  outline.bezierCurveTo(side * .029, -.024, side * .012, -.010, 0, 0);
  return piece(root, new THREE.ExtrudeGeometry(outline, {
    depth: .004, bevelSize: .0045, bevelThickness: .0045, bevelSegments: 3, steps: 1, curveSegments: 10
  }), material);
}

function hairBow(root) {
  const silk = finish('#ab3866', 0, .58);
  const fold = finish('#79223f', 0, .63);
  for (const side of [-1, 1]) {
    bowRibbon(root, silk, side).rotation.y = side * .16;
    const tail = piece(root, new THREE.BoxGeometry(.014, .031, .004), fold, side * .013, -.019, -.006);
    tail.rotation.z = side * .44;
  }
  const knot = piece(root, new THREE.SphereGeometry(1, 16, 12), silk, 0, 0, .006);
  knot.scale.set(.012, .014, .009);
}

function paintbrush(root) {
  const wood = finish('#71402d', 0, .54);
  const metal = finish('#c3ac85', .7, .3);
  const bristle = finish('#4f3832', 0, .82);
  piece(root, new THREE.CylinderGeometry(.006, .002, .164, 16), wood, 0, -.030);
  piece(root, new THREE.CylinderGeometry(.0067, .006, .028, 16), metal, 0, .059);
  const tip = piece(root, new THREE.SphereGeometry(1, 16, 12), bristle, 0, .082);
  tip.scale.set(.0065, .019, .0048);
}

const builders = {
  'round-glasses': roundGlasses, 'baseball-cap': baseballCap, 'hair-bow': hairBow, paintbrush
};

export function buildWardrobeProp(id) {
  const root = new THREE.Group();
  builders[id](root);
  return root;
}

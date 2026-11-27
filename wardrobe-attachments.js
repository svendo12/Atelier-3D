import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ACCESSORIES } from './wardrobe-catalog.js';
import { buildWardrobeProp } from './wardrobe-props.js';

const radians = THREE.MathUtils.degToRad;

export function matchingAccessories(model, anchors) {
  return ACCESSORIES.filter(asset => Object.hasOwn(asset.fits, model) && anchors?.[asset.anchor]);
}

const ignorePoseRaycast = () => {};

function mountProp(root, object) {
  object.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.raycast = ignorePoseRaycast;
  });
  root.add(object);
}

export function disposeWardrobeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const bitmaps = new Set();
  root.removeFromParent();
  root.traverse(node => {
    if (node.isInstancedMesh) node.dispose();
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) {
      for (const material of [node.material].flat()) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    const data = texture.source?.data;
    if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) bitmaps.add(data);
  }
  for (const bitmap of bitmaps) bitmap.close();
}

export function createWardrobeAttachments(onFailure, openLocal) {
  let activeAnchors;
  const attached = new Map();
  const fitRotation = new THREE.Quaternion();
  const offsetRotation = new THREE.Euler();
  const position = new THREE.Vector3();
  let loader;

  function equipMountedAsset(asset, root) {
    const entry = { root };
    attached.set(asset.id, entry);
    if (asset.format === 'generated') {
      mountProp(root, buildWardrobeProp(asset.id));
      return;
    }
    const load = asset.format === 'local' ? openLocal(asset) : loadBuiltIn(asset);
    load.then(object => {
      if (attached.get(asset.id) !== entry) {
        disposeWardrobeObject(object);
        return;
      }
      mountProp(root, object);
    }).catch(error => {
      if (attached.get(asset.id) === entry) onFailure(asset, error);
    });
  }

  async function loadBuiltIn(asset) {
    loader ??= new GLTFLoader();
    const { scene } = await loader.loadAsync(asset.path);
    scene.position.fromArray(asset.pivot).negate();
    return scene;
  }

  return {
    apply(model, anchors, assets, settings, headScale) {
      if (anchors !== activeAnchors) {
        for (const { root } of attached.values()) disposeWardrobeObject(root);
        attached.clear();
        activeAnchors = anchors;
      }
      const visible = assets.filter(asset => !asset.missing && settings[asset.id]?.visible);
      const visibleIds = new Set(visible.map(asset => asset.id));
      for (const [id, { root }] of attached) {
        if (visibleIds.has(id)) continue;
        disposeWardrobeObject(root);
        attached.delete(id);
      }

      for (const asset of visible) {
        const adjustments = settings[asset.id];
        const anchor = anchors[asset.anchor];
        let prop = attached.get(asset.id)?.root;
        if (!prop) {
          prop = new THREE.Group();
          prop.name = `Kleiderschrank ${asset.id}`;
          equipMountedAsset(asset, prop);
        }
        if (prop.parent !== anchor) anchor.add(prop);
        const fit = asset.fits[model];
        // The mannequin's face group already scales with its head proportions.
        const proportion = asset.anchor === 'head' && model !== 'mannequin' ? headScale : 1;
        const offsetUnit = asset.offsetUnit ?? (model === 'mannequin' ? .02 : .01);
        position.fromArray(fit.position).multiplyScalar(proportion);
        prop.position.fromArray(adjustments.position).multiplyScalar(offsetUnit).add(position);
        fitRotation.setFromEuler(offsetRotation.set(...fit.rotation.map(radians)));
        prop.quaternion.setFromEuler(offsetRotation.set(...adjustments.rotation.map(radians))).premultiply(fitRotation);
        prop.scale.setScalar(fit.scale * proportion * adjustments.scale / 100);
      }
    }
  };
}

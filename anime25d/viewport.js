import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, OrthographicCamera, Scene, Color } from 'three';
import { createDemoFigure } from './demo-figure.js';
import { createAssetRetargeter, createRigProjection } from './rig-map.js';
import { loadCharacterAsset } from './character-asset.js';

const openBoneURL = 'https://esm.sh/@openbone/three@0.4.13?bundle&external=three';
const minFrameWidth = 310;

export async function createAnimeViewport({ bones, hips, modelId, model }) {
  const { OpenBoneObject3D, prepareTexture } = await import(openBoneURL);
  const { asset, order, depth, rig, credits } = model?.manifest
    ? await loadCharacterAsset(model.manifest, prepareTexture)
    : createDemoFigure(prepareTexture);
  let figure;
  try {
    figure = await OpenBoneObject3D.from(asset, { scripts: 'none', audio: false, depthTest: false });
  } catch (error) {
    for (const texture of asset.textures.values()) texture.dispose();
    throw error;
  }

  const scene = new Scene();
  scene.background = new Color('#1a1f2c');
  scene.add(figure);
  const camera = new OrthographicCamera(-330, 330, 305, -305, .1, 100);
  camera.position.z = 20;
  const projection = createRigProjection(bones, hips, model?.articulatedFeet);
  const retarget = rig && createAssetRetargeter(rig, model?.headMinScale);
  const clothingSlots = figure.skeleton.drawOrder.filter(slot => Object.hasOwn(model?.clothing ?? {}, slot.data.id));

  const guideGeometry = new BufferGeometry();
  // One spine chain and four limb chains.
  const guidePoints = new Float32BufferAttribute(new Float32Array(18 * 6), 3);
  guideGeometry.setAttribute('position', guidePoints);
  const guideMaterial = new LineBasicMaterial({ color: '#a9eff5', opacity: .86, transparent: true, depthTest: false });
  const guide = new LineSegments(guideGeometry, guideMaterial);
  guide.frustumCulled = false;
  guide.renderOrder = 100;
  scene.add(guide);

  let aspect = 1;
  let frameWidth = minFrameWidth;
  let frameCenterX = 0;
  let frameBottom = asset.doc.originY - asset.doc.height;
  let frameTop = asset.doc.originY;

  function resize(width, height) {
    if (width && height) aspect = width / height;
    const halfHeight = Math.max((frameTop - frameBottom) / 2, frameWidth / (aspect * 2));
    camera.position.x = frameCenterX;
    camera.position.y = (frameBottom + frameTop) / 2;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }

  return {
    modelId,
    label: model?.viewportLabel ?? model?.label ?? asset.doc.name,
    credits,
    resize,
    update(showRig, clothing) {
      const source = projection();
      const { frames, order: dynamic, chains, warning } = retarget ? retarget(source) : source;
      // The source 3D hierarchy has already solved the pose. Supply its projected
      // world frames while OpenBone evaluates the attachment weights.
      for (const bone of figure.skeleton.bones) bone.world = frames.get(bone.data.id);
      for (const slot of clothingSlots) {
        slot.attachmentName = clothing?.[slot.data.id] === false ? null : slot.data.attachment;
      }
      const rank = id => retarget ? (depth[id] ? dynamic[depth[id]] + order[id] / 10000 : order[id])
        : dynamic[id] ?? order[id];
      figure.skeleton.drawOrder.sort((a, b) => rank(a.data.id) - rank(b.data.id));
      figure.redraw();

      frameWidth = minFrameWidth;
      frameBottom = asset.doc.originY - asset.doc.height;
      frameTop = retarget ? asset.doc.originY : Math.max(asset.doc.originY, frames.get('head').y + 147);
      guide.visible = showRig;
      let i = 0;
      for (const chain of chains) {
        if (!retarget) for (const point of chain) {
          frameWidth = Math.max(frameWidth, 2 * (Math.abs(point.x) + 58));
          frameBottom = Math.min(frameBottom, point.y - 30);
          frameTop = Math.max(frameTop, point.y + 38);
        }
        for (let n = 1; n < chain.length; n++) {
          for (const point of [chain[n - 1], chain[n]]) guidePoints.setXYZ(i++, point.x, point.y, 1);
        }
      }
      if (retarget) {
        let left = -asset.doc.originX, right = asset.doc.width - asset.doc.originX;
        for (const { geometry } of figure.children) {
          const position = geometry.getAttribute('position');
          for (let j = 0; j < geometry.drawRange.count; j++) {
            const index = geometry.index.getX(j);
            const x = position.getX(index), y = position.getY(index);
            left = Math.min(left, x - 16);
            right = Math.max(right, x + 16);
            frameBottom = Math.min(frameBottom, y - 16);
            frameTop = Math.max(frameTop, y + 16);
          }
        }
        frameWidth = right - left;
        frameCenterX = (left + right) / 2;
      }
      guideGeometry.setDrawRange(0, i);
      guidePoints.needsUpdate = true;
      resize();
      return warning;
    },
    render(renderer) { renderer.render(scene, camera); },
    dispose() {
      figure.dispose();
      for (const texture of asset.textures.values()) texture.dispose();
      guideGeometry.dispose();
      guideMaterial.dispose();
      scene.clear();
    }
  };
}

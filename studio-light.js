import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export const LIGHT_DEFAULTS = {
  lightEnabled: false, lightColor: '#ffffff', lightIntensity: 100, lightFill: 25,
  lightX: -1.5, lightY: 3.2, lightZ: 1.4
};
export const LIGHT_FIELDS = [
  { key: 'lightIntensity', label: 'Intensität', min: 0, max: 250, step: 1, unit: ' %' },
  { key: 'lightFill', label: 'Grundlicht', min: 0, max: 100, step: 1, unit: ' %' },
  { key: 'lightX', label: 'Links / rechts (X)', min: -7, max: 7, step: 0.1, unit: '' },
  { key: 'lightY', label: 'Höhe (Y)', min: 0.2, max: 7, step: 0.1, unit: '' },
  { key: 'lightZ', label: 'Vorne / hinten (Z)', min: -7, max: 7, step: 0.1, unit: '' }
];

export function createStudioLight({ scene, camera, canvas, orbit, ambient, key, rim, moveLight }) {
  const lamp = new THREE.SpotLight(0xffffff, 0, 22, Math.PI / 3, 0.45, 2);
  lamp.name = 'Atelier-Scheinwerfer';
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 0.08;
  lamp.shadow.camera.far = lamp.distance;
  lamp.shadow.bias = -0.00028;
  lamp.shadow.normalBias = 0.018;
  scene.add(lamp, lamp.target);

  const transform = new TransformControls(camera, canvas);
  transform.setSize(0.72);
  transform.setTranslationSnap(0.1);
  for (const axis of ['X', 'Y', 'Z']) {
    const field = LIGHT_FIELDS.find(item => item.key === 'light' + axis);
    transform['min' + axis] = field.min;
    transform['max' + axis] = field.max;
  }
  const helper = transform.getHelper();
  helper.name = 'Lichtgriff';
  scene.add(helper);
  transform.attach(lamp);
  transform.enabled = false;
  helper.visible = false;
  transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value; });
  transform.addEventListener('objectChange', () => moveLight(lamp.position));
  canvas.addEventListener('pointercancel', () => {
    if (transform.dragging) transform.pointerUp(null);
  });

  let subject;
  const originalShadows = new Map();

  function setShadowSubject(root) {
    if (subject === root) return;
    for (const [mesh, receive] of originalShadows) mesh.receiveShadow = receive;
    originalShadows.clear();
    subject = root;
    root?.traverse(mesh => {
      if (!mesh.isMesh || mesh.receiveShadow) return;
      originalShadows.set(mesh, mesh.receiveShadow);
      mesh.receiveShadow = true;
    });
  }

  return {
    apply(settings, model, toon) {
      lamp.visible = settings.lightEnabled;
      lamp.color.set(settings.lightColor);
      lamp.intensity = 45 * settings.lightIntensity / 100;
      lamp.position.set(settings.lightX, settings.lightY, settings.lightZ);
      lamp.target.position.set(0, (1.58 + (settings.legs - 1) * 0.65) * settings.height, 0);
      if (lamp.position.distanceToSquared(lamp.target.position) < 0.0001) lamp.target.position.y -= 0.2;

      const fill = settings.lightEnabled ? settings.lightFill / 100 : 1;
      ambient.intensity = (toon ? 1.05 : 2.1) * fill;
      key.intensity = (toon ? 1.3 : 2.6) * fill;
      rim.intensity = (toon ? 0.7 : 1.4) * fill;
      key.castShadow = !settings.lightEnabled;
      setShadowSubject(settings.lightEnabled ? model : undefined);
    },
    showHandle(show) {
      if (!show && transform.dragging) transform.pointerUp(null);
      helper.visible = transform.enabled = show;
    },
    withoutHandle(draw) {
      const wasVisible = helper.visible;
      helper.visible = false;
      try {
        draw();
      } finally {
        helper.visible = wasVisible;
      }
    }
  };
}

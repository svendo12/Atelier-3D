import { Color, DataTexture, LinearFilter, MathUtils, RGBAFormat } from 'three';
import { APPEARANCE_FIELDS } from './appearance-settings.js';

const { smoothstep } = MathUtils;
const maskTextures = new Map();

function oval(x, y, u, v, rx, ry, inner = .45) {
  const distance = Math.hypot((x - u) / rx, (y - v) / ry);
  return 1 - smoothstep(distance, inner, 1);
}

function both(x, y, u, v, rx, ry, inner) {
  return Math.max(oval(x, y, u, v, rx, ry, inner), oval(x, y, 1 - u, v, rx, ry, inner));
}

function getMask(profile) {
  if (maskTextures.has(profile)) return maskTextures.get(profile);
  const size = profile === 'soft-edge' ? 128 : profile ? 512 : 1;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    const v = (j + .5) / size;
    for (let i = 0; i < size; i++) {
      const u = (i + .5) / size;
      const offset = (j * size + i) * 4;
      if (profile === 'suit-male' || profile === 'suit-female') {
        // The trousers occupy the lower left and middle. Sleeves sit on the right.
        const edge = 1 - smoothstep(v, .425, .442);
        const sleeve = smoothstep(u, profile === 'suit-male' ? .724 : .740, .766);
        data[offset] = 255 * Math.max(edge, sleeve);
        data[offset + 1] = 255 - data[offset];
      } else if (profile === 'real-iris') {
        const iris = (x, y) => oval(u, v, x, y, .115, .115, .86) * smoothstep(Math.hypot(u-x, v-y), .035, .061);
        data[offset] = 255 * Math.max(iris(.706, .295), iris(.292, .708));
      } else if (profile === 'real-face') {
        data[offset] = 255 * oval(u, v, .909, .521, .021, .033, .59);
        data[offset + 1] = 255 * Math.max(oval(u, v, .867, .435, .030, .041), oval(u, v, .868, .594, .030, .041));
        data[offset + 2] = 255 * Math.max(oval(u, v, .830, .447, .017, .034), oval(u, v, .830, .575, .017, .034));
      } else if (profile === 'anime-face' || profile === 'anime-face-male') {
        const male = profile === 'anime-face-male';
        data[offset] = 255 * oval(u, v, .5, male ? .759 : .754, male ? .081 : .068, male ? .027 : .020, .44);
        data[offset + 1] = 255 * both(u, v, .349, .642, .084, .062);
        data[offset + 2] = 255 * both(u, v, male ? .337 : .343, male ? .498 : .509, .073, .035);
      } else if (profile === 'soft-edge') {
        data.fill(255, offset, offset + 3);
        data[offset + 3] = 255 * oval(u, v, .5, .5, .5, .5, .18);
      } else {
        data[offset] = 255;
      }
      if (profile !== 'soft-edge') data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  maskTextures.set(profile, texture);
  return texture;
}

const shaderCode = /* glsl */ `
uniform sampler2D atelierArea;
uniform int atelierAreaMode;
uniform vec4 atelierPrimary;
uniform vec4 atelierSecondary;
uniform vec4 atelierLipstick;
uniform vec4 atelierBlush;
uniform vec4 atelierEyeshadow;
uniform vec2 atelierPivots;

vec3 atelierDye(vec3 source, vec4 pigment, float mask, float pivot, float shade) {
  float luminance = sqrt(max(dot(source, vec3(0.2126, 0.7152, 0.0722)), 0.0));
  float signal = clamp((luminance - pivot) * 1.5, -0.8, 0.85);
  vec3 dyed = pigment.rgb * (1.0 + min(signal, 0.0));
  dyed = mix(dyed, vec3(1.0), max(signal, 0.0) * 0.57) * shade;
  return mix(source, dyed, pigment.a * mask);
}

vec3 atelierMakeup(vec3 source, vec4 pigment, float mask, float shade) {
  float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadedPigment = pigment.rgb * shade * (0.66 + 0.34 * sqrt(max(0.0, luminance)));
  return mix(source, shadedPigment, pigment.a * mask);
}

vec3 atelierAppearance(vec3 source, vec2 uv, float shade) {
  if (atelierPrimary.a + atelierSecondary.a + atelierLipstick.a + atelierBlush.a + atelierEyeshadow.a <= 0.0) return source;
  vec3 mask = texture2D(atelierArea, uv).rgb;
  if (atelierAreaMode == 1) {
    source = atelierDye(source, atelierPrimary, mask.r, atelierPivots.x, shade);
    return atelierDye(source, atelierSecondary, mask.g, atelierPivots.y, shade);
  }
  float coverage = 1.0;
  if (atelierAreaMode == 2) {
    float lightness = sqrt(max(dot(source, vec3(0.2126, 0.7152, 0.0722)), 0.0));
    coverage = mask.r * smoothstep(0.02, 0.15, lightness) * (1.0 - smoothstep(0.76, 0.98, lightness));
  }
  source = atelierDye(source, atelierPrimary, coverage, atelierPivots.x, shade);
  if (atelierAreaMode == 3) {
    source = atelierMakeup(source, atelierBlush, mask.g, shade);
    source = atelierMakeup(source, atelierEyeshadow, mask.b, shade);
    source = atelierMakeup(source, atelierLipstick, mask.r, shade);
  }
  return source;
}
`;

function pigmentUniform() {
  return { value: { x: 0, y: 0, z: 0, w: 0 } };
}

function patchMaterial(material, surface) {
  const uniforms = {
    atelierArea: { value: getMask(surface.mask) },
    atelierAreaMode: { value: surface.mode ?? 0 },
    atelierPrimary: pigmentUniform(),
    atelierSecondary: pigmentUniform(),
    atelierLipstick: pigmentUniform(),
    atelierBlush: pigmentUniform(),
    atelierEyeshadow: pigmentUniform(),
    atelierPivots: { value: { x: surface.pivot ?? .57, y: surface.secondPivot ?? .32 } }
  };
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previousHook.call(this, shader, renderer);
    shader.uniforms = { ...shader.uniforms, ...uniforms };
    let fragment = shader.fragmentShader;
    if (material.isMToonMaterial) {
      fragment = fragment.replace('material.diffuseColor = diffuseColor.rgb;', `
        #ifdef USE_MAP
          material.diffuseColor = atelierAppearance(diffuseColor.rgb, mapUv, 1.0);
        #else
          material.diffuseColor = atelierAppearance(diffuseColor.rgb, uv, 1.0);
        #endif`);
      fragment = fragment.replace('material.shadingShift = shadingShiftFactor;', `
        #ifdef USE_SHADEMULTIPLYTEXTURE
          material.shadeColor = atelierAppearance(material.shadeColor, shadeMultiplyTextureUv, 0.66);
        #else
          material.shadeColor = atelierAppearance(material.shadeColor, uv, 0.66);
        #endif
        material.shadingShift = shadingShiftFactor;`);
      // Hair highlights in VRoid may use a separate colored emissive map.
      fragment = fragment.replace('col += totalEmissiveRadiance;', `
        float atelierHighlight = dot(totalEmissiveRadiance, vec3(0.2126, 0.7152, 0.0722));
        float atelierPigmentLight = dot(atelierPrimary.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 atelierHighlightColor = mix(vec3(1.0), atelierPrimary.rgb / max(0.32, atelierPigmentLight), 0.75);
        col += mix(totalEmissiveRadiance, atelierHighlight * atelierHighlightColor, atelierPrimary.a);`);
    } else {
      fragment = fragment.replace('#include <map_fragment>', `
        #include <map_fragment>
        #ifdef USE_MAP
          diffuseColor.rgb = atelierAppearance(diffuseColor.rgb, vMapUv, 1.0);
        #else
          diffuseColor.rgb = atelierAppearance(diffuseColor.rgb, vec2(0.0), 1.0);
        #endif`);
    }
    shader.fragmentShader = fragment.replace('void main()', shaderCode + '\nvoid main()');
  };
  material.customProgramCacheKey = () => previousKey.call(material) + '|atelier-palette-v1';
  material.needsUpdate = true;

  const color = new Color();
  const layers = [
    [surface.key, uniforms.atelierPrimary],
    [surface.secondary, uniforms.atelierSecondary]
  ];
  if (surface.mode === 3) {
    layers.push(['lipstick', uniforms.atelierLipstick], ['blush', uniforms.atelierBlush], ['eyeshadow', uniforms.atelierEyeshadow]);
  }
  return settings => {
    if (material.isShaderMaterial) material.uniformsNeedUpdate = true;
    for (const [key, uniform] of layers) {
      const entry = key && settings?.[key];
      const value = uniform.value;
      value.w = entry ? entry.amount / 100 : 0;
      if (entry) {
        color.set(entry.color);
        value.x = color.r;
        value.y = color.g;
        value.z = color.b;
      }
    }
  };
}

const builtInHairMeshes = new Map([
  ['short02', 'short02'],
  ['ponytail01', 'ponytail01'],
  ['hairback_00_hair', 'body'],
  ['hair_00_hair', 'hair'],
  ['f00_000_hair_00_hair', 'hair001.baked']
]);

function materialTag(name) {
  return name.replace(/ \(Outline\)$/i, '');
}

function separateHairMaterials(vrm, parser, calibrated) {
  const hairSlots = [];
  const otherMaterials = new Set();
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const association = parser.associations.get(mesh);
    const sourceName = (parser.json.meshes?.[association?.meshes]?.name ?? mesh.name).toLowerCase();
    const materialArray = Array.isArray(mesh.material);
    const materials = materialArray ? mesh.material : [mesh.material];
    materials.forEach((material, index) => {
      if (!material) return;
      const tag = materialTag(material.name).toLowerCase();
      const dedicatedHairMesh = /^hair(?=[._ -]|\d|$)/.test(sourceName);
      const hairMaterial = /_hair$|^hair(?:[._ -].*)?$/.test(tag);
      if (builtInHairMeshes.get(tag) === sourceName || (!calibrated && dedicatedHairMesh && hairMaterial)) {
        hairSlots.push({ mesh, materialArray, material, index });
      } else {
        otherMaterials.add(material);
      }
    });
  });

  const copies = new Map();
  const isolated = new Set();
  for (const { mesh, materialArray, material, index } of hairSlots) {
    if (otherMaterials.has(material) && !copies.has(material)) {
      const clone = material.clone();
      copies.set(material, clone);
      if (clone.isMToonMaterial) vrm.materials?.push(clone);
    }
    const hair = copies.get(material) ?? material;
    if (hair !== material) {
      if (materialArray) {
        const materials = [...mesh.material];
        materials[index] = hair;
        mesh.material = materials;
      } else {
        mesh.material = hair;
      }
    }
    isolated.add(hair);
  }
  return isolated;
}

function classifyMaterial(name, calibrated, maleAnime) {
  const tag = materialTag(name);
  if (/^male_casualsuit04$|^female_sportsuit01$/i.test(tag)) {
    if (!calibrated) return { key: 'top', label: 'Outfit' };
    return { key: 'top', secondary: 'bottoms', mode: 1,
      mask: tag.startsWith('male') ? 'suit-male' : 'suit-female', pivot: .42, secondPivot: .34 };
  }
  if (/^atelier_cropped_top$/i.test(tag)) return { key: 'shortTop', pivot: .36 };
  if (/tops_\d+_cloth/i.test(tag)) return { key: 'top', pivot: .70 };
  if (/bottoms?_\d+_cloth/i.test(tag)) return { key: 'bottoms', pivot: .29 };
  if (/shoes_\d+_cloth|^shoes02$|^shoes$/i.test(tag)) return { key: 'shoes', pivot: .30 };

  if (/^body$/i.test(tag)) return calibrated
    ? { key: 'skin', mask: 'real-face', mode: 3, pivot: .67 }
    : { key: 'skin', pivot: .67 };
  if (/face_\d+_skin/i.test(tag)) return calibrated
    ? { key: 'skin', mask: maleAnime ? 'anime-face-male' : 'anime-face', mode: 3, pivot: .83 }
    : { key: 'skin', pivot: .83 };
  if (/_skin$|^skin(?:[._ -](?:face|body))?$/i.test(tag)) return { key: 'skin', pivot: .76 };
  if (/^eyes$/i.test(tag)) return calibrated ? { key: 'iris', mask: 'real-iris', mode: 2, pivot: .27 } : undefined;
  if (/eyeiris|^irises?$|(^|[_ .-])iris([_. -]|$)/i.test(tag)) return { key: 'iris', mode: 2, pivot: .32 };
  if (/eyebrow|facebrow/i.test(tag)) return { key: 'brows', pivot: .23 };
  if (/eyelash|eyeliner|faceeyeline/i.test(tag)) return { key: 'eyeliner', pivot: .19 };
  if (/(?:^|_)cloth(?:ing)?$/.test(tag.toLowerCase())) {
    const id = tag.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 90);
    return { key: 'clothing:' + id, label: tag, pivot: .55 };
  }
}

export function createVrmAppearance(vrm, parser, calibrated, wardrobeColors = calibrated) {
  const hair = separateHairMaterials(vrm, parser, calibrated);
  const fields = new Map();
  const targets = new Map();
  const maleAnime = vrm.meta?.name === 'HairSample_Male';
  vrm.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material || targets.has(material) || !(material.isMToonMaterial || material.isMeshStandardMaterial ||
        material.isMeshBasicMaterial || material.isMeshPhongMaterial)) continue;
      const wardrobeColor = wardrobeColors ? material.userData.wardrobeColor : undefined;
      const surface = hair.has(material)
        ? { key: 'hair', pivot: .34 }
        : wardrobeColor ?? classifyMaterial(material.name || mesh.name, calibrated, maleAnime);
      if (!surface) continue;
      const field = APPEARANCE_FIELDS[surface.key] ?? { color: surface.color ?? '#67687b', group: 'clothes' };
      fields.set(surface.key, { ...field, label: surface.label ?? field.label });
      if (surface.secondary) fields.set(surface.secondary, APPEARANCE_FIELDS[surface.secondary]);
      if (surface.mode === 3) {
        for (const key of ['lipstick', 'blush', 'eyeshadow']) fields.set(key, APPEARANCE_FIELDS[key]);
      }
      targets.set(material, patchMaterial(material, surface));
    }
  });
  const order = [...new Set([...Object.keys(APPEARANCE_FIELDS), ...fields.keys()])];
  const ordered = new Map(order.filter(key => fields.has(key)).map(key => [key, fields.get(key)]));
  return {
    fields: ordered,
    apply(settings) { for (const update of targets.values()) update(settings); }
  };
}

export function softMakeupTexture() {
  return getMask('soft-edge');
}

import { Box3, Group, LoadingManager, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describeAssetSource } from './wardrobe-catalog.js';
import { disposeWardrobeObject } from './wardrobe-attachments.js';

const modelExtension = /\.gl(?:b|tf)$/i;
const bufferData = /^data:(?:application\/(?:octet-stream|gltf-buffer))?;base64,/i;
const imageData = /^data:image\/(?:png|jpeg|webp|avif|gif|bmp);base64,/i;
const imageMime = /^image\/(?:png|jpeg|webp|avif|gif|bmp)$/i;
const codecs = /^(?:KHR_draco_mesh_compression|EXT_meshopt_compression|KHR_texture_basisu)$/;
const identity = source => JSON.stringify(source);

async function readDocument(file) {
  if (/\.gltf$/i.test(file.name)) {
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new Error('Die glTF-Datei enthält kein lesbares JSON.');
    }
    return { data: json, json };
  }

  const data = await file.arrayBuffer();
  if (data.byteLength < 20) throw new Error('Die GLB-Datei ist zu kurz oder beschädigt.');
  const header = new DataView(data);
  const jsonLength = header.getUint32(12, true);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== data.byteLength || header.getUint32(16, true) !== 0x4e4f534a ||
      !jsonLength || jsonLength % 4 !== 0 || jsonLength > data.byteLength - 20) {
    throw new Error('Die Datei ist kein gültiges GLB-Modell im glTF-2.0-Format.');
  }
  for (let offset = 20 + jsonLength; offset < data.byteLength;) {
    if (offset + 8 > data.byteLength) throw new Error('Die GLB-Datei enthält einen unvollständigen Datenblock.');
    const length = header.getUint32(offset, true);
    if (length % 4 !== 0 || offset + 8 + length > data.byteLength) {
      throw new Error('Die GLB-Datei enthält einen unvollständigen Datenblock.');
    }
    offset += 8 + length;
  }
  try {
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)));
    return { data, json };
  } catch {
    throw new Error('Die GLB-Datei enthält ungültige Modelldaten.');
  }
}

function relativePath(uri) {
  let path;
  try {
    path = typeof uri === 'string' ? decodeURIComponent(uri) : '';
  } catch {
    path = '';
  }
  if (!path || path.startsWith('/') || /[:\\?#\x00-\x1f]/.test(path) || path.split('/').includes('..')) {
    throw new Error('Die Datei verweist auf eine nicht unterstützte Ressource. Verwende eingebettete Daten oder lokal ausgewählte Begleitdateien mit relativen Pfaden.');
  }
  return path.split('/').filter(part => part && part !== '.').join('/');
}

function resolveResources(json, files) {
  const selected = new Map(files.map(file => [file.name.toLowerCase(), file]));
  const references = new Map();
  const mappedPaths = new Map();
  const missing = new Set();
  const used = new Set();

  for (const [items, embedded, isImage] of [[json.buffers, bufferData, false], [json.images, imageData, true]]) {
    if (items === undefined) continue;
    if (!Array.isArray(items)) throw new Error('Die Datei enthält ungültige Datenpuffer oder Texturen.');
    for (const item of items) {
      if (!item || (isImage && item.mimeType && !imageMime.test(item.mimeType))) {
        throw new Error('Dieses Texturformat wird beim lokalen Import nicht unterstützt.');
      }
      const uri = item.uri;
      if (uri === undefined || (typeof uri === 'string' && embedded.test(uri))) continue;
      const path = relativePath(uri);
      const basename = path.split('/').at(-1);
      if (!basename) throw new Error('Ein Verweis auf eine Begleitdatei enthält keinen Dateinamen.');
      const key = basename.toLowerCase();
      if (mappedPaths.has(key) && mappedPaths.get(key) !== path.toLowerCase()) {
        throw new Error(`Mehrere Begleitdateien heißen „${basename}“. Benenne sie beim Export eindeutig.`);
      }
      mappedPaths.set(key, path.toLowerCase());
      const file = selected.get(key);
      if (file) {
        references.set(uri, file);
        used.add(file);
      } else {
        missing.add(path);
      }
    }
  }

  if (missing.size) {
    const error = new Error(`Bitte wähle die fehlenden Begleitdateien aus: ${[...missing].join(', ')}.`);
    error.needsCompanions = true;
    throw error;
  }
  return { references, used: [...used] };
}

function createAssetLoadingManager(references) {
  const manager = new LoadingManager();
  const urls = new Set();
  const urlsByFile = new Map();
  let failed;
  let closed = false;
  manager.onError = url => { failed = url; };
  manager.setURLModifier(url => {
    if (closed) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      throw new Error('Der lokale Import wurde beendet.');
    }
    const file = references.get(url);
    if (file) {
      if (!urlsByFile.has(file)) {
        const localURL = URL.createObjectURL(file);
        urlsByFile.set(file, localURL);
        urls.add(localURL);
      }
      return urlsByFile.get(file);
    }
    if (url.startsWith('blob:')) {
      // GLTFLoader creates these URLs for images stored inside a buffer view.
      urls.add(url);
      return url;
    }
    if (bufferData.test(url) || imageData.test(url)) return url;
    throw new Error('Daten außerhalb der lokal ausgewählten Dateien werden nicht geladen.');
  });
  return {
    manager,
    get failed() { return Boolean(failed); },
    release() {
      closed = true;
      for (const url of urls) URL.revokeObjectURL(url);
    }
  };
}

function removeSceneLights(root) {
  const lights = [];
  root.traverse(node => { if (node.isLight) lights.push(node); });
  for (const light of lights) {
    const transform = new Group().copy(light, false);
    for (const child of [...light.children]) transform.add(child);
    light.parent.add(transform);
    light.removeFromParent();
  }
}

export async function loadLocalWardrobeAsset(files, expected, { skinned = false } = {}) {
  const models = files.filter(file => modelExtension.test(file.name));
  if (models.length !== 1) throw new Error('Wähle genau eine .glb- oder .gltf-Datei und bei Bedarf ihre Begleitdateien.');
  const [model] = models;
  if (expected && (model.name !== expected.name || model.size !== expected.size)) {
    throw new Error(`Wähle erneut „${expected.name}“, um die gespeicherten Einstellungen zu verwenden.`);
  }
  const { data, json } = await readDocument(model);
  if (json?.asset?.version !== '2.0' || !Array.isArray(json.meshes) || !json.meshes.length) {
    throw new Error('Diese Datei enthält kein 3D-Objekt im glTF-2.0-Format.');
  }
  if (json.extensions?.VRM || json.extensions?.VRMC_vrm) {
    throw new Error('Vollständige VRM-Figuren gehören in den Bereich Figur.');
  }
  if (!skinned && json.skins?.length) {
    throw new Error('Dieses Modell hat ein Skelett. Wähle ein starres Accessoire als GLB oder glTF.');
  }
  if (skinned && (!Array.isArray(json.skins) || json.skins.length !== 1 || json.skins[0]?.inverseBindMatrices === undefined)) {
    throw new Error('Kleidung braucht genau ein gewichtetes SiroinoSotai-Skelett mit gespeicherter Bindepose.');
  }
  if (skinned && json.meshes.some(mesh => mesh?.primitives?.some(primitive =>
    primitive.attributes?.JOINTS_1 !== undefined || primitive.attributes?.WEIGHTS_1 !== undefined))) {
    throw new Error('Verwende beim Export maximal vier Gelenkgewichte pro Vertex.');
  }
  if (Array.isArray(json.extensionsRequired) && json.extensionsRequired.some(name => codecs.test(name))) {
    throw new Error('Exportiere die Datei ohne Draco-, Meshopt- oder KTX2-Komprimierung.');
  }

  const { references, used } = resolveResources(json, files.filter(file => file !== model));
  const source = describeAssetSource(model, used);
  if (expected && identity(source) !== identity(expected)) {
    throw new Error('Die gewählten Begleitdateien passen nicht zur gespeicherten Auswahl.');
  }
  const local = createAssetLoadingManager(references);
  let object;
  try {
    const gltf = await new GLTFLoader(local.manager).parseAsync(data, '');
    object = gltf.scene;
    if (local.failed) throw new Error('Eine Begleitdatei oder Textur konnte nicht gelesen werden.');
    if (skinned) return { object, source, files: [model, ...used] };
    removeSceneLights(object);
    const bounds = new Box3().setFromObject(object, true);
    const size = bounds.getSize(new Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    const center = bounds.getCenter(new Vector3());
    const scale = .20 / extent;
    if (bounds.isEmpty() || !Number.isFinite(scale) || scale <= 0 || !center.toArray().every(Number.isFinite)) {
      throw new Error('Das Modell hat keine darstellbare Geometrie mit gültigen Abmessungen.');
    }
    const centered = new Group();
    centered.position.copy(center).negate();
    centered.add(object);
    const normalized = new Group();
    normalized.scale.setScalar(scale);
    normalized.add(centered);
    return { object: normalized, source, files: [model, ...used] };
  } catch (error) {
    if (object) {
      disposeWardrobeObject(object);
      throw error;
    }
    throw new Error('Die Geometrie oder eine Textur konnte nicht geladen werden. Prüfe das Modell und den glTF-Export.');
  } finally {
    local.release();
  }
}

export function createLocalAssetSources() {
  const sessions = new Map();
  const has = (id, source) => sessions.get(id)?.identity === identity(source);

  function remove(id) {
    const session = sessions.get(id);
    if (session?.prepared) disposeWardrobeObject(session.prepared);
    sessions.delete(id);
  }

  return {
    has,
    remove,
    remember(id, result, visible) {
      remove(id);
      if (!visible) disposeWardrobeObject(result.object);
      sessions.set(id, { identity: identity(result.source), files: result.files, prepared: visible ? result.object : null });
    },
    async open({ id, source }) {
      const session = sessions.get(id);
      if (!has(id, source)) throw new Error('Die lokale Datei muss erneut ausgewählt werden.');
      if (session.prepared) {
        const object = session.prepared;
        session.prepared = null;
        return object;
      }
      return (await loadLocalWardrobeAsset(session.files, source)).object;
    },
    reconcile(accessories) {
      const kept = new Map();
      for (const equipped of Object.values(accessories)) {
        for (const [id, item] of Object.entries(equipped)) {
          if (item.source) kept.set(id, item.source);
        }
      }
      for (const id of sessions.keys()) {
        if (!has(id, kept.get(id))) remove(id);
      }
    }
  };
}

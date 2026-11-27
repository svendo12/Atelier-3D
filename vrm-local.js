import { LoadingManager } from 'three';

const vrm1Versions = new Set(['1.0', '1.0-beta']);
const embeddedBuffer = /^data:(?:application\/(?:octet-stream|gltf-buffer));base64,/i;
const embeddedImage = /^data:image\/(?:png|jpeg|webp|avif|ktx2|gif|bmp);base64,/i;

export function checkLocalVrm(buffer) {
  if (buffer.byteLength < 20) throw new Error('Die Datei ist zu kurz für ein VRM-Modell.');
  const header = new DataView(buffer);
  const jsonLength = header.getUint32(12, true);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== buffer.byteLength ||
      header.getUint32(16, true) !== 0x4e4f534a || jsonLength > buffer.byteLength - 20) {
    throw new Error('Die Datei ist kein gültiger binärer VRM-Container.');
  }
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  } catch {
    throw new Error('Die VRM-Datei enthält ungültige Modelldaten.');
  }
  const extensions = json?.extensions;
  if (!vrm1Versions.has(extensions?.VRMC_vrm?.specVersion) && !extensions?.VRM) {
    throw new Error('In dieser Datei fehlt ein VRM-Skelett für VRM 0.x oder VRM 1.0.');
  }
  for (const [items, allowed] of [[json.buffers, embeddedBuffer], [json.images, embeddedImage]]) {
    if (items === undefined) continue;
    if (!Array.isArray(items) || items.some(item => !item ||
        (item.uri !== undefined && (typeof item.uri !== 'string' || !allowed.test(item.uri))) ||
        item.mimeType === 'image/svg+xml')) {
      throw new Error('Die VRM-Datei muss alle Puffer und Texturen eingebettet enthalten.');
    }
  }
}

export function createLocalLoadingManager() {
  const manager = new LoadingManager();
  const urls = new Set();
  let closed = false;
  manager.setURLModifier(url => {
    if (url.startsWith('blob:')) {
      if (closed) {
        URL.revokeObjectURL(url);
        throw new Error('Der lokale Import wurde beendet.');
      }
      urls.add(url);
    } else if (!embeddedBuffer.test(url) && !embeddedImage.test(url)) {
      throw new Error('Externe Modellressourcen können beim lokalen Import nicht geladen werden.');
    }
    return url;
  });
  return {
    manager,
    release() {
      closed = true;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}

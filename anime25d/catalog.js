export const DEFAULT_ANIME_MODEL = 'studio-demo';

export const animeModels = {
  [DEFAULT_ANIME_MODEL]: { label: 'Atelier-Demonstrationsfigur', viewportLabel: 'Demonstrationsfigur' },
  aka: { label: 'Aka', manifest: new URL('./models/aka/manifest.json', import.meta.url) },
  midori: { label: 'Midori', manifest: new URL('./models/midori/manifest.json', import.meta.url) },
  'atelier-anime-01': {
    label: 'Atelier Anime 01 – Basisfigur',
    manifest: new URL('./models/atelier-anime-01/manifest.json', import.meta.url),
    hairPreview: new URL('./models/atelier-anime-01/hair-v05/manifest.json', import.meta.url),
    articulatedFeet: true,
    headMinScale: .80,
    clothing: { 'minimal-bandeau': 'Bandeau', 'minimal-briefs': 'Slip' }
  },
  // Add a ready-to-use model with { label, manifest: new URL('./…/manifest.json', import.meta.url) }.
};

export function readAnimeModel(id) {
  return typeof id === 'string' && Object.hasOwn(animeModels, id) ? id : DEFAULT_ANIME_MODEL;
}

export function readAnimeClothing(input) {
  const settings = {};
  for (const [id, { clothing }] of Object.entries(animeModels)) {
    const hidden = Object.keys(clothing ?? {}).filter(layer => input?.[id]?.[layer] === false);
    if (hidden.length) settings[id] = Object.fromEntries(hidden.map(layer => [layer, false]));
  }
  return settings;
}

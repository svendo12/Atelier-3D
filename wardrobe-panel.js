import { ACCESSORY_ANCHORS, ACCESSORY_GROUPS, ACCESSORY_TRANSFORM_FIELDS, LOCAL_ACCESSORY_SCALE, defaultAccessory } from './wardrobe-catalog.js';
import { createWardrobeFilePicker } from './wardrobe-file-picker.js';

const clothingGroups = [
  { title: 'Oberteile', slot: 'top' },
  { title: 'Hosen und Röcke', slot: 'bottom' },
  { title: 'Kleider', slot: 'dress' },
  { title: 'Schuhe', slot: 'shoes' }
];
const jewelryGroups = [
  { title: 'Halsketten', slot: 'necklace' },
  { title: 'Ohrringe', slot: 'earrings' }
];

function addTiles(container, title, choices, onChoose) {
  const heading = document.createElement('h2');
  heading.className = 'wardrobe-heading';
  heading.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'wardrobe-tiles';
  for (const [id, name] of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wardrobe-tile';
    button.textContent = name;
    button.addEventListener('click', () => onChoose(id));
    grid.append(button);
  }
  container.append(heading, grid);
  return [...grid.children];
}

export function createWardrobePanel({ onOutfit, onAccessory, onImport }) {
  const clothes = document.getElementById('wardrobeClothes');
  const jewelry = document.getElementById('wardrobeJewelry');
  const clothesHint = document.getElementById('wardrobeUnavailable');
  const accessories = document.getElementById('wardrobeAccessories');
  const importButton = document.getElementById('importWardrobeAsset');
  const localAssetsMissing = document.getElementById('localAssetsMissing');
  const accessoriesHint = document.getElementById('accessoriesUnavailable');
  const editor = document.getElementById('accessoryEditor');
  const editorName = document.getElementById('accessoryName');
  const editorAnchor = document.getElementById('accessoryAnchor');
  const localOptions = document.getElementById('accessoryLocal');
  const mountSelect = document.getElementById('accessoryMount');
  const reopenButton = document.getElementById('reopenWardrobeAsset');
  const editorSliders = document.getElementById('accessorySliders');
  const visible = document.getElementById('accessoryVisible');

  let shownModel;
  let shownWardrobe;
  let selected;
  let settings = {};
  let outfitButtons = [];
  let accessoryTiles = [];
  let shownAssets = new Map();
  let assetList;
  let mountOptions;
  const picker = createWardrobeFilePicker({
    input: document.getElementById('wardrobeAssetFiles'),
    companion: document.getElementById('importWardrobeCompanions'),
    status: document.getElementById('wardrobeImportStatus'),
    loadingText: 'Gegenstand wird lokal geladen …',
    load: (files, { id }, isCurrent) => onImport(files, id, isCurrent),
    loaded(result) {
      selected = result.id;
      showSelection();
      accessoryTiles.find(({ id }) => id === selected)?.button.focus();
    }
  });
  const cancelLocalImport = picker.cancel;
  importButton.addEventListener('click', () => picker.choose());
  reopenButton.addEventListener('click', () => picker.choose({ id: selected }));

  function update(next) {
    onAccessory(selected, next);
  }

  const controls = ACCESSORY_TRANSFORM_FIELDS.map(field => {
    const { key, i, label, min, max, step, unit } = field;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = 'accessory-' + key + (i === undefined ? '' : '-' + ['x', 'y', 'z'][i]);
    input.min = min;
    input.max = max;
    input.step = step;
    const caption = document.createElement('label');
    caption.className = 'slider-label';
    caption.htmlFor = input.id;
    const output = document.createElement('output');
    caption.append(label, output);
    const row = document.createElement('div');
    row.append(caption, input);
    editorSliders.append(row);

    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (i === undefined) {
        update({ ...settings[selected], [key]: value });
      } else {
        const axisValues = [...settings[selected][key]];
        axisValues[i] = value;
        update({ ...settings[selected], [key]: axisValues });
      }
    });
    return (item, local) => {
      if (key === 'scale') {
        const limits = local ? LOCAL_ACCESSORY_SCALE : field;
        input.min = limits.min;
        input.max = limits.max;
      }
      const value = i === undefined ? item[key] : item[key][i];
      input.value = value;
      output.textContent = value + unit;
    };
  });

  document.getElementById('accessoryReset').addEventListener('click', () => {
    update({ ...settings[selected], ...defaultAccessory(), visible: settings[selected].visible });
  });
  document.getElementById('accessoryRemove').addEventListener('click', () => {
    const removed = accessoryTiles.find(({ id }) => id === selected);
    if (picker.options()?.id === selected) cancelLocalImport();
    update(null);
    (removed?.button.isConnected ? removed.button : importButton).focus();
  });
  visible.addEventListener('change', () => update({ ...settings[selected], visible: visible.checked }));
  mountSelect.addEventListener('change', () => update({ ...settings[selected], anchor: mountSelect.value }));

  function showSelection() {
    for (const { id, button } of accessoryTiles) {
      const missing = shownAssets.get(id).missing;
      button.setAttribute('aria-pressed', String(Boolean(settings[id]?.visible && !missing)));
      button.classList.toggle('is-edited', selected === id);
    }
    const chosen = shownAssets.get(selected);
    const item = settings[selected];
    editor.hidden = !chosen || !item;
    if (editor.hidden) return;
    editorName.textContent = chosen.name;
    const local = chosen.format === 'local';
    editorAnchor.hidden = local;
    editorAnchor.textContent = ACCESSORY_ANCHORS[chosen.anchor];
    localOptions.hidden = !local;
    if (local) {
      const key = chosen.options.join(',');
      if (mountOptions !== key) {
        mountOptions = key;
        mountSelect.replaceChildren(...chosen.options.map(anchor => new Option(ACCESSORY_ANCHORS[anchor], anchor)));
      }
      mountSelect.value = chosen.anchor;
      reopenButton.hidden = !chosen.missing;
    }
    visible.checked = item.visible;
    for (const sync of controls) sync(item, local);
  }

  function addOutfitGroups(container, groups, wardrobe) {
    container.replaceChildren();
    if (!wardrobe) return;
    for (const { title, slot } of groups) {
      const choices = Object.entries(wardrobe.labels[slot] ?? {});
      if (!choices.length) continue;
      const buttons = addTiles(container, title, choices, id => onOutfit(slot, id));
      outfitButtons.push(...choices.map(([id], i) => ({ id, slot, button: buttons[i] })));
    }
  }

  return {
    cancelLocalImport,
    show({ model, wardrobe, outfit, assets, equipped, overriddenSlots }) {
      settings = equipped;
      shownAssets = new Map(assets.map(asset => [asset.id, asset]));
      localAssetsMissing.hidden = !assets.some(asset => asset.missing);
      accessoriesHint.hidden = assets.length > 0;
      const nextAssetList = JSON.stringify(assets.map(({ id, name }) => [id, name]));
      if (model !== shownModel) {
        shownModel = model;
        selected = undefined;
        cancelLocalImport();
      }
      if (assetList !== nextAssetList) {
        assetList = nextAssetList;
        accessories.replaceChildren();
        accessoryTiles = [];
        for (const [category, title] of Object.entries(ACCESSORY_GROUPS)) {
          const entries = assets.filter(asset => asset.category === category);
          if (!entries.length) continue;
          const buttons = addTiles(accessories, title, entries.map(({ id, name }) => [id, name]), id => {
            selected = id;
            if (settings[id]?.visible || shownAssets.get(id).missing) showSelection();
            else update({ ...(settings[id] ?? defaultAccessory()), visible: true });
          });
          if (category === 'local') {
            for (const button of buttons) button.classList.add('wardrobe-tile-local');
          }
          accessoryTiles.push(...entries.map(({ id }, i) => ({ id, button: buttons[i] })));
        }
      }

      if (wardrobe !== shownWardrobe) {
        shownWardrobe = wardrobe;
        clothesHint.hidden = Boolean(wardrobe);
        outfitButtons = [];
        addOutfitGroups(clothes, clothingGroups, wardrobe);
        addOutfitGroups(jewelry, jewelryGroups, wardrobe);
      }
      for (const { slot, id, button } of outfitButtons) {
        const coveredByDress = outfit.dress !== 'none' && (slot === 'top' || slot === 'bottom');
        button.setAttribute('aria-pressed', String(!coveredByDress && !overriddenSlots?.has(slot) && outfit[slot] === id));
      }
      if (!settings[selected]) selected = accessoryTiles.find(({ id }) => settings[id])?.id;
      showSelection();
    }
  };
}

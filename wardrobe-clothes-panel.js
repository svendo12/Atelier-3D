import { CLOTHING_SLOTS } from './wardrobe-clothes.js';
import { createWardrobeFilePicker } from './wardrobe-file-picker.js';

export function createLocalClothesPanel({ onImport, onShow, onRemove }) {
  const panel = document.getElementById('localClothesPanel');
  const category = document.getElementById('localClothesSlot');
  const importButton = document.getElementById('importLocalClothes');
  const list = document.getElementById('localClothesList');
  const rows = new Map();
  let shownModel;
  category.replaceChildren(...Object.entries(CLOTHING_SLOTS).map(([id, label]) => new Option(label, id)));

  const picker = createWardrobeFilePicker({
    input: document.getElementById('localClothesFiles'),
    companion: document.getElementById('importLocalClothesCompanions'),
    status: document.getElementById('localClothesStatus'),
    load: onImport,
    loaded(result) { rows.get(result.id)?.toggle.focus(); },
    loadingText: 'Kleidungsstück wird lokal geladen und geprüft …'
  });
  importButton.addEventListener('click', () => picker.choose({ slot: category.value }));

  function addButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'btn btn-secondary';
    button.addEventListener('click', action);
    return button;
  }

  function addRow(id) {
    const row = document.createElement('div');
    row.className = 'wardrobe-editor';
    const name = document.createElement('h2');
    name.className = 'wardrobe-heading';
    const hint = document.createElement('p');
    hint.className = 'helper-text';
    const actions = document.createElement('div');
    actions.className = 'wardrobe-actions';
    const toggle = addButton('Anziehen', () => onShow(id));
    const reopen = addButton('Datei erneut auswählen', () => picker.choose({ id }));
    const remove = addButton('Entfernen', () => {
      if (picker.options()?.id === id) picker.cancel();
      onRemove(id);
      importButton.focus();
    });
    actions.append(toggle, reopen, remove);
    row.append(name, hint, actions);
    list.append(row);
    const elements = { row, name, hint, toggle, reopen };
    rows.set(id, elements);
    return elements;
  }

  return {
    cancel: picker.cancel,
    show({ model, supported, items, sessions }) {
      panel.hidden = !supported;
      if (shownModel !== model) {
        shownModel = model;
        picker.cancel();
      }
      for (const [id, { row }] of rows) {
        if (supported && Object.hasOwn(items, id)) continue;
        row.remove();
        rows.delete(id);
      }
      if (!supported) return;
      for (const [id, { source, visible, slot }] of Object.entries(items)) {
        const { name, hint, toggle, reopen } = rows.get(id) ?? addRow(id);
        const session = sessions.get(id);
        name.textContent = source.name;
        const label = CLOTHING_SLOTS[slot];
        hint.textContent = session ? `${label} · Körperformen ${session.matchedShapes}/${session.totalShapes}`
          : `${label} · Lokale Datei erneut auswählen.`;
        reopen.hidden = Boolean(session);
        toggle.hidden = !session;
        toggle.textContent = visible ? 'Ausziehen' : 'Anziehen';
      }
    }
  };
}

import { readBodyShapeSettings, SHAPE_CATEGORIES } from './vrm-body-shapes.js';

const format = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 });

export function createBodyShapePanel({ onChange, onExport }) {
  const panel = document.getElementById('advancedBodyShape');
  const controls = document.getElementById('bodyShapeFields');
  const reset = document.getElementById('bodyShapeReset');
  const report = document.getElementById('bodyShapeReport');
  const inventory = document.getElementById('bodyShapeInventory');
  const status = document.getElementById('bodyShapeStatus');
  const download = document.getElementById('bodyShapeExport');
  let model;
  let values = {};
  const rows = [];

  function sync() {
    reset.disabled = !Object.keys(values).length;
    for (const { field, slider, output, revert } of rows) {
      const value = Object.hasOwn(values, field.key) ? values[field.key] : field.initial;
      slider.value = value;
      output.value = format.format(value);
      revert.disabled = value === field.initial;
    }
  }

  function change(next) {
    values = readBodyShapeSettings(next, model.fields);
    sync();
    onChange(values);
  }

  reset.addEventListener('click', () => change({}));
  download.addEventListener('click', () => onExport(model));

  function addField(group, field) {
    const id = 'model-shape-' + rows.length;
    const row = document.createElement('div');
    const heading = document.createElement('label');
    heading.className = 'slider-label';
    heading.htmlFor = id;
    const name = document.createElement('span');
    name.id = id + '-label';
    name.textContent = field.label;
    const output = document.createElement('output');
    heading.append(name, output);
    const slider = document.createElement('input');
    slider.id = id;
    slider.setAttribute('aria-labelledby', name.id);
    slider.type = 'range';
    slider.className = 'slider';
    slider.min = field.min;
    slider.max = field.max;
    slider.step = field.step;
    slider.addEventListener('input', () => change({ ...values, [field.key]: Number(slider.value) }));
    const standard = document.createElement('button');
    standard.type = 'button';
    standard.className = 'btn btn-ghost body-shape-revert';
    standard.textContent = `Standard ${format.format(field.initial)}`;
    standard.setAttribute('aria-label', `${field.label} auf ${format.format(field.initial)} zurücksetzen`);
    standard.addEventListener('click', () => change({ ...values, [field.key]: field.initial }));
    rows.push({ field, slider, output, revert: standard });
    row.append(heading, slider, standard);
    group.append(row);
  }

  function rebuild() {
    rows.length = 0;
    controls.replaceChildren();
    report.replaceChildren();
    if (!model) return;
    const groups = new Map();
    for (const field of model.fields) {
      if (!groups.has(field.group)) {
        const group = document.createElement('div');
        group.className = 'sliders';
        const title = document.createElement('h2');
        title.textContent = field.group;
        group.append(title);
        controls.append(group);
        groups.set(field.group, group);
      }
      addField(groups.get(field.group), field);
    }
    reset.hidden = !model.fields.length;
    status.textContent = model.inventory.length
      ? model.fields.length ? (model.hint ?? '') : 'Die Datei enthält Morph Targets. Für Körperregler ist eine geprüfte Zuordnung erforderlich.'
      : 'Der VRM-Export enthält keine Morph Targets. Prüfe den Shape-Key-Export in Blender.';
    status.hidden = !status.textContent;
    for (const [category, title] of Object.entries(SHAPE_CATEGORIES)) {
      const shapes = model.inventory.filter(entry => entry.category === category);
      if (!shapes.length) continue;
      const heading = document.createElement('h3');
      heading.textContent = title;
      const list = document.createElement('ul');
      for (const shape of shapes) {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = shape.name ?? `Ohne Namen (Index ${shape.index})`;
        const data = document.createElement('span');
        const delta = shape.positionDelta === null ? 'keine auswertbare Positionsänderung'
          : shape.positionDelta === 0 ? 'Positionsänderung 0'
            : `max. Δ ${shape.positionDelta.toPrecision(3)}`;
        data.textContent = [
          shape.mesh, shape.primitive === null ? '' : `Teil ${shape.primitive + 1}`, `Standard ${shape.initial ?? 'unbekannt'}`, delta,
          shape.approved ? 'Körperregler aktiv' : '', ...shape.expressions
        ].filter(Boolean).join(' · ');
        item.append(name, data);
        list.append(item);
      }
      report.append(heading, list);
    }
    inventory.hidden = !model.inventory.length;
  }

  return {
    show(next, settings) {
      panel.hidden = !next;
      if (next !== model) {
        model = next;
        rebuild();
      }
      if (!model) return;
      values = readBodyShapeSettings(settings, model.fields);
      sync();
    }
  };
}

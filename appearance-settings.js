export const APPEARANCE_FIELDS = {
  skin: { label: 'Haut', color: '#c69579', group: 'figure' },
  hair: { label: 'Haare', color: '#543629', group: 'figure' },
  iris: { label: 'Augenfarbe', color: '#558a99', group: 'figure' },
  brows: { label: 'Augenbrauen', color: '#4b3029', group: 'figure' },
  top: { label: 'Oberteil', color: '#527fad', group: 'clothes' },
  shortTop: { label: 'Kurzshirt', color: '#537db2', group: 'clothes' },
  bottoms: { label: 'Hose', color: '#393c57', group: 'clothes' },
  shoes: { label: 'Schuhe', color: '#3a3745', group: 'clothes' },
  lipstick: { label: 'Lippenstift', color: '#ac435c', amount: 80, group: 'makeup' },
  blush: { label: 'Rouge', color: '#d77083', amount: 38, group: 'makeup' },
  eyeshadow: { label: 'Lidschatten', color: '#9478b1', amount: 50, group: 'makeup' },
  eyeliner: { label: 'Eyeliner / Wimpern', color: '#342036', amount: 85, group: 'makeup' }
};

export function readAppearance(input) {
  const result = {};
  for (const [key, entry] of Object.entries(input ?? {})) {
    if (!Object.hasOwn(APPEARANCE_FIELDS, key) && !/^clothing:[a-z0-9_-]{1,90}$/.test(key)) continue;
    if (typeof entry?.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color)) continue;
    const field = APPEARANCE_FIELDS[key];
    const amount = field?.amount !== undefined
      ? Math.round(Math.min(100, Math.max(0, Number.isFinite(entry.amount) ? entry.amount : field.amount)))
      : 100;
    result[key] = { color: entry.color.toLowerCase(), amount };
  }
  return result;
}

export function createAppearancePanel({ groups, empty, reset, onChange }) {
  const controls = new Map();
  let appearance;
  let settings = {};

  function sync() {
    for (const [key, { field, color, revert, slider, output }] of controls) {
      const entry = settings[key];
      if (color.value !== (entry?.color ?? field.color)) color.value = entry?.color ?? field.color;
      revert.disabled = !entry;
      if (slider) {
        slider.value = entry?.amount ?? 0;
        output.value = slider.value + ' %';
      }
    }
    reset.disabled = ![...controls.keys()].some(key => settings[key]);
  }

  function commit() {
    onChange(readAppearance(settings));
    sync();
  }

  function addRow(key, field) {
    const group = groups[field.group];
    const row = document.createElement('div');
    const colorLine = document.createElement('div');
    colorLine.className = 'appearance-color-line';
    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = 'color-' + key.replace(':', '-');
    const color = document.createElement('input');
    color.type = 'color';
    color.id = label.htmlFor;
    color.addEventListener('input', () => {
      settings[key] = { color: color.value, amount: settings[key]?.amount || field.amount || 100 };
      commit();
    });
    const revert = document.createElement('button');
    revert.type = 'button';
    revert.className = 'appearance-revert';
    revert.textContent = '↶';
    revert.setAttribute('aria-label', field.label + ' zurücksetzen');
    revert.title = field.label + ' zurücksetzen';
    revert.addEventListener('click', () => {
      delete settings[key];
      commit();
    });
    colorLine.append(label, color, revert);
    row.append(colorLine);

    let slider;
    let output;
    if (field.amount !== undefined) {
      const amountLabel = document.createElement('label');
      amountLabel.htmlFor = color.id + '-amount';
      amountLabel.className = 'slider-label appearance-amount';
      const caption = document.createElement('span');
      caption.textContent = 'Intensität';
      output = document.createElement('output');
      amountLabel.append(caption, output);
      slider = document.createElement('input');
      slider.type = 'range';
      slider.id = amountLabel.htmlFor;
      slider.className = 'slider';
      slider.min = 0;
      slider.max = 100;
      slider.setAttribute('aria-label', field.label + ' Intensität');
      slider.addEventListener('input', () => {
        settings[key] = { color: color.value, amount: Number(slider.value) };
        commit();
      });
      row.append(amountLabel, slider);
    }
    controls.set(key, { field, color, revert, slider, output });
    group.append(row);
  }

  reset.addEventListener('click', () => {
    settings = {};
    commit();
  });

  return {
    show(next, nextSettings) {
      if (next !== appearance) {
        appearance = next;
        controls.clear();
        for (const group of Object.values(groups)) {
          group.replaceChildren();
          group.parentElement.hidden = true;
        }
        for (const [key, field] of next?.fields ?? []) {
          addRow(key, field);
          groups[field.group].parentElement.hidden = false;
        }
      }
      empty.hidden = controls.size > 0;
      reset.hidden = !controls.size;
      settings = readAppearance(nextSettings);
      sync();
    }
  };
}

export const FACE_GROUPS = [
  {
    key: 'emotion', label: 'Gesichtsausdruck', neutral: 'Neutral',
    options: [
      ['happy', 'Lächeln'], ['sad', 'Traurig'], ['angry', 'Wütend'],
      ['surprised', 'Überrascht'], ['relaxed', 'Entspannt']
    ]
  },
  {
    key: 'eyes', label: 'Augen', neutral: 'Geöffnet',
    options: [
      ['blink', 'Beide schließen'],
      // The studio labels sides as they appear in the front view.
      ['blinkRight', 'Linkes Auge schließen'], ['blinkLeft', 'Rechtes Auge schließen']
    ]
  },
  {
    key: 'mouth', label: 'Mundform', neutral: 'Grundform',
    options: [
      ['aa', 'A · Mund öffnen'], ['ih', 'I'], ['ou', 'U'], ['ee', 'E'], ['oh', 'O']
    ]
  }
];

const standardNames = new Set(FACE_GROUPS.flatMap(({ options }) => options.map(([name]) => name)));
const intensity = value => Math.round(Math.max(0, Math.min(100, value)));

export function readFaceSettings(input) {
  const face = {};
  for (const { key, options } of FACE_GROUPS) {
    const entry = input?.[key];
    if (options.some(([name]) => name === entry?.name) && Number.isFinite(entry.strength)) {
      face[key] = { name: entry.name, strength: intensity(entry.strength) };
    }
  }
  const mix = Object.fromEntries(Object.entries(input?.mix ?? {}).filter(([id, value]) =>
    Number.isFinite(value) && value > 0 && (standardNames.has(id) ||
      (id.length <= 240 && /^(detail|custom):[^\u0000-\u001f]+$/.test(id)))
  ).map(([id, value]) => [id, intensity(value)]));
  if (Object.keys(mix).length) face.mix = mix;
  return face;
}

function intensitySlider(id, caption, onInput) {
  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'slider-label';
  const text = document.createElement('span');
  text.textContent = caption;
  const output = document.createElement('output');
  label.append(text, output);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.setAttribute('aria-label', caption);
  slider.className = 'slider';
  slider.min = 0;
  slider.max = 100;
  slider.addEventListener('input', () => onInput(Number(slider.value)));
  return { label, slider, output };
}

export function createFacePanel({ container, finePanel, fineContainer, unavailable, reset, hint, onChange }) {
  let face;
  let settings = {};
  const rows = new Map();
  const fineRows = new Map();

  function buildFineControls() {
    fineRows.clear();
    fineContainer.replaceChildren();
    finePanel.hidden = !face?.fineGroups.length;
    for (const { label, options } of face?.fineGroups ?? []) {
      const section = document.createElement('div');
      const heading = document.createElement('h2');
      heading.textContent = label;
      section.append(heading);
      for (const [name, caption] of options) {
        const row = intensitySlider('face-mix-' + fineRows.size, caption, value => {
          settings.mix ??= {};
          if (value) settings.mix[name] = value;
          else delete settings.mix[name];
          commit();
        });
        const { isBinary } = face.editable.get(name);
        row.slider.step = isBinary ? 100 : 1;
        fineRows.set(name, row);
        section.append(row.label, row.slider);
      }
      fineContainer.append(section);
    }
  }

  function build() {
    container.replaceChildren();
    rows.clear();
    unavailable.hidden = Boolean(face?.editable.size);
    reset.hidden = !face?.editable.size;
    buildFineControls();
    for (const { key, label, neutral, options } of FACE_GROUPS) {
      const available = options.filter(([name]) => face?.supported.has(name));
      if (!available.length) continue;

      const group = document.createElement('div');
      group.className = 'model-controls';
      const title = document.createElement('label');
      title.className = 'control-title';
      title.htmlFor = 'face-' + key;
      title.textContent = label;
      const select = document.createElement('select');
      select.id = title.htmlFor;
      select.add(new Option(neutral, ''));
      for (const [name, text] of available) select.add(new Option(text, name));

      const { label: intensityLabel, slider, output } = intensitySlider(select.id + '-strength', 'Intensität', value => {
        settings[key] = { name: select.value, strength: value };
        commit();
      });
      slider.setAttribute('aria-label', 'Intensität – ' + label);
      select.addEventListener('change', () => {
        const previous = settings[key];
        if (select.value) settings[key] = { name: select.value, strength: previous?.strength ?? 100 };
        else delete settings[key];
        commit();
      });

      rows.set(key, { select, slider, output });
      group.append(title, select, intensityLabel, slider);
      container.append(group);
    }
  }

  function sync() {
    for (const [key, { select, slider, output }] of rows) {
      const entry = settings[key];
      const expression = face.supported.get(entry?.name);
      select.value = expression ? entry.name : '';
      slider.disabled = !expression;
      slider.step = expression?.isBinary ? 100 : 1;
      slider.value = expression ? String(entry.strength) : '0';
      output.value = slider.value + ' %';
    }
    for (const [name, { slider, output }] of fineRows) {
      slider.value = settings.mix?.[name] ?? 0;
      output.value = slider.value + ' %';
    }
    hint.textContent = face?.overrideHint(settings) ?? '';
    hint.hidden = !hint.textContent;
  }

  function commit() {
    settings = readFaceSettings(settings);
    onChange(settings);
    sync();
  }

  reset.addEventListener('click', () => {
    settings = {};
    commit();
  });

  return {
    show(nextFace, nextSettings) {
      if (face !== nextFace) {
        face = nextFace;
        build();
      }
      settings = readFaceSettings(nextSettings);
      sync();
    }
  };
}

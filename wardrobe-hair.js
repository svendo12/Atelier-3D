const HAIR_SWATCHES = [
  ['Schwarz', '#211c22'],
  ['Dunkelbraun', '#493027'],
  ['Kastanienbraun', '#754629'],
  ['Kupferrot', '#ad5833'],
  ['Goldblond', '#c89c59'],
  ['Platinblond', '#e0d2b5'],
  ['Silbergrau', '#a6a8b5'],
  ['Violett', '#6e4c8e']
];

export function createHairPanel(onChange) {
  const panel = document.getElementById('wardrobeHair');
  const palette = document.getElementById('hairSwatches');
  const picker = document.getElementById('wardrobeHairColor');
  const reset = document.getElementById('wardrobeHairReset');
  const swatches = HAIR_SWATCHES.map(([name, color]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wardrobe-tile hair-swatch';
    const sample = document.createElement('span');
    sample.className = 'hair-sample';
    sample.style.backgroundColor = color;
    sample.setAttribute('aria-hidden', 'true');
    button.append(sample, name);
    button.addEventListener('click', () => onChange(color));
    palette.append(button);
    return { button, color };
  });

  picker.addEventListener('input', () => onChange(picker.value));
  reset.addEventListener('click', () => onChange(null));

  return {
    show(field, selection) {
      panel.hidden = !field;
      if (!field) return;
      const color = selection?.color;
      const next = color ?? field.color;
      if (picker.value !== next) picker.value = next;
      reset.disabled = !color;
      for (const swatch of swatches) swatch.button.setAttribute('aria-pressed', String(color === swatch.color));
    }
  };
}

export function createWardrobeFilePicker({ input, companion, status, load, loaded, loadingText }) {
  let picker;
  function showStatus(message, error = false) {
    status.hidden = !message;
    status.textContent = message;
    status.toggleAttribute('data-error', error);
  }
  function cancel() {
    picker = undefined;
    companion.hidden = true;
    showStatus('');
  }
  function choose(options = {}) {
    cancel();
    picker = { options, files: new Map() };
    input.click();
  }

  companion.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    input.value = '';
    const current = picker;
    if (!current || !files.length) return;
    for (const file of files) current.files.set(file.name.toLowerCase(), file);
    const request = current.request = Symbol();
    companion.hidden = true;
    showStatus(loadingText);
    const isCurrent = () => picker === current && current.request === request;
    try {
      const result = await load([...current.files.values()], current.options, isCurrent);
      if (!isCurrent()) return;
      cancel();
      if (!result) return;
      loaded(result);
      showStatus(result.message ?? `${result.name} wurde lokal geladen.`);
    } catch (error) {
      if (!isCurrent()) return;
      showStatus(error.message, true);
      companion.hidden = !error.needsCompanions;
      if (!error.needsCompanions) picker = undefined;
    }
  });

  return { choose, cancel, options: () => picker?.options };
}

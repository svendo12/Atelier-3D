import { Quaternion } from 'three';

export function readLibraryBookmark(input) {
  if (!/^(pose|motion)$/.test(input?.kind) || typeof input.id !== 'string' || !/^[a-z0-9_-]{1,70}$/.test(input.id)) return null;
  return { kind: input.kind, id: input.id, time: Number.isFinite(input.time) ? Math.max(0, input.time) : 0 };
}

export function createPoseLibrary(panel, { adopt, preview, finishPreview }) {
  const category = panel.querySelector('#libraryCategory');
  const poses = panel.querySelector('#libraryPose');
  const applyPose = panel.querySelector('#libraryApplyPose');
  const motions = panel.querySelector('#libraryMotion');
  const play = panel.querySelector('#libraryPlay');
  const speed = panel.querySelector('#librarySpeed');
  const time = panel.querySelector('#libraryTime');
  const timeLabel = panel.querySelector('#libraryTimeLabel');
  const capture = panel.querySelector('#libraryCapture');
  const close = panel.querySelector('#libraryClose');
  const status = panel.querySelector('#libraryStatus');

  let catalog;
  let catalogRequest;
  const clips = new Map();
  let active;
  let request = 0;
  let playing = false;
  const a = new Quaternion();
  const b = new Quaternion();

  async function json(file) {
    const response = await fetch(new URL('./library/' + file, import.meta.url));
    if (!response.ok) throw new Error('Bibliotheksdatei konnte nicht geladen werden.');
    return response.json();
  }

  function populatePoses() {
    const entries = catalog.poses.filter(pose => !category.value || pose.group === category.value);
    poses.replaceChildren(new Option('Pose auswählen', ''), ...entries.map(pose => new Option(pose.name, pose.id)));
    applyPose.disabled = true;
  }

  async function loadCatalog() {
    catalogRequest ??= json('catalog.json').then(data => {
      data.indices = new Map(data.joints.map((name, index) => [name, index * 4]));
      catalog = data;
      category.replaceChildren(new Option('Alle Kategorien', ''), ...[...new Set(data.poses.map(item => item.group))]
        .map(group => new Option(group, group)));
      populatePoses();
      motions.replaceChildren(new Option('Bewegung auswählen', ''), ...data.motions.map(item => new Option(item.name, item.id)));
      category.disabled = poses.disabled = motions.disabled = false;
      status.textContent = '';
      return data;
    }).catch(error => {
      catalogRequest = undefined;
      throw error;
    });
    return catalogRequest;
  }

  function loadClip(entry) {
    if (!clips.has(entry.id)) {
      clips.set(entry.id, json(entry.asset).catch(error => {
        clips.delete(entry.id);
        throw error;
      }));
    }
    return clips.get(entry.id);
  }

  function at(entry, clip, position) {
    const bounded = Math.max(0, Math.min(entry.duration, position));
    const index = bounded / entry.duration * (clip.frames.length - 1);
    const first = Math.floor(index);
    const fraction = index - first;
    const start = clip.frames[first];
    const end = clip.frames[first + 1] ?? start;
    const frame = start.slice();
    if (fraction) {
      for (let offset = 0; offset < frame.length; offset += 4) {
        if (frame[offset] === null || end[offset] === null) continue;
        a.fromArray(start, offset).normalize().slerp(b.fromArray(end, offset).normalize(), fraction).toArray(frame, offset);
      }
    }
    const lift = clip.lift[first] + fraction * ((clip.lift[first + 1] ?? clip.lift[first]) - clip.lift[first]);
    return { indices: catalog.indices, frame, lift };
  }

  function sync() {
    const enabled = Boolean(active);
    play.disabled = speed.disabled = time.disabled = capture.disabled = close.disabled = !enabled;
    play.textContent = playing ? 'Pause' : 'Abspielen';
    time.max = active?.entry.duration ?? 0;
    time.value = active?.time ?? 0;
    const seconds = value => value.toFixed(2).replace('.', ',') + ' s';
    timeLabel.value = enabled ? seconds(active.time) + ' / ' + seconds(active.entry.duration) : '0,00 s';
  }

  function showFrame() {
    preview(at(active.entry, active.clip, active.time));
    sync();
  }

  function cancel({ restore = true } = {}) {
    request++;
    const hadPreview = Boolean(active);
    active = undefined;
    playing = false;
    motions.value = '';
    status.textContent = '';
    sync();
    if (hadPreview && restore) finishPreview();
  }

  function showError(error) {
    console.warn('Posenbibliothek', error);
    status.textContent = 'Die Bibliotheksdatei konnte nicht geladen werden. Öffne die Bibliothek erneut.';
  }

  panel.addEventListener('toggle', () => {
    if (!panel.open || catalog) return;
    status.textContent = 'Bibliothek wird geöffnet …';
    loadCatalog().catch(showError);
  });
  category.addEventListener('change', populatePoses);
  poses.addEventListener('change', () => { applyPose.disabled = !poses.value; });
  applyPose.addEventListener('click', () => {
    const entry = catalog.poses.find(item => item.id === poses.value);
    if (!entry) return;
    cancel({ restore: false });
    adopt({ kind: 'pose', id: entry.id, time: 0 }, { indices: catalog.indices, frame: entry.frame, lift: 0 }, entry.name);
  });
  motions.addEventListener('change', async () => {
    const id = motions.value;
    cancel();
    if (!id) return;
    motions.value = id;
    const entry = catalog.motions.find(item => item.id === id);
    const current = request;
    status.textContent = 'Bewegung wird geladen …';
    try {
      const clip = await loadClip(entry);
      if (current !== request) return;
      active = { entry, clip, time: 0 };
      status.textContent = 'Übernimm einen Moment als Pose, um ihn mit den Gelenkreglern zu bearbeiten.';
      showFrame();
    } catch (error) {
      if (current === request) showError(error);
    }
  });
  play.addEventListener('click', () => {
    if (!active) return;
    playing = !playing;
    if (playing && active.time >= active.entry.duration) {
      active.time = 0;
      showFrame();
    }
    sync();
  });
  time.addEventListener('input', () => {
    active.time = Number(time.value);
    playing = false;
    showFrame();
  });
  close.addEventListener('click', () => cancel());
  capture.addEventListener('click', () => {
    const { entry, clip, time } = active;
    const sample = at(entry, clip, time);
    cancel({ restore: false });
    adopt({ kind: 'motion', id: entry.id, time }, sample, entry.name);
  });

  return {
    cancel,
    get previewActive() { return Boolean(active); },
    advance(delta) {
      if (!playing || !active) return;
      const position = active.time + Math.min(delta, 0.1) * Number(speed.value);
      active.time = active.entry.loop ? position % active.entry.duration : Math.min(position, active.entry.duration);
      if (!active.entry.loop && active.time >= active.entry.duration) playing = false;
      showFrame();
    },
    async restore(bookmark) {
      const current = request;
      const data = await loadCatalog();
      const entry = data[bookmark.kind === 'pose' ? 'poses' : 'motions'].find(item => item.id === bookmark.id);
      if (!entry) return;
      const sample = bookmark.kind === 'pose'
        ? { indices: data.indices, frame: entry.frame, lift: 0 }
        : at(entry, await loadClip(entry), bookmark.time);
      if (current === request) return sample;
    }
  };
}

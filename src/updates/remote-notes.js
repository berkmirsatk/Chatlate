import { createChangelogText } from './changelog-text.js';
import { updateMessages } from './messages.js';

/** A page-scoped request. Nothing is persisted, and every load fetches fresh notes.
 * @param {import('./index.js').ReleaseSource | null} source
 * @param {() => void} invalidate */
export function createChangelogRequest(source, invalidate) {
  /** @type {import('./index.js').Release[]} */
  let entries = [];
  let active,
    started = false,
    failed = false,
    closed = false;
  async function load() {
    if (closed || active) return;
    const controller = new AbortController();
    const request = { controller, timer: setTimeout(() => controller.abort(), 10000) };
    active = request;
    started = true;
    entries = [];
    failed = false;
    invalidate();
    try {
      if (!source) throw Error('Changelog source unavailable');
      const result = await source.changelog(controller.signal);
      if (closed || active !== request) return;
      if (controller.signal.aborted || !Array.isArray(result)) throw Error('Changelog unavailable');
      entries = result;
    } catch {
      if (!closed && active === request) failed = true;
    } finally {
      clearTimeout(request.timer);
      if (active === request) {
        active = undefined;
        if (!closed) invalidate();
      }
    }
  }
  const retry = () =>
    inu.ui.button({
      id: 'release.notes.retry',
      text: updateMessages().retry,
      onClick: () => {
        void load();
      },
    });
  return {
    load: () => {
      void load();
    },
    entries: () => entries,
    retry,
    statusItems() {
      const text = updateMessages();
      if (!started || active) return [inu.ui.separator(text.loadingNotes)];
      if (failed) return [inu.ui.separator(text.notesFailed), retry()];
      if (!entries.length) return [inu.ui.separator(text.missingNotes), retry()];
      return [];
    },
    dispose() {
      closed = true;
      const previous = active;
      active = undefined;
      previous?.controller.abort();
      clearTimeout(previous?.timer);
      entries = [];
    },
  };
}

/** Render only freshly downloaded English notes for one version.
 * @param {import('./index.js').ReleaseSource | null} source
 * @param {string} version @param {() => void} invalidate */
export function createVersionNotes(source, version, invalidate) {
  let renderer;
  const request = createChangelogRequest(source, () => {
    renderer?.dispose();
    renderer = undefined;
    const notes = request.entries().find((entry) => entry.version === version)?.notes.en;
    if (notes) renderer = createChangelogText(inu.utils.md(notes));
    invalidate();
  });
  return {
    load: request.load,
    items() {
      const status = request.statusItems();
      if (status.length) return status;
      return renderer
        ? [renderer.item()]
        : [inu.ui.separator(updateMessages().missingNotes), request.retry()];
    },
    dispose() {
      request.dispose();
      renderer?.dispose();
      renderer = undefined;
    },
  };
}

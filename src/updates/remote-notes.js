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

/** @typedef {{language(): string, translate(content: TextWithEntities, to: string, signal: AbortSignal): Promise<TextWithEntities>}} NotesTranslator
 * @typedef {{available(): boolean, busy(): boolean, active(): boolean, toggle(): void}} NotesTranslation */

/** Render only freshly downloaded release notes for one version, optionally translated.
 * @param {import('./index.js').ReleaseSource | null} source
 * @param {string} version @param {() => void} invalidate
 * @param {NotesTranslator | null} translator */
export function createVersionNotes(source, version, invalidate, translator = null) {
  let renderer, original, translated, translating;
  let showTranslation = false;
  function render() {
    renderer?.dispose();
    renderer = undefined;
    const content = showTranslation ? translated : original;
    if (content) renderer = createChangelogText(content);
  }
  const request = createChangelogRequest(source, () => {
    const notes = request.entries().find((entry) => entry.version === version)?.notes.en;
    original = notes ? inu.utils.md(notes) : undefined;
    translated = undefined;
    showTranslation = false;
    render();
    invalidate();
  });
  // Notes are written in English.
  const target = () => translator?.language() ?? 'en';
  async function translate() {
    if (translating || !original || !translator) return;
    const controller = new AbortController();
    translating = controller;
    invalidate();
    try {
      translated = await translator.translate(original, target(), controller.signal);
      if (translating !== controller) return;
      showTranslation = true;
      render();
    } catch (error) {
      if (translating === controller && typeof error?.message === 'string' && error.message)
        inu.ui.toast(error.message);
    } finally {
      if (translating === controller) {
        translating = undefined;
        invalidate();
      }
    }
  }
  /** @type {NotesTranslation} */
  const translation = {
    available: () => !!translator && !!original && !!renderer && target().split(/[-_]/)[0] !== 'en',
    busy: () => !!translating,
    active: () => showTranslation,
    toggle() {
      if (translating || !translation.available()) return;
      if (!translated) {
        void translate();
        return;
      }
      showTranslation = !showTranslation;
      render();
      invalidate();
    },
  };
  return {
    load: request.load,
    translation,
    items() {
      const status = request.statusItems();
      if (status.length) return status;
      return renderer
        ? [renderer.item()]
        : [inu.ui.separator(updateMessages().missingNotes), request.retry()];
    },
    dispose() {
      translating?.abort();
      translating = undefined;
      request.dispose();
      renderer?.dispose();
      renderer = undefined;
    },
  };
}

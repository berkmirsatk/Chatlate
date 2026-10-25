import { PLUGIN_VERSION } from '../identity.js';
import { HISTORY_ICON } from '../community-icons.js';
import { createChangelogRequest, createVersionNotes } from './remote-notes.js';
import { updateMessages } from './messages.js';
import { createNotesAction } from './notes-action.js';

/** Version history is downloaded when opened; individual notes are refreshed on selection.
 * @param {import('./index.js').ReleaseSource | null} source
 * @param {import('./remote-notes.js').NotesTranslator | null} translator */
export function createReleaseHistory(source, translator = null) {
  const cleanups = new Set();
  let icon;
  try {
    icon = inu.icons.svg(HISTORY_ICON);
  } catch {
    try {
      icon = inu.icons.common('archive');
    } catch {}
  }

  function openVersion(version) {
    let closed = false;
    const title = 'Chatlate ' + version;
    const notes = createVersionNotes(
      source,
      version,
      () => {
        page.invalidate();
        translateAction.update();
      },
      translator,
    );
    const translateAction = createNotesAction(title, notes.translation);
    function close() {
      if (closed) return;
      closed = true;
      translateAction.dispose();
      notes.dispose();
      cleanups.delete(close);
    }
    const page = inu.ui.settingsPage({
      title,
      transient: true,
      onClose: close,
      items: notes.items,
    });
    cleanups.add(close);
    try {
      inu.ui.openPage(page);
      notes.load();
      translateAction.attach();
    } catch {
      close();
      page.dispose();
    }
  }

  function open() {
    let closed = false;
    const request = createChangelogRequest(source, () => page.invalidate());
    function close() {
      if (closed) return;
      closed = true;
      request.dispose();
      cleanups.delete(close);
    }
    const page = inu.ui.settingsPage({
      title: updateMessages().history,
      transient: true,
      onClose: close,
      items: () => {
        const status = request.statusItems();
        if (status.length) return status;
        return request.entries().map((entry) =>
          inu.ui.button({
            id: 'release.history.' + entry.version,
            text: 'Chatlate ' + entry.version,
            value: entry.version === PLUGIN_VERSION ? updateMessages().installed : undefined,
            onClick: () => {
              if (!closed) openVersion(entry.version);
            },
          }),
        );
      },
    });
    cleanups.add(close);
    try {
      inu.ui.openPage(page);
      request.load();
    } catch {
      close();
      page.dispose();
    }
  }

  return {
    reset() {
      for (const cleanup of [...cleanups]) cleanup();
    },
    item: () =>
      inu.ui.button({ id: 'release.notes', text: updateMessages().history, icon, onClick: open }),
  };
}

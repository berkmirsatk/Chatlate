import { PLUGIN_VERSION } from '../identity.js';
import { getLanguage } from '../i18n.js';
import { HISTORY_ICON } from '../community-icons.js';
import { createChangelogText } from './changelog-text.js';
import { updateMessages } from './messages.js';
import { isNewer, parseVersion } from './version.js';
import englishNotes from './notes/1.0.0.en.md';
import turkishNotes from './notes/1.0.0.tr.md';

/** Shipped notes stay available offline across upgrades. Add each release here.
 * @type {import('./index.js').Release[]} */
const archive = [{ version: '1.0.0', notes: { en: englishNotes, tr: turkishNotes } }];

/** @param {() => import('./index.js').Release | null} latest */
export function createReleaseHistory(latest) {
  const cleanups = new Set();
  let icon;
  try {
    icon = inu.icons.svg(HISTORY_ICON);
  } catch {
    try {
      icon = inu.icons.common('archive');
    } catch {}
  }

  function entries() {
    const releases = new Map(archive.map((entry) => [entry.version, entry]));
    const candidate = latest();
    // Bundled notes take precedence over remote notes for an archived version.
    if (candidate && parseVersion(candidate.version) && !releases.has(candidate.version)) {
      releases.set(candidate.version, candidate);
    }
    return [...releases.values()].sort((a, b) =>
      a.version === b.version ? 0 : isNewer(a.version, b.version) ? -1 : 1,
    );
  }

  /** @param {import('./index.js').Release} entry */
  function openVersion(entry) {
    const notes = entry.notes?.[getLanguage()] || entry.notes?.en || updateMessages().missingNotes;
    const renderer = createChangelogText(inu.utils.md(notes));
    function close() {
      renderer.dispose();
      cleanups.delete(close);
    }
    const page = inu.ui.settingsPage({
      title: 'Chatlate ' + entry.version,
      transient: true,
      onClose: close,
      items: () => [renderer.item()],
    });
    cleanups.add(close);
    try {
      inu.ui.openPage(page);
    } catch {
      close();
      page.dispose();
    }
  }

  function open() {
    const text = updateMessages();
    const page = inu.ui.settingsPage({
      title: text.history,
      transient: true,
      items: () =>
        entries().map((entry) =>
          inu.ui.button({
            id: 'release.history.' + entry.version,
            text: 'Chatlate ' + entry.version,
            value: entry.version === PLUGIN_VERSION ? text.installed : undefined,
            onClick: () => openVersion(entry),
          }),
        ),
    });
    try {
      inu.ui.openPage(page);
    } catch {
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

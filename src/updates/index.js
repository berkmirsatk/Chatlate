import { GITHUB_SVG } from '../community-icons.js';
import { githubReleaseUrl } from './release-link.js';
import { PLUGIN_VERSION } from '../identity.js';
import { get, put } from '../storage.js';
import { createVersionNotes } from './remote-notes.js';
import { celebrateUpdate } from './celebration.js';
import { updateMessages } from './messages.js';
import { isNewer } from './version.js';
import { createReleaseHistory } from './history.js';
import { createNotesAction } from './notes-action.js';

/** @typedef {{version: string, notes: {en?: string, tr?: string}, url?: string}} Release
 * @typedef {{check(signal: AbortSignal): Promise<Release | null>,
 * changelog(signal: AbortSignal): Promise<Release[]>,
 * install(release: Release, signal: AbortSignal): Promise<void>}} ReleaseSource */

/** UI and lifecycle for releases supplied by a validating distribution adapter.
 * @param {() => void} invalidate
 * @param {ReleaseSource | null} source
 * @param {import('./remote-notes.js').NotesTranslator | null} translator */
export function createUpdates(invalidate, source = null, translator = null) {
  /** @type {Release | null} */
  let release = null;
  let githubIcon;
  try {
    githubIcon = inu.icons.svg(GITHUB_SVG);
  } catch {
    try {
      githubIcon = inu.icons.common('link');
    } catch {}
  }
  const history = createReleaseHistory(source, translator);
  let checked = false,
    checkController,
    installController;
  let generation = 0;
  const pages = new Set();

  function reset() {
    generation++;
    checkController?.abort();
    installController?.abort();
    checkController = installController = undefined;
    checked = false;
    for (const close of [...pages]) close();
    history.reset();
  }

  async function check() {
    if (!source || checkController) return;
    checked = true;
    const run = generation;
    const controller = new AbortController();
    checkController = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const found = await source.check(controller.signal);
      if (controller.signal.aborted || run !== generation) return;
      release = found && isNewer(found.version, PLUGIN_VERSION) ? found : null;
      invalidate();
    } catch {
      // A failed release check must not interrupt settings or translations.
    } finally {
      clearTimeout(timeout);
      if (checkController === controller) checkController = undefined;
    }
  }

  function open() {
    if (!release || !source) return;
    const selected = release;
    const installer = source;
    const text = updateMessages();
    const notes = createVersionNotes(
      source,
      selected.version,
      () => {
        page.invalidate();
        translateAction.update();
      },
      translator,
    );
    const translateAction = createNotesAction(text.title, notes.translation);
    const releaseUrl = githubReleaseUrl(selected);
    let closed = false,
      busy = false,
      pageController;
    function close() {
      closed = true;
      pages.delete(close);
      translateAction.dispose();
      notes.dispose();
      pageController?.abort();
    }
    async function install() {
      if (closed || busy || installController) return;
      busy = true;
      const controller = new AbortController();
      installController = pageController = controller;
      page.invalidate();
      // The new plugin instance confirms its actual version before celebrating.
      put('update.pendingVersion', selected.version);
      try {
        await installer.install(selected, controller.signal);
        // The host may unload this instance during installation. Its successor
        // owns completion; a resolved installer promise alone is not proof.
      } catch {
        if (get('update.pendingVersion', '') === selected.version) put('update.pendingVersion', '');
        if (!closed && !controller.signal.aborted) inu.ui.toast(text.failed);
      } finally {
        if (installController === controller) installController = undefined;
        if (pageController === controller) pageController = undefined;
        if (!closed) {
          busy = false;
          page.invalidate();
        }
      }
    }
    const page = inu.ui.settingsPage({
      title: text.title,
      transient: true,
      onClose: close,
      items: () => [
        inu.ui.button({
          id: 'release.current',
          text: text.current,
          value: PLUGIN_VERSION,
          onClick: () => {},
        }),
        inu.ui.button({
          id: 'release.latest',
          text: text.latest,
          value: selected.version,
          onClick: () => {},
        }),
        inu.ui.header('Chatlate ' + selected.version),
        ...notes.items(),
        inu.ui.button({
          id: 'release.github',
          text: text.githubRelease,
          subtitle: releaseUrl ? undefined : text.githubUnavailable,
          icon: githubIcon,
          onClick: () => {
            if (closed) return;
            if (releaseUrl) inu.openUrl(releaseUrl);
            else inu.ui.toast(text.githubUnavailable);
          },
        }),
        inu.ui.button({
          id: 'release.update',
          text: busy ? text.installing : text.install,
          onClick: () => {
            void install();
          },
        }),
      ],
    });
    pages.add(close);
    try {
      inu.ui.openPage(page);
      notes.load();
      translateAction.attach();
    } catch {
      close();
      page.dispose();
    }
  }

  function checkOnce() {
    if (get('update.pendingVersion', '') === PLUGIN_VERSION) {
      put('update.pendingVersion', '');
      inu.ui.toast(updateMessages().complete);
      const run = generation;
      celebrateUpdate(() => run === generation);
    }
    if (!checked) void check();
  }
  return {
    reset,
    checkOnce,
    historyItem: history.item,
    available: () => release !== null,
    banner: () => ({
      available: release !== null,
      text: release ? updateMessages().banner.replace('{version}', release.version) : '',
      onClick: open,
    }),
    item: () =>
      inu.ui.button({
        id: 'updates',
        text: updateMessages().title,
        value: release?.version,
        onClick: open,
      }),
  };
}

import { REPOSITORY } from './distribution.js';
import { createGitHubSource } from './updates/github-source.js';
import { LANGUAGES } from './language-catalog.js';
import { createLanguageRow } from './language-row.js';
import { createMarqueeRow } from './marquee-row.js';
import { createDragList } from './drag-list.js';
import { createProviderEditor } from './provider-editor.js';
import { createProviderSelection } from './provider-selection.js';
import { createStatusGroup } from './status-group.js';
import { createStatusRow } from './status-row.js';
import { createSettingsBanner } from './settings-banner.js';
import { createCommunityLinks } from './community-links.js';
import { createDonation } from './donation.js';
import { createAdaptivePreviews } from './adaptive-previews.js';
import { createRainbowHeart } from './rainbow-heart.js';
import { createUpdates } from './updates/index.js';
import { getProviderOrder } from './fallback.js';
import { put } from './storage.js';
import { getAppLanguage, getLanguage, t } from './i18n.js';

/** @param {import('./provider.js').Provider[]} providers @param {() => void} refreshDescription */
export function registerSettings(providers, refreshDescription) {
  let testing = false;
  /** @type {{ text: string, successful: boolean }[]} */
  let results = [];
  let resultOrder = '';
  let testRun = 0;
  let testController;

  function cancelTest() {
    testRun++;
    testController?.abort();
    testController = undefined;
    testing = false;
  }
  const rainbowHeart = createRainbowHeart();
  const previews = createAdaptivePreviews(rainbowHeart.bind);
  const updates = createUpdates(() => page.invalidate(), createGitHubSource(REPOSITORY));
  const languageRow = createLanguageRow(() => page.invalidate());
  const donation = createDonation(rainbowHeart.icon());
  let linksExpanded = false;
  const communityLinks = createCommunityLinks(() => {
    if (linksExpanded) page.invalidate();
  });
  const settingsBanner = createSettingsBanner(
    () => page.invalidate(),
    () => {
      linksExpanded = !linksExpanded;
      if (!linksExpanded) {
        communityLinks.reset();
        rainbowHeart.reset();
      }
      page.invalidate();
    },
  );
  const resultGroup = createStatusGroup(() => page.invalidate());
  const cooldownRow = createStatusRow(() => page.invalidate());
  const selection = createProviderSelection(providers);
  const dragList = createDragList();
  let expanded = false;
  function clearResults() {
    results = [];
    resultGroup.reset();
  }
  const editor = createProviderEditor({
    providers,
    selection,
    dragList,
    onSaved: () => {
      clearResults();
      page.invalidate();
    },
    isBusy: () => testing,
    invalidate: () => page.invalidate(),
  });
  const toggleProviders = () => {
    expanded = !expanded;
    editor.setVisible(expanded);
    page.invalidate();
  };
  const marqueeRow = createMarqueeRow(() => page.invalidate());
  function closeSettings() {
    cancelTest();
    linksExpanded = false;
    communityLinks.reset();
    previews.reset();
    rainbowHeart.reset();
    updates.reset();
    settingsBanner.reset();
    donation.reset();
    languageRow.reset();
    resultGroup.reset();
    cooldownRow.reset();
    expanded = false;
    editor.setVisible(false);
    marqueeRow.reset();
  }
  inu.onUnload?.(closeSettings);

  async function testConnection() {
    if (testing) return;
    testing = true;
    const run = ++testRun;
    const order = getProviderOrder(providers[selection.read().index], providers);
    clearResults();
    resultOrder = order.map((provider) => provider.id).join(':');
    page.invalidate();
    try {
      for (const provider of order) {
        if (run !== testRun) break;
        const controller = new AbortController();
        testController = controller;
        const timer = setTimeout(() => controller.abort(), 25000);
        const started = Date.now();
        let text,
          successful = false;
        try {
          provider.clearCache?.();
          // Test each enabled service directly, without translation failover.
          await provider.translateParts(['Hello world'], getLanguage(), controller.signal);
          text = t('success');
          successful = true;
        } catch (error) {
          text =
            typeof error?.message === 'string' && error.message
              ? error.message
              : t('connectionFailed');
        } finally {
          clearTimeout(timer);
          if (testController === controller) testController = undefined;
        }
        if (run !== testRun) break;
        results.push({
          text:
            provider.name +
            ': ' +
            t('timedResult', { status: text, ms: Math.max(0, Date.now() - started) }),
          successful,
        });
        page.invalidate();
      }
    } finally {
      if (run === testRun) {
        testing = false;
        page.invalidate();
      }
    }
  }

  function changeLanguage(index) {
    const language = LANGUAGES[index]?.code;
    if (!language) return;
    // Selecting the app's current language resumes following it without a separate menu entry.
    put('language', language === getAppLanguage() ? '' : language);
    cancelTest();
    clearResults();
    if (expanded) {
      editor.setVisible(false);
      editor.setVisible(true);
    }
    refreshDescription();
    page.invalidate();
  }

  const page = inu.ui.settingsPage({
    title: 'Chatlate',
    onClose: closeSettings,
    items: () => {
      refreshDescription();
      const state = selection.read();
      const provider = providers[state.index];
      const order = getProviderOrder(provider, providers);
      const summary = order.map((item, index) => `${index + 1}. ${item.name}`).join(' → ');
      const providerTitle = t(state.available ? 'provider' : 'testProvider');
      const providerSummary = state.active || !state.available ? summary : t('chooseProvider');
      const rows = [
        languageRow.render(t('language'), getLanguage(), changeLanguage) ??
          inu.ui.select({
            id: 'language',
            text: t('language'),
            items: LANGUAGES.map((item) => item.name),
            selected: Math.max(
              0,
              LANGUAGES.findIndex((item) => item.code === getLanguage()),
            ),
            onChange: changeLanguage,
          }),
        marqueeRow.render(providerTitle, providerSummary, toggleProviders, expanded) ??
          inu.ui.button({
            id: 'provider',
            text: providerTitle,
            value: providerSummary + (expanded ? '  ▴' : '  ▾'),
            onClick: toggleProviders,
          }),
        ...editor.items(),
        inu.ui.button({
          id: 'test',
          text: testing ? t('testing') : t('test'),
          onClick: () => {
            void testConnection();
          },
        }),
      ];
      updates.checkOnce();
      const banner = settingsBanner.render(linksExpanded, updates.banner());
      previews.watch(settingsBanner.getView(), t('donate'), linksExpanded);
      const communityRows =
        linksExpanded || settingsBanner.isUnavailable()
          ? [...communityLinks.items(), updates.historyItem(), donation.item()]
          : [];
      rows.unshift(...(banner ? [banner] : []), ...communityRows, inu.ui.separator());
      if (!banner && updates.available()) rows.push(updates.item());
      if (!state.available) rows.push(inu.ui.separator(t('setup')));
      const cooldown = provider.cooldownMessage?.();
      if (cooldown) rows.push(cooldownRow(cooldown, false));
      if (results.length && resultOrder === order.map((item) => item.id).join(':'))
        rows.push(resultGroup.render(results));
      rows.push(inu.ui.separator(t(order.length > 1 ? 'fallbackPrivacy' : 'privacy')));
      return rows;
    },
  });
  inu.registerSettings(page);
}

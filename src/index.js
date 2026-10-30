/*!
 * Chatlate — Copyright (c) 2026 berkmirsatk
 * SPDX-License-Identifier: GPL-3.0-only
 * Distributed without warranty. See LICENSE for the full terms.
 * Source and license: https://github.com/berkmirsatk/Chatlate
 */
import { registeredProviderId } from './identity.js';
import { createYandexProvider } from './providers/yandex.js';
import { createGoogleProvider } from './providers/google.js';
import { createMicrosoftProvider } from './providers/microsoft.js';
import { onProviderSwitch, withFallback } from './fallback.js';
import { createChatNotice } from './chat-notice.js';
import { createTranslator } from './translation.js';
import { registerDescription } from './description.js';
import { registerSettings } from './settings.js';
import { createProviderSelection } from './provider-selection.js';
import { registerChatMenu } from './chat-menu.js';
import { registerArticleMenu } from './article-menu.js';
import { registerProfileTranslation } from './profile-translation.js';
import { registerDraftTranslation } from './draft-translation.js';
import { registerKeepOriginal } from './keep-original.js';
import { registerRestrictedLanguages } from './restricted-languages.js';

const providers = [createGoogleProvider(), createYandexProvider(), createMicrosoftProvider()];
const selection = createProviderSelection(providers);
const chatMenu = registerChatMenu(providers, selection);
const articleMenu = registerArticleMenu(providers, selection);
registerProfileTranslation(providers, selection);
const draftTranslation = registerDraftTranslation(providers, selection);
registerKeepOriginal();
registerRestrictedLanguages();
for (const provider of providers) {
  const translator = createTranslator(withFallback(provider, providers));
  inu.registerTranslationProvider({
    id: registeredProviderId(provider.id),
    name: provider.name,
    format: 'entities',
    translate: (request) => {
      // Keeps the chat menu's label in the app's current language.
      chatMenu.refresh();
      articleMenu.refresh();
      return translator.translate(request);
    },
  });
}
onProviderSwitch(createChatNotice());
const refreshDescription = registerDescription();
registerSettings(providers, selection, () => {
  refreshDescription();
  chatMenu.refresh();
  articleMenu.refresh();
  draftTranslation.refresh();
});

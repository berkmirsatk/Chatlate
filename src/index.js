/*!
 * Chatlate — Copyright (c) 2026 berkmirsatk
 * SPDX-License-Identifier: GPL-3.0-only
 * Distributed without warranty. See LICENSE for the full terms.
 * Source and license: https://github.com/berkmirsatk/Chatlate
 */
import { registeredProviderId } from './identity.js';
import { createYandexProvider } from './providers/yandex.js';
import { createGoogleProvider } from './providers/google.js';
import { withFallback } from './fallback.js';
import { createTranslator } from './translation.js';
import { registerDescription } from './description.js';
import { registerSettings } from './settings.js';

const providers = [createGoogleProvider(), createYandexProvider()];
for (const provider of providers) {
  const translator = createTranslator(withFallback(provider, providers));
  inu.registerTranslationProvider({
    id: registeredProviderId(provider.id),
    name: provider.name,
    format: 'entities',
    translate: (request) => translator.translate(request),
  });
}
registerSettings(providers, registerDescription());

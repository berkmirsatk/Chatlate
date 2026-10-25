import { registeredProviderId } from './identity.js';
import { withFallback } from './fallback.js';
import { createTranslator } from './translation.js';

const MAX_TRANSLATIONS = 20;

/** Telegram collapses runs of blank lines before showing a description. @param {string} text */
const shown = (text) => text.replace(/\n{3,}/g, '\n\n');

// Descriptions carry no entities; Telegram finds links on display, so mark them to keep them as written.
const LINKS =
  /(?:https?:\/\/|www\.)\S+|\b(?:t\.me|telegram\.me|telegram\.dog)\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|@\w{3,32}|#[\p{L}\p{N}_]+/gu;

/** @param {string} text @returns {TextWithEntities['entities']} */
export function descriptionEntities(text) {
  return Array.from(text.matchAll(LINKS), (match) => {
    const value = match[0];
    const _ =
      value[0] === '@'
        ? 'messageEntityMention'
        : value[0] === '#'
          ? 'messageEntityHashtag'
          : /^[\w.+-]+@/.test(value)
            ? 'messageEntityEmail'
            : 'messageEntityUrl';
    return /** @type {any} */ ({ _, offset: match.index, length: value.length });
  });
}

/**
 * Translates group, channel and user descriptions in place instead of in Telegram's popup.
 * Tapping Translate again shows the original. Only applies while a Chatlate service is selected.
 * @param {import('./provider.js').Provider[]} providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection
 */
export function registerProfileTranslation(providers, selection) {
  /** Original description → its translation and the profile showing it.
   * @type {Map<string, {text: string, owner: number}>} */
  const translations = new Map();
  const pending = new Set();
  /** @type {(() => void)[]} */
  const disposers = [];
  try {
    const ProfileActivity = inu.jvm.cls('org.telegram.ui.ProfileActivity');
    const alert = inu.jvm.cls('org.telegram.ui.Components.TranslateAlert2');
    const cell = inu.jvm.cls('org.telegram.ui.Cells.AboutLinkCell');
    const system = inu.jvm.cls('java.lang.System');
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const ownerOf = (fragment) => Number(system.callStatic('identityHashCode', fragment));
    const chatlateSelected = () => {
      const key = String(config.getStaticField('TRANSLATION_PROVIDER').call('getValue'));
      return providers.some((provider) => key.endsWith(':' + registeredProviderId(provider.id)));
    };

    /** @param {any} fragment */
    function refresh(fragment) {
      const rows = ['channelInfoRow', 'userInfoRow', 'bioRow'].map((name) => {
        try {
          return Number(fragment.getField(name));
        } catch {
          return -1;
        }
      });
      utilities.callStatic(
        'runOnUIThread',
        inu.jvm.runnable(() => {
          try {
            const adapter = fragment.getField('listAdapter');
            for (const row of rows) if (row >= 0) adapter.call('notifyItemChanged', row);
          } catch {
            /* the profile already closed */
          }
        }),
      );
    }

    /** @param {any} fragment @param {string} original @param {string} to @param {string | null} from */
    async function toggle(fragment, original, to, from) {
      const key = shown(original);
      if (translations.delete(key)) {
        refresh(fragment);
        return;
      }
      if (pending.has(key)) return;
      pending.add(key);
      try {
        const primary = providers[selection.read().index];
        const [result] = await createTranslator(withFallback(primary, providers)).translate({
          texts: [{ text: original, entities: descriptionEntities(original) }],
          from: [from],
          to,
          signal: new AbortController().signal,
        });
        const oldest = translations.keys().next().value;
        if (translations.size >= MAX_TRANSLATIONS && oldest !== undefined)
          translations.delete(oldest);
        translations.set(key, { text: shown(result.text), owner: ownerOf(fragment) });
        refresh(fragment);
      } catch (error) {
        if (typeof error?.message === 'string' && error.message) inu.ui.toast(error.message);
      } finally {
        pending.delete(key);
      }
    }

    disposers.push(
      inu.xposed.hookMethod(
        alert.getDeclaredMethod(
          'showAlert(Landroid/content/Context;Lorg/telegram/ui/ActionBar/BaseFragment;ILjava/lang/String;Ljava/lang/String;Ljava/lang/CharSequence;Ljava/util/ArrayList;ZLorg/telegram/messenger/Utilities$CallbackReturn;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/TranslateAlert2;',
        ),
        {
          // Only a profile's description; message translations keep their own flow.
          filter: inu.jvm.routine((_context, fragment) => fragment instanceof ProfileActivity),
          before(ctx) {
            try {
              if (!chatlateSelected()) return;
              const fragment = ctx.args[1];
              const text = String(ctx.args[5]);
              const to = String(ctx.args[4]);
              const from = ctx.args[3] && ctx.args[3] !== 'und' ? String(ctx.args[3]) : null;
              ctx.setReturnValue(null);
              // Translating needs the plugin thread.
              setTimeout(() => void toggle(fragment, text, to, from), 0);
            } catch {
              /* Telegram's popup still opens */
            }
          },
        },
      ),
    );
    disposers.push(
      inu.xposed.hookMethod(
        cell.getDeclaredMethod('setTextAndValue(Ljava/lang/String;Ljava/lang/String;Z)V'),
        {
          before(ctx) {
            if (!translations.size || typeof ctx.args[0] !== 'string') return;
            const translation = translations.get(shown(ctx.args[0]));
            if (translation) ctx.args[0] = translation.text;
          },
        },
      ),
    );
    // A closed profile forgets its translations.
    disposers.push(
      inu.xposed.hookMethod(ProfileActivity.getDeclaredMethod('onFragmentDestroy'), {
        before(ctx) {
          if (!translations.size) return;
          const owner = ownerOf(ctx.thisObject);
          for (const [key, translation] of translations)
            if (translation.owner === owner) translations.delete(key);
        },
      }),
    );
  } catch {
    /* hosts without hooking keep Telegram's popup */
  }
  inu.onUnload?.(() => {
    for (const dispose of disposers) dispose();
  });
}

import { registeredProviderId } from './identity.js';
import { withFallback } from './fallback.js';
import { createTranslator } from './translation.js';

const MAX_PROFILES = 20;

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

/** @typedef {{id: number, fragment: any, original: string, to: string, text: string | undefined, controller: AbortController | undefined}} ProfileTranslation */

/**
 * Translates group, channel and user descriptions in place instead of in Telegram's popup.
 * Tapping Translate again shows the original. Only applies while a Chatlate service is selected.
 * @param {import('./provider.js').Provider[]} providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection
 */
export function registerProfileTranslation(providers, selection) {
  /** @type {Map<number, ProfileTranslation>} */
  const profiles = new Map();
  let disposed = false;
  /** @type {(() => void)[]} */
  const disposers = [];
  try {
    const ProfileActivity = inu.jvm.cls('org.telegram.ui.ProfileActivity');
    const alert = inu.jvm.cls('org.telegram.ui.Components.TranslateAlert2');
    const cell = inu.jvm.cls('org.telegram.ui.Cells.AboutLinkCell');
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    // BaseFragment assigns a unique request guid to each profile instance.
    const ownerOf = (fragment) => Number(fragment.call('getClassGuid'));
    const current = (state) => !disposed && profiles.get(state.id) === state;
    const chatlateSelected = () => {
      const key = String(config.getStaticField('TRANSLATION_PROVIDER').call('getValue'));
      return providers.some((provider) => key.endsWith(':' + registeredProviderId(provider.id)));
    };

    /** Called by UI-thread hooks; abort listeners must run on the plugin thread.
     * @param {ProfileTranslation} state */
    function forget(state) {
      profiles.delete(state.id);
      const controller = state.controller;
      state.controller = undefined;
      if (controller) setTimeout(() => controller.abort(), 0);
    }

    /** @param {any} fragment @returns {ProfileTranslation} */
    function stateFor(fragment) {
      const id = ownerOf(fragment);
      let state = profiles.get(id);
      if (!state) {
        const oldest = profiles.values().next().value;
        if (profiles.size >= MAX_PROFILES && oldest) forget(oldest);
        state = { id, fragment, original: '', to: '', text: undefined, controller: undefined };
        profiles.set(id, state);
      }
      return state;
    }

    /** @param {ProfileTranslation} state */
    function refresh(state) {
      if (!current(state)) return;
      const fragment = state.fragment;
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
          if (!current(state)) return;
          try {
            const adapter = fragment.getField('listAdapter');
            for (const row of rows) if (row >= 0) adapter.call('notifyItemChanged', row);
          } catch {
            /* the profile already closed */
          }
        }),
      );
    }

    /** @param {ProfileTranslation} state @param {string} original @param {string} to @param {string | null} from */
    async function toggle(state, original, to, from) {
      if (!current(state) || !chatlateSelected()) return;
      const key = shown(original);
      if (state.original === key && state.to === to) {
        if (state.controller) return;
        if (state.text !== undefined) {
          state.text = undefined;
          refresh(state);
          return;
        }
      }
      state.controller?.abort();
      const controller = new AbortController();
      state.original = key;
      state.to = to;
      state.text = undefined;
      state.controller = controller;
      try {
        const primary = providers[selection.read().index];
        const [result] = await createTranslator(withFallback(primary, providers)).translate({
          texts: [{ text: original, entities: descriptionEntities(original) }],
          from: [from],
          to,
          signal: controller.signal,
        });
        if (
          !current(state) ||
          state.controller !== controller ||
          controller.signal.aborted ||
          !chatlateSelected()
        )
          return;
        state.text = shown(result.text);
        refresh(state);
      } catch (error) {
        if (
          current(state) &&
          state.controller === controller &&
          !controller.signal.aborted &&
          typeof error?.message === 'string' &&
          error.message
        )
          inu.ui.toast(error.message);
      } finally {
        if (state.controller === controller) state.controller = undefined;
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
              if (disposed || !chatlateSelected()) return;
              const fragment = ctx.args[1];
              // Register before scheduling: the profile may close before toggle runs.
              const state = stateFor(fragment);
              const text = String(ctx.args[5]);
              const to = String(ctx.args[4]);
              const from = ctx.args[3] && ctx.args[3] !== 'und' ? String(ctx.args[3]) : null;
              ctx.setReturnValue(null);
              // Translating needs the plugin thread.
              setTimeout(() => void toggle(state, text, to, from), 0);
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
            if (!profiles.size || typeof ctx.args[0] !== 'string' || !chatlateSelected()) return;
            try {
              // AboutLinkCell retains its owning fragment even before it is attached.
              const fragment = ctx.thisObject?.getField('parentFragment');
              if (!fragment) return;
              const state = profiles.get(ownerOf(fragment));
              if (state?.text !== undefined && state.original === shown(ctx.args[0]))
                ctx.args[0] = state.text;
            } catch {
              /* unrelated cells keep their original text */
            }
          },
        },
      ),
    );
    // Invalidate synchronously; a response racing the deferred abort is discarded.
    disposers.push(
      inu.xposed.hookMethod(ProfileActivity.getDeclaredMethod('onFragmentDestroy'), {
        before(ctx) {
          const state = profiles.get(ownerOf(ctx.thisObject));
          if (state) forget(state);
        },
      }),
    );
  } catch {
    /* hosts without hooking keep Telegram's popup */
  }
  inu.onUnload?.(() => {
    disposed = true;
    for (const state of profiles.values()) state.controller?.abort();
    profiles.clear();
    for (const dispose of disposers) dispose();
  });
}

import { BANNER_BASE64, BANNER_BYTE_LENGTH } from './banner-data.js';
import { settingsBackground } from './native-style.js';
import { createExpansionIcon } from './native-icons.js';

/** Static 2:1 banner toggling the inline community links.
 * @param {() => void} invalidate
 * @param {() => void} onToggle
 */
export function createSettingsBanner(invalidate, onToggle) {
  let root, utilities, listenerClass, chevron, stripe, stripeText, glow;
  let updateInfo = { available: false, text: '', onClick: () => {} };
  let updateKey = '';
  let expanded = false;
  let dispose;
  let pending = false,
    disabled = false,
    revision = 0;
  let pulseState;

  function stopPulse(view) {
    if (pulseState?.view.call('equals', view)) {
      const animator = pulseState.animator;
      pulseState = undefined;
      animator.call('cancel');
    }
    view.call('setAlpha', 0);
  }

  function pulse(view) {
    try {
      stopPulse(view);
      const arrays = inu.jvm.cls('java.lang.reflect.Array');
      const values = arrays.callStatic(
        'newInstance',
        inu.jvm.cls('java.lang.Float').getStaticField('TYPE'),
        2,
      );
      arrays.callStatic('setFloat', values, 0, 0);
      arrays.callStatic('setFloat', values, 1, 0.65);
      const animation = inu.jvm
        .cls('android.animation.ObjectAnimator')
        .callStatic('ofFloat', view, 'alpha', values);
      animation.call('setDuration', 380);
      animation.call('setStartDelay', 250);
      animation.call('setRepeatMode', 2); // Two rises and falls of the light layer.
      animation.call('setRepeatCount', 3);
      animation.call(
        'setInterpolator',
        new (inu.jvm.cls('android.view.animation.AccelerateDecelerateInterpolator'))(),
      );
      view.call('setVisibility', 0);
      pulseState = { view, animator: animation };
      animation.call('start');
    } catch {
      view.call('setVisibility', 8);
    }
  }
  function reset() {
    const previous = dispose;
    root = undefined;
    dispose = undefined;
    pending = false;
    revision++;
    if (previous) {
      try {
        utilities.callStatic(
          'runOnUIThread',
          inu.jvm.runnable(() => {
            previous();
          }),
        );
      } catch {}
    }
  }
  return {
    reset,
    isPending: () => pending,
    getView: () => root,
    /** @param {boolean} nextExpanded
     * @param {{available: boolean, text: string, onClick: () => void}} update
     * @returns {inu.UIElement | null} */
    render(nextExpanded, update) {
      const changed = expanded !== nextExpanded;
      expanded = nextExpanded;
      const nextKey = update.available + ':' + update.text;
      const updateChanged = nextKey !== updateKey;
      const newlyAvailable = update.available && !updateInfo.available;
      updateInfo = update;
      updateKey = nextKey;
      if (disabled) return null;
      if (root) {
        if (changed || updateChanged) {
          const current = root;
          const requested = expanded;
          utilities.callStatic(
            'runOnUIThread',
            inu.jvm.runnable(() => {
              if (root !== current || expanded !== requested) return;
              chevron.call('setRotation', expanded ? 180 : 0);
              stripeText.call('setText', updateInfo.text);
              stripe.call('setVisibility', updateInfo.available ? 0 : 8);
              if (!updateInfo.available) {
                stopPulse(glow);
                glow.call('setVisibility', 8);
              } else if (newlyAvailable) pulse(glow);
            }),
          );
        }
        try {
          return inu.android.nativeView(root);
        } catch {
          disabled = true;
          reset();
          return null;
        }
      }
      if (!pending) {
        pending = true;
        const buildRevision = revision;
        try {
          utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
          const bitmapFactory = inu.jvm.cls('android.graphics.BitmapFactory');
          const base64 = inu.jvm.cls('android.util.Base64');
          utilities.callStatic(
            'runOnUIThread',
            inu.jvm.runnable(() => {
              if (revision !== buildRevision) return;
              try {
                const context = inu.jvm
                  .cls('org.telegram.messenger.ApplicationLoader')
                  .getStaticField('applicationContext');
                const layoutParams = inu.jvm.cls('android.widget.LinearLayout$LayoutParams');
                const group = new (inu.jvm.cls('android.widget.LinearLayout'))(context);
                group.call('setOrientation', 1);
                const artwork = new (inu.jvm.cls('android.widget.FrameLayout'))(context);
                artwork.call('setLayoutParams', new layoutParams(-1, -2));
                const image = new (inu.jvm.cls('android.widget.ImageView'))(context);
                // Inugram's normal native row supplies section insets, corners and transitions.
                settingsBackground(group, inu.jvm.cls('org.telegram.ui.ActionBar.Theme'));
                group.call('setImportantForAccessibility', 1);
                group.call('setContentDescription', 'Chatlate');
                image.call('setAdjustViewBounds', true);
                image.call(
                  'setScaleType',
                  inu.jvm.cls('android.widget.ImageView$ScaleType').getStaticField('FIT_CENTER'),
                );
                image.call(
                  'setLayoutParams',
                  new (inu.jvm.cls('android.widget.FrameLayout$LayoutParams'))(-1, -2),
                );
                const bytes = base64.callStatic('decode', BANNER_BASE64, 0);
                const bitmap = bitmapFactory.callStatic(
                  'decodeByteArray',
                  bytes,
                  0,
                  BANNER_BYTE_LENGTH,
                );
                if (!bitmap) throw new Error('Banner decoding failed');
                image.call('setImageBitmap', bitmap);
                try {
                  image.call('getDrawable').call('setFilterBitmap', true);
                } catch {}
                artwork.call('addView', image);
                chevron = createExpansionIcon(context, 0xffddd0fa | 0, utilities, expanded);
                const chevronParams = new (inu.jvm.cls('android.widget.FrameLayout$LayoutParams'))(
                  utilities.callStatic('dp', 20),
                  utilities.callStatic('dp', 20),
                  85,
                );
                chevronParams.call(
                  'setMargins',
                  0,
                  0,
                  utilities.callStatic('dp', 14),
                  utilities.callStatic('dp', 12),
                );
                chevron.call('setLayoutParams', chevronParams);
                artwork.call('addView', chevron);
                group.call('addView', artwork);
                const frameParams = inu.jvm.cls('android.widget.FrameLayout$LayoutParams');
                stripe = new (inu.jvm.cls('android.widget.FrameLayout'))(context);
                stripe.call(
                  'setLayoutParams',
                  new layoutParams(-1, utilities.callStatic('dp', 34)),
                );
                stripe.call('setBackgroundColor', 0xd929183f | 0);
                glow = new (inu.jvm.cls('android.view.View'))(context);
                glow.call('setLayoutParams', new frameParams(-1, -1));
                glow.call('setBackgroundColor', 0xffb792ff | 0);
                glow.call('setClickable', false);
                glow.call('setImportantForAccessibility', 2);
                glow.call('setVisibility', 8);
                glow.call('setAlpha', 0);
                stripe.call('addView', glow);
                const line = new (inu.jvm.cls('android.view.View'))(context);
                line.call(
                  'setLayoutParams',
                  new frameParams(-1, utilities.callStatic('dp', 1), 48),
                );
                line.call('setBackgroundColor', 0xffbca0ed | 0);
                stripe.call('addView', line);
                stripeText = new (inu.jvm.cls('android.widget.TextView'))(context);
                stripeText.call('setLayoutParams', new frameParams(-1, -1));
                stripeText.call('setGravity', 17);
                stripeText.call('setTextSize', 0, utilities.callStatic('dp', 14));
                stripeText.call('setSingleLine', true);
                stripeText.call('setTextColor', 0xfff1e6ff | 0);
                stripeText.call('setText', updateInfo.text);
                stripe.call('addView', stripeText);
                stripe.call('setVisibility', updateInfo.available ? 0 : 8);
                group.call('addView', stripe);
                if (updateInfo.available) pulse(glow);
                if (!listenerClass)
                  listenerClass = inu.jvm.defineClass({
                    interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
                    methods: {
                      onClick: {
                        params: ['android.view.View'],
                        returns: 'void',
                        body: (_self, view) => {
                          const anchor = root;
                          const isUpdate = view.call('equals', stripe);
                          if (isUpdate) stopPulse(glow);
                          const action = isUpdate ? updateInfo.onClick : onToggle;
                          setTimeout(() => {
                            if (anchor && root === anchor) action();
                          }, 0);
                        },
                      },
                    },
                  });
                group.call('setOnClickListener', new listenerClass());
                stripe.call('setOnClickListener', new listenerClass());
                stripe.call('setClickable', true);
                group.call('setClickable', true);
                group.call(
                  'setForeground',
                  inu.jvm
                    .cls('org.telegram.ui.ActionBar.Theme')
                    .callStatic('getSelectorDrawable', false),
                );
                const currentStripe = stripe;
                const currentGlow = glow;
                dispose = () => {
                  group.call('setOnClickListener', null);
                  currentStripe.call('setOnClickListener', null);
                  stopPulse(currentGlow);
                  currentGlow.call('setVisibility', 8);
                  image.call('setImageDrawable', null);
                };
                root = group;
              } catch {
                disabled = true;
              }
              pending = false;
              setTimeout(() => {
                if (revision === buildRevision) invalidate();
              }, 0);
            }),
          );
        } catch {
          disabled = true;
          pending = false;
        }
      }
      return null;
    },
  };
}

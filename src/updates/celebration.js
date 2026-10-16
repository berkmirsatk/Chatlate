/** Reuse the host's Premium-purchase confetti, on its UI thread.
 * @param {() => boolean} isActive
 */
export function celebrateUpdate(isActive) {
  try {
    const fragment = inu.android.getCurrentFragment();
    if (!fragment) return;
    inu.jvm.cls('org.telegram.messenger.AndroidUtilities').callStatic(
      'runOnUIThread',
      inu.jvm.runnable(() => {
        if (!isActive()) return;
        try {
          fragment.call('getParentActivity')?.call('getFireworksOverlay')?.call('start');
        } catch {
          /* A changed host animation must not interrupt update completion. */
        }
      }),
    );
  } catch {
    /* Native animation is optional on unsupported hosts. */
  }
}

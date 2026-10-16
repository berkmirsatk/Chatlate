let owners;
let nextOwner = 0;
const bindings = new Map();

/** Style the SDK's own formatted text cell, keeping its transparent background.
 * @param {TextWithEntities} content */
export function createChangelogText(content) {
  const owner = String(++nextOwner);
  let disposeHook, utilities, bound;
  let closed = false;
  const plain = (value) => (typeof value === 'string' ? value : value?.call('toString'));
  const headings = (content.entities || []).filter(
    (entity) =>
      entity._ === 'messageEntityBold' &&
      (entity.offset === 0 || content.text[entity.offset - 1] === '\n') &&
      (entity.offset + entity.length === content.text.length ||
        content.text[entity.offset + entity.length] === '\n'),
  );

  function restore(restoreText) {
    const previous = bound;
    bound = undefined;
    bindings.delete(owner);
    if (!previous) return;
    try {
      if (owners.call('get', previous.view) !== owner) return;
      owners.call('remove', previous.view);
      previous.view.call('setTextColor', previous.color);
      previous.view.call('setTextSize', 0, previous.size);
      if (restoreText && plain(previous.view.call('getText')) === content.text) {
        previous.view.call('setText', previous.text);
      }
    } catch {}
  }

  try {
    utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    owners ||= new (inu.jvm.cls('java.util.WeakHashMap'))();
    const cellClass = inu.jvm.cls('org.telegram.ui.Cells.TextInfoPrivacyCell');
    const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
    disposeHook = inu.xposed.hookMethod(cellClass.getDeclaredMethod('setText'), {
      after(ctx) {
        if (closed || ctx.throwable || !ctx.thisObject) return;
        try {
          const cell = ctx.thisObject;
          if (plain(ctx.args[0]) !== content.text) {
            if (bound?.cell.call('equals', cell)) restore(false);
            return;
          }
          if (bound && !bound.cell.call('equals', cell)) restore(true);
          const view = cell.call('getTextView');
          if (!bound) {
            const previous = bindings.get(owners.call('get', view));
            bound = {
              cell,
              view,
              color: previous?.color ?? view.call('getCurrentTextColor'),
              size: previous?.size ?? view.call('getTextSize'),
              text: view.call('getText'),
            };
            bindings.set(owner, bound);
          }
          owners.call('put', view, owner);
          view.call(
            'setTextColor',
            theme.callStatic(
              'getColor',
              theme.getStaticField('key_windowBackgroundWhiteBlackText'),
            ),
          );
          view.call('setTextSize', 16);
          const styled = new (inu.jvm.cls('android.text.SpannableStringBuilder'))(
            view.call('getText'),
          );
          const headingColor = theme.callStatic(
            'getColor',
            theme.getStaticField('key_windowBackgroundWhiteBlueText'),
          );
          for (const heading of headings) {
            const start = heading.offset,
              end = start + heading.length;
            styled.call(
              'setSpan',
              new (inu.jvm.cls('android.text.style.ForegroundColorSpan'))(headingColor),
              start,
              end,
              33,
            );
            styled.call(
              'setSpan',
              new (inu.jvm.cls('android.text.style.AbsoluteSizeSpan'))(18, true),
              start,
              end,
              33,
            );
            styled.call(
              'setSpan',
              new (inu.jvm.cls('android.text.style.StyleSpan'))(1),
              start,
              end,
              33,
            );
          }
          view.call('setText', styled);
        } catch {
          restore(true);
        }
      },
    });
  } catch {
    // Missing native styling never prevents reading the SDK-rendered notes.
  }

  return {
    item: () => inu.ui.separator(content),
    dispose() {
      if (closed) return;
      closed = true;
      disposeHook?.();
      try {
        utilities?.callStatic(
          'runOnUIThread',
          inu.jvm.runnable(() => restore(true)),
        );
      } catch {
        bindings.delete(owner);
        bound = undefined;
      }
    },
  };
}

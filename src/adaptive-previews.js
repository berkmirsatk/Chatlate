/** Adapt only this settings page's SDK value cells, preserving native icons and section shapes.
 * @param {(cell: JavaObject, enabled: boolean) => void} onSupportBind */
export function createAdaptivePreviews(onSupportBind) {
  let banner, models, cells, utilities, measureSpec;
  let disabled = false;
  let supportTitle = '';
  let supportVisible = false;
  const disposers = [];
  const plain = (value) => (typeof value === 'string' ? value : value?.call('toString') || '');
  function restore(cell, value) {
    const original = cell.getField('valueTextView'),
      preview = cell.getField('valueSpoilersTextView');
    preview.call('setScrollNonFitText', false);
    preview.call('resetScrolling');
    preview.call('setVisibility', 8);
    original.call('setText', value, false);
    original.call('setVisibility', 0);
  }
  function reset() {
    banner = undefined;
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {}
    }
    if (cells) {
      const previous = cells;
      try {
        utilities.callStatic(
          'runOnUIThread',
          inu.jvm.runnable(() => {
            const entries = previous.call('entrySet').call('iterator');
            while (entries.call('hasNext')) {
              const entry = entries.call('next');
              try {
                restore(entry.call('getKey'), entry.call('getValue'));
              } catch {}
            }
            previous.call('clear');
          }),
        );
      } catch {}
    }
    models = undefined;
    cells = undefined;
  }
  return {
    reset,
    /** @param {JavaObject | undefined} root */
    watch(root, title, visible) {
      banner = root;
      supportTitle = title;
      supportVisible = visible;
      if (!root || disabled || disposers.length) return;
      try {
        utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
        measureSpec = inu.jvm.cls('android.view.View$MeasureSpec');
        const weakMap = inu.jvm.cls('java.util.WeakHashMap');
        models = new weakMap();
        cells = new weakMap();
        const page = inu.jvm.cls('desu.inugram.ui.settings.PluginSettingsActivity');
        const factory = inu.jvm.cls('desu.inugram.ui.settings.ButtonCellFactory');
        const settingCell = inu.jvm.cls('desu.inugram.ui.settings.PluginSettingCell');
        disposers.push(
          inu.xposed.hookMethod(page.getDeclaredMethod('fillItems'), {
            after: (ctx) => {
              if (ctx.throwable || !banner || !models) return;
              try {
                const items = ctx.args[0],
                  count = Number(items.call('size'));
                let ownPage = false;
                for (let i = 0; i < count; i++) {
                  const view = items.call('get', i).getField('view');
                  if (view && view.call('equals', banner)) {
                    ownPage = true;
                    break;
                  }
                }
                if (!ownPage) return;
                for (let i = 0; i < count; i++) {
                  const item = items.call('get', i),
                    value = item.getField('textValue');
                  if (plain(value) || plain(item.getField('text')) === supportTitle) {
                    models.call('put', item, value);
                  }
                }
              } catch {}
            },
          }),
        );
        disposers.push(
          inu.xposed.hookMethod(factory.getDeclaredMethod('bindView'), {
            after: (ctx) => {
              if (ctx.throwable || !models || !cells) return;
              const cell = ctx.args[0],
                item = ctx.args[1];
              try {
                onSupportBind(
                  cell,
                  supportVisible &&
                    models.call('containsKey', item) &&
                    plain(item.getField('text')) === supportTitle,
                );
                if (!models.call('containsKey', item) || !plain(models.call('get', item))) {
                  if (cells.call('containsKey', cell)) {
                    restore(cell, item.getField('textValue'));
                    cells.call('remove', cell);
                  }
                  return;
                }
                const value = models.call('get', item);
                cells.call('put', cell, value);
                const original = cell.getField('valueTextView'),
                  preview = cell.getField('valueSpoilersTextView');
                original.call('setText', null, false);
                original.call('setVisibility', 8);
                preview.call('setText', value);
                preview.call('setVisibility', 0);
                preview.call('setScrollNonFitText', true);
              } catch {
                try {
                  restore(cell, item.getField('textValue'));
                  cells.call('remove', cell);
                } catch {}
              }
            },
          }),
        );
        disposers.push(
          inu.xposed.hookMethod(settingCell.getDeclaredMethod('onMeasure'), {
            after: (ctx) => {
              const cell = ctx.thisObject;
              if (ctx.throwable || !cell || !cells?.call('containsKey', cell)) return;
              try {
                const label = cell.getField('textView'),
                  preview = cell.getField('valueSpoilersTextView');
                const icon = cell.getField('imageView');
                const dp = (value) => Number(utilities.callStatic('dp', value));
                const start = dp(
                  icon.call('getVisibility') === 0
                    ? cell.getField('offsetFromImage')
                    : cell.getField('leftPadding'),
                );
                const end = dp(Math.max(0, Number(cell.getField('leftPadding')) - 6));
                const available = Math.max(
                  0,
                  Number(cell.call('getMeasuredWidth')) - start - end - dp(12),
                );
                const titleWidth = Math.ceil(
                  Number(label.call('getPaint').call('measureText', plain(label.call('getText')))),
                );
                const raw = cells.call('get', cell);
                const valueWidth = Math.ceil(
                  Number(preview.call('getPaint').call('measureText', plain(raw))),
                );
                const labelWidth = Math.min(
                  titleWidth,
                  Math.max(0, available - Math.min(valueWidth, dp(32))),
                );
                const previewWidth = Math.max(0, available - labelWidth);
                const exact = measureSpec.getStaticField('EXACTLY');
                const spec = (width) => measureSpec.callStatic('makeMeasureSpec', width, exact);
                label.call('measure', spec(labelWidth), spec(label.call('getMeasuredHeight')));
                const subtitle = cell.getField('subtitleView');
                subtitle.call(
                  'measure',
                  spec(labelWidth),
                  spec(subtitle.call('getMeasuredHeight')),
                );
                const overflow = valueWidth > previewWidth;
                preview.call('setScrollNonFitText', overflow);
                if (!overflow) preview.call('resetScrolling');
                preview.call(
                  'measure',
                  spec(previewWidth),
                  spec(preview.call('getMeasuredHeight')),
                );
              } catch {
                try {
                  restore(cell, cells.call('get', cell));
                  cells.call('remove', cell);
                } catch {}
              }
            },
          }),
        );
      } catch {
        reset();
        disabled = true;
      }
    },
  };
}

import { getProviderOrder } from './fallback.js';
import { createStatusRow } from './status-row.js';
import { put } from './storage.js';
import { t } from './i18n.js';

/**
 * @param {object} options
 * @param {import('./provider.js').Provider[]} options.providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} options.selection
 * @param {ReturnType<typeof import('./drag-list.js').createDragList>} options.dragList
 * @param {() => void} options.onSaved
 * @param {() => boolean} options.isBusy
 * @param {() => void} options.invalidate
 */
export function createProviderEditor({
  providers,
  selection,
  dragList,
  onSaved,
  isBusy,
  invalidate,
}) {
  let visible = false;
  let error = '';
  const statusRow = createStatusRow(() => {
    if (visible) invalidate();
  });
  const currentOrder = () => getProviderOrder(providers[selection.read().index], providers);

  /** @param {import('./provider.js').Provider[]} next */
  function save(next) {
    if (!visible || isBusy()) {
      if (visible) dragList.sync(currentOrder());
      return;
    }
    const primary = providers[selection.read().index];
    if (next[0] !== primary) {
      const outcome = selection.select(providers.indexOf(next[0]));
      if (outcome !== 'applied' && (outcome !== 'unavailable' || selection.read().available)) {
        error = t(outcome === 'inactive' ? 'selectInApp' : 'providerSyncFailed');
        dragList.sync(currentOrder());
        invalidate();
        return;
      }
    }
    put('fallback', JSON.stringify(next.map((item) => item.id)));
    const hadError = !!error;
    error = '';
    onSaved();
    const retained = dragList.sync(next);
    if (!retained || hadError) invalidate();
  }

  function reorder(ids) {
    const current = currentOrder();
    const byId = new Map(current.map((item) => [item.id, item]));
    if (
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id))
    ) {
      dragList.sync(current);
      return;
    }
    save(ids.map((id) => byId.get(id)));
  }

  function toggle(id) {
    const current = currentOrder();
    const item = providers.find((provider) => provider.id === id);
    if (!item || (current.includes(item) && current.length === 1)) {
      dragList.sync(current);
      return;
    }
    save(
      current.includes(item) ? current.filter((provider) => provider !== item) : [...current, item],
    );
  }

  function move(order, from, to) {
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    save(next);
  }

  return {
    setVisible(next) {
      visible = next;
      if (!next) {
        dragList.reset();
        statusRow.reset();
        error = '';
      }
    },
    items() {
      const order = currentOrder();
      const rows = [];
      const native = dragList.render(providers, order, reorder, toggle, () => {
        if (visible) invalidate();
      });
      // Prepare the native list while collapsed; never show temporary SDK rows
      // while its UI-thread construction is pending.
      if (!visible || (!native && dragList.isPending())) return [];
      if (native) rows.push(native);
      else {
        for (const [index, item] of order.entries()) {
          rows.push(
            inu.ui.button({
              id: 'order.' + item.id,
              text: `${index + 1}. ${item.name}`,
              onClick: (anchor) => {
                const actions = [];
                if (index > 0)
                  actions.push({
                    text: t('moveUp', { name: item.name }),
                    onClick: () => move(order, index, index - 1),
                  });
                if (index < order.length - 1)
                  actions.push({
                    text: t('moveDown', { name: item.name }),
                    onClick: () => move(order, index, index + 1),
                  });
                if (index > 0)
                  actions.push({
                    text: t('removeProvider', { name: item.name }),
                    onClick: () => save(order.filter((provider) => provider !== item)),
                  });
                if (actions.length) anchor.openMenu(actions);
              },
            }),
          );
        }
        for (const item of providers.filter((provider) => !order.includes(provider)))
          rows.push(
            inu.ui.button({
              id: 'add.' + item.id,
              text: t('addProvider', { name: item.name }),
              subtitle: item.id === 'deepl' ? t('deeplLimits') : undefined,
              onClick: () => save([...order, item]),
            }),
          );
      }
      if (error) rows.push(statusRow(error, false));
      return rows;
    },
  };
}

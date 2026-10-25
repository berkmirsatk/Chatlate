const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');

function chatRuntime(selected = 'installation:chatlate.google', options = {}) {
  const hooks = new Map();
  const opened = new Set();
  const resets = [];
  let hidden = false,
    detected = false,
    translating = false,
    visibility = 8,
    panelVisible;
  const config = {
    getValue: () => ({ contains: (part) => selected.includes(part) }),
    call: () => selected,
  };
  const controller = {
    currentAccount: 0,
    getField: () => 0,
    translatingDialogs: {
      get: () => (translating ? { booleanValue: () => true } : null),
    },
    isTranslatingDialog: () => translating,
    isTranslateDialogHidden: () => hidden,
    isDialogTranslatable() {
      const ctx = {
        thisObject: controller,
        args: [-1001],
        returnValue: detected,
        setReturnValue(value) {
          this.returnValue = value;
        },
      };
      hooks.get('isDialogTranslatable(J)Z').after(ctx);
      return ctx.returnValue;
    },
  };
  const chat = {
    translateButton: {},
    topPanelLayout: {
      isViewVisible: () => panelVisible ?? (!hidden && controller.isDialogTranslatable()),
    },
    translateItem: { setVisibility: (value) => (visibility = value) },
    getMessagesController: () => ({ getTranslateController: () => controller }),
    getDialogId: () => -1001,
  };
  const native = {
    onUnload() {},
    xposed: {
      // Exercise the bundled routine's logic; Android execution is checked on the phone.
      routine: (spec, captures) =>
        new Function(...spec.captures, `return (${spec.source})`)(...captures),
      hookMethod(method, hook) {
        if (method === options.failMethod) throw Error('unsupported method');
        hooks.set(method, { ...hooks.get(method), ...hook });
        return () => hooks.delete(method);
      },
    },
    jvm: {
      runnable: (fn) => fn,
      cls(name) {
        if (name === 'java.util.HashSet')
          return class {
            contains(key) {
              return opened.has(key);
            }
            call(method, key) {
              return method === 'add' ? opened.add(key) : opened.delete(key);
            }
          };
        return {
          getDeclaredMethod: (descriptor) => descriptor,
          getStaticField(field) {
            if (field === 'INSTANCE') return { resetForDialog: (id) => resets.push(id) };
            if (field === 'TRANSLATION_PROVIDER') return config;
            if (field === 'MAX_ACCOUNT_COUNT') return 0;
            throw Error(field);
          },
          callStatic(method, arg) {
            if (method === 'synchronizedSet') return arg;
            if (method === 'runOnUIThread') return arg();
            throw Error(method);
          },
        };
      },
    },
  };
  const plugin = harness(options.values ?? {}, undefined, 'en', native);
  if (!options.failMethod) assert.ok(hooks.has('updateTranslateItemVisibility'));
  return {
    resets,
    hooks,
    opened,
    storage: plugin.storage,
    open(id) {
      hooks
        .get('setHideTranslateDialog(JZZ)V')
        .before({ thisObject: controller, args: [id, false, false] });
    },
    stop() {
      hooks.get('toggleTranslatingDialog(JZ)Z').before({
        thisObject: controller,
        args: [-1001, false],
      });
      translating = false;
    },
    panel(value) {
      panelVisible = value;
      hooks.get('updateTopPanel(Z)V').after({ thisObject: chat });
      return visibility;
    },
    detect: () => (detected = true),
    translate: () => (translating = true),
    hide(value) {
      hooks.get('setHideTranslateDialog(JZZ)V').before({
        thisObject: controller,
        args: [-1001, value, false],
      });
      hidden = value;
      if (value) translating = false;
    },
    menu() {
      // Telegram updates its item before the plugin's after hook.
      visibility = hidden ? 0 : 8;
      hooks.get('updateTranslateItemVisibility').after({ thisObject: chat });
      return visibility;
    },
  };
}

test('Hide followed by Undo restores the bar without leaving Translate in the chat menu', () => {
  const chat = chatRuntime();
  chat.translate();
  assert.equal(chat.menu(), 8);
  chat.hide(true);
  assert.equal(chat.menu(), 0);
  chat.hide(false);
  assert.equal(chat.menu(), 8);
});

test('the chat menu offers Translate when no translation bar is available', () => {
  const chat = chatRuntime();
  assert.equal(chat.menu(), 0);
});

test('an available translation bar does not need an active translation to hide the menu item', () => {
  const chat = chatRuntime();
  chat.detect();
  assert.equal(chat.menu(), 8);
  chat.hide(true);
  assert.equal(chat.menu(), 0);
});

test("another translation service keeps Telegram's menu visibility rules", () => {
  const chat = chatRuntime('telegram');
  assert.equal(chat.menu(), 8);
  chat.hide(true);
  assert.equal(chat.menu(), 0);
  chat.hide(false);
  assert.equal(chat.menu(), 8);
});

test('a manually visible bar hides Translate even when the chat is not detected as translatable', () => {
  const chat = chatRuntime();
  assert.equal(chat.menu(), 0);
  assert.equal(chat.panel(true), 8);
  assert.equal(chat.menu(), 8);
  assert.equal(chat.panel(false), 0);
  assert.equal(chat.panel(true), 8);
});

test('showing originals clears manual translations only for the active chat', () => {
  const chat = chatRuntime();
  chat.stop();
  assert.deepEqual(chat.resets, []);
  chat.translate();
  chat.stop();
  assert.deepEqual(chat.resets, [-1001]);
  chat.stop();
  assert.deepEqual(chat.resets, [-1001]);
});

test('stopping another service leaves its manual translations untouched', () => {
  const chat = chatRuntime('telegram');
  chat.translate();
  chat.stop();
  assert.deepEqual(chat.resets, []);
});

test('remembered chat bars stay bounded in storage and native memory', async () => {
  const old = Array.from({ length: 205 }, (_, i) => '0:' + i);
  const chat = chatRuntime(undefined, { values: { openedChats: JSON.stringify(old) } });
  assert.equal(chat.opened.size, 200);
  assert.equal(chat.opened.has('0:0'), false);
  for (let id = 205; id < 410; id++) chat.open(id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(chat.opened.size, 200);
  assert.equal(chat.opened.has('0:409'), true);
  assert.equal(JSON.parse(chat.storage.get('chatlate.openedChats')).length, 200);
});

test('an unsupported chat method detaches partially registered translation hooks', () => {
  const chat = chatRuntime(undefined, { failMethod: 'updateTopPanel(Z)V' });
  for (const name of [
    'isLanguageRestricted(Ljava/lang/String;)Z',
    'isDialogTranslatable(J)Z',
    'toggleTranslatingDialog(JZ)Z',
    'setHideTranslateDialog(JZZ)V',
    'updateTranslateItemVisibility',
  ])
    assert.equal(chat.hooks.has(name), false);
});

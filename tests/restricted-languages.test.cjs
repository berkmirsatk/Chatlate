const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');

function chatRuntime(selected = 'installation:chatlate.google') {
  const hooks = new Map();
  const opened = new Set();
  let hidden = false,
    detected = false,
    translating = false,
    visibility = 8;
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
      hookMethod: (method, hook) => (hooks.set(method, hook), () => {}),
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
  harness({}, undefined, 'en', native);
  assert.ok(hooks.has('updateTranslateItemVisibility'));
  return {
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

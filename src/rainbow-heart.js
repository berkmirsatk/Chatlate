const HEART_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#ffffff" d="M12 21C10 19.5 2 14 2 8.5C2 5.2 4.5 3 7.4 3C9.4 3 10.9 4.1 12 5.9C13.1 4.1 14.6 3 16.6 3C19.5 3 22 5.2 22 8.5C22 14 14 19.5 12 21Z"/></svg>';

/** Neutral lighting survives rainbow tinting with MULTIPLY. Draw once on the UI thread. */
function shadedHeart(utilities) {
  const size = Number(utilities.callStatic('dp', 24)),
    unit = size / 24;
  const bitmap = inu.jvm
    .cls('android.graphics.Bitmap')
    .callStatic(
      'createBitmap',
      size,
      size,
      inu.jvm.cls('android.graphics.Bitmap$Config').getStaticField('ARGB_8888'),
    );
  bitmap.call('setDensity', utilities.callStatic('dp', 160));
  const canvas = new (inu.jvm.cls('android.graphics.Canvas'))(bitmap);
  const paint = new (inu.jvm.cls('android.graphics.Paint'))(1);
  const path = new (inu.jvm.cls('android.graphics.Path'))();
  const tile = inu.jvm.cls('android.graphics.Shader$TileMode').getStaticField('CLAMP');
  path.call('moveTo', 12 * unit, 21 * unit);
  path.call('cubicTo', 10 * unit, 19.5 * unit, 2 * unit, 14 * unit, 2 * unit, 8.5 * unit);
  path.call('cubicTo', 2 * unit, 5.2 * unit, 4.5 * unit, 3 * unit, 7.4 * unit, 3 * unit);
  path.call('cubicTo', 9.4 * unit, 3 * unit, 10.9 * unit, 4.1 * unit, 12 * unit, 5.9 * unit);
  path.call('cubicTo', 13.1 * unit, 4.1 * unit, 14.6 * unit, 3 * unit, 16.6 * unit, 3 * unit);
  path.call('cubicTo', 19.5 * unit, 3 * unit, 22 * unit, 5.2 * unit, 22 * unit, 8.5 * unit);
  path.call('cubicTo', 22 * unit, 14 * unit, 14 * unit, 19.5 * unit, 12 * unit, 21 * unit);
  path.call('close');
  paint.call('setShadowLayer', 0.8 * unit, 0, 0.8 * unit, 0x65000000 | 0);
  paint.call(
    'setShader',
    new (inu.jvm.cls('android.graphics.LinearGradient'))(
      5 * unit,
      3 * unit,
      17 * unit,
      21 * unit,
      -1,
      0xff666674 | 0,
      tile,
    ),
  );
  canvas.call('drawPath', path, paint);
  paint.call('clearShadowLayer');
  paint.call(
    'setShader',
    new (inu.jvm.cls('android.graphics.RadialGradient'))(
      7 * unit,
      6 * unit,
      9 * unit,
      0xb0ffffff | 0,
      0x00ffffff,
      tile,
    ),
  );
  canvas.call('drawPath', path, paint);
  return bitmap;
}

/** Animate only the bound support icon; Android computes colors without JS frame callbacks. */
export function createRainbowHeart() {
  let icon, current, listenerClass, utilities, bitmap;
  function stop(previous = current) {
    if (previous === current) current = undefined;
    if (!previous) return;
    previous.animator.call('cancel');
    if (current?.image.call('equals', previous.image)) return;
    try {
      const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
      previous.image.call(
        'setColorFilter',
        theme.callStatic('getColor', theme.getStaticField('key_windowBackgroundWhiteGrayIcon')),
      );
    } catch {}
  }
  return {
    icon() {
      try {
        return (icon ||= inu.icons.svg(HEART_SVG));
      } catch {
        return undefined;
      }
    },
    /** Called from this settings page's native cell binding hook.
     * @param {JavaObject} cell @param {boolean} enabled */
    bind(cell, enabled) {
      try {
        const image = cell.getField('imageView');
        if (!enabled) {
          if (current?.image.call('equals', image)) stop();
          return;
        }
        utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
        try {
          bitmap ||= shadedHeart(utilities);
          image.call('setImageBitmap', bitmap);
        } catch {
          /* The filled SVG remains a fallback without native shaders. */
        }
        if (current?.image.call('equals', image)) {
          current.animator.call('setCurrentPlayTime', current.animator.call('getCurrentPlayTime'));
          return;
        }
        stop();
        /** @type {any} */
        const arrays = inu.jvm.cls('java.lang.reflect.Array');
        /** @type {any} */
        const color = inu.jvm.cls('android.graphics.Color');
        const floatType = inu.jvm.cls('java.lang.Float').getStaticField('TYPE');
        const multiply = inu.jvm.cls('android.graphics.PorterDuff$Mode').getStaticField('MULTIPLY');
        const values = arrays.callStatic('newInstance', floatType, 2);
        arrays.callStatic('setFloat', values, 0, 0);
        arrays.callStatic('setFloat', values, 1, 1);
        const hsv = arrays.callStatic('newInstance', floatType, 3);
        arrays.callStatic('setFloat', hsv, 1, 0.65);
        arrays.callStatic('setFloat', hsv, 2, 0.95);
        if (!listenerClass)
          listenerClass = inu.jvm.defineClass({
            interfaces: [inu.jvm.cls('android.animation.ValueAnimator$AnimatorUpdateListener')],
            fields: {
              image: 'android.widget.ImageView',
              hsv: 'float[]',
              mode: 'android.graphics.PorterDuff$Mode',
            },
            methods: {
              onAnimationUpdate: {
                params: ['android.animation.ValueAnimator'],
                returns: 'void',
                body: inu.jvm.routine(function (animation) {
                  /** @type {any} */
                  const target = this;
                  arrays.setFloat(
                    target.hsv,
                    0,
                    (270.0 + animation.getAnimatedFraction() * 360.0) % 360.0,
                  );
                  target.image.setColorFilter(color.HSVToColor(target.hsv), target.mode);
                }),
              },
            },
          });
        const listener = new listenerClass();
        listener.setField('image', image);
        listener.setField('hsv', hsv);
        listener.setField('mode', multiply);
        const animator = inu.jvm
          .cls('android.animation.ValueAnimator')
          .callStatic('ofFloat', values);
        animator.call('setDuration', 4800);
        animator.call('setRepeatCount', -1);
        animator.call('setRepeatMode', 1);
        animator.call(
          'setInterpolator',
          new (inu.jvm.cls('android.view.animation.LinearInterpolator'))(),
        );
        animator.call('addUpdateListener', listener);
        current = { image, animator };
        animator.call('start');
      } catch {
        try {
          stop();
        } catch {}
      }
    },
    reset() {
      if (!current) return;
      const previous = current;
      current = undefined;
      try {
        utilities.callStatic(
          'runOnUIThread',
          inu.jvm.runnable(() => stop(previous)),
        );
      } catch {
        current = undefined;
      }
    },
  };
}

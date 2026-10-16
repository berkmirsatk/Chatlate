/** Fixed local flag drawings. Register new flag IDs here and in language-catalog.js. */
export const FLAG_DRAWERS = {
  gb({ canvas, paint, width, height, unit, stroke }) {
    canvas.call('drawColor', 0xff012169 | 0);
    paint.call('setStyle', stroke);
    paint.call('setColor', -1);
    paint.call('setStrokeWidth', 4 * unit);
    canvas.call('drawLine', 0, 0, width, height, paint);
    canvas.call('drawLine', width, 0, 0, height, paint);
    paint.call('setColor', 0xffc8102e | 0);
    paint.call('setStrokeWidth', 1.5 * unit);
    canvas.call('drawLine', 0, 0, width, height, paint);
    canvas.call('drawLine', width, 0, 0, height, paint);
    paint.call('setColor', -1);
    paint.call('setStrokeWidth', 6 * unit);
    canvas.call('drawLine', width / 2, 0, width / 2, height, paint);
    canvas.call('drawLine', 0, height / 2, width, height / 2, paint);
    paint.call('setColor', 0xffc8102e | 0);
    paint.call('setStrokeWidth', 3 * unit);
    canvas.call('drawLine', width / 2, 0, width / 2, height, paint);
    canvas.call('drawLine', 0, height / 2, width, height / 2, paint);
  },
  tr({ canvas, paint, height, unit, fill }) {
    const red = 0xffe30a17 | 0;
    canvas.call('drawColor', red);
    paint.call('setStyle', fill);
    paint.call('setColor', -1);
    canvas.call('drawCircle', 9 * unit, height / 2, 4.5 * unit, paint);
    paint.call('setColor', red);
    canvas.call('drawCircle', 10.3 * unit, height / 2, 3.7 * unit, paint);
    const star = new (inu.jvm.cls('android.graphics.Path'))();
    for (let point = 0; point < 10; point++) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const radius = (point % 2 ? 1.25 : 3) * unit;
      star.call(
        point === 0 ? 'moveTo' : 'lineTo',
        16.5 * unit + Math.cos(angle) * radius,
        height / 2 + Math.sin(angle) * radius,
      );
    }
    star.call('close');
    paint.call('setColor', -1);
    canvas.call('drawPath', star, paint);
  },
};

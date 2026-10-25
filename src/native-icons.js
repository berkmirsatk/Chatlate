// Share a small bitmap cache across controls; do not redraw unchanged icons.
const bitmaps = new Map();

/** Shared circle and stroke for all controls. Runs on the UI thread.
 * @param {'chevron' | 'plus' | 'minus' | 'reorder' | 'warning'} kind
 */
function drawIcon(kind, color, utilities) {
  const size = Number(utilities.callStatic('dp', 20));
  const key = `${kind}:${color}:${size}`;
  if (bitmaps.has(key)) return bitmaps.get(key);
  const unit = size / 20;
  const bitmap = inu.jvm
    .cls('android.graphics.Bitmap')
    .callStatic(
      'createBitmap',
      size,
      size,
      inu.jvm.cls('android.graphics.Bitmap$Config').getStaticField('ARGB_8888'),
    );
  const canvas = new (inu.jvm.cls('android.graphics.Canvas'))(bitmap);
  const paint = new (inu.jvm.cls('android.graphics.Paint'))(1);
  paint.call('setColor', color);
  paint.call('setStyle', inu.jvm.cls('android.graphics.Paint$Style').getStaticField('STROKE'));
  paint.call('setStrokeWidth', 1.5 * unit);
  if (kind === 'reorder') {
    for (const y of [6, 10, 14])
      canvas.call('drawLine', 4 * unit, y * unit, 16 * unit, y * unit, paint);
  } else {
    canvas.call('drawCircle', size / 2, size / 2, 9 * unit, paint);
    if (kind === 'chevron') {
      const path = new (inu.jvm.cls('android.graphics.Path'))();
      path.call('moveTo', 6 * unit, 8 * unit);
      path.call('lineTo', 10 * unit, 12 * unit);
      path.call('lineTo', 14 * unit, 8 * unit);
      canvas.call('drawPath', path, paint);
    } else if (kind === 'warning') {
      canvas.call('drawLine', 10 * unit, 5 * unit, 10 * unit, 11 * unit, paint);
      canvas.call('drawCircle', 10 * unit, 14 * unit, 0.7 * unit, paint);
    } else {
      canvas.call('drawLine', 6 * unit, 10 * unit, 14 * unit, 10 * unit, paint);
      if (kind === 'plus')
        canvas.call('drawLine', 10 * unit, 6 * unit, 10 * unit, 14 * unit, paint);
    }
  }
  bitmaps.set(key, bitmap);
  if (bitmaps.size > 16) bitmaps.delete(bitmaps.keys().next().value);
  return bitmap;
}

/** Draw a centered expansion control using the shared provider-icon geometry. */
export function createExpansionIcon(context, color, utilities, expanded) {
  const view = new (inu.jvm.cls('android.widget.ImageView'))(context);
  setCustomIcon(view, 'chevron', color, utilities);
  view.call('setRotation', expanded ? 180 : 0);
  return view;
}

/** Apply Chatlate’s shared custom style, independent of the app icon pack.
 * @param {'chevron' | 'plus' | 'minus' | 'reorder' | 'warning'} kind
 */
export function setCustomIcon(view, kind, color, utilities) {
  view.call('setImageBitmap', drawIcon(kind, color, utilities));
}

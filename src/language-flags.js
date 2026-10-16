import { LANGUAGES } from './language-catalog.js';
import { FLAG_DRAWERS } from './flags.js';

/** Locally drawn flags; no supplementary Unicode or remote image dependency. */
export function createLanguageLabels(context, utilities) {
  const width = Number(utilities.callStatic('dp', 24));
  const height = Number(utilities.callStatic('dp', 16));
  const unit = width / 24;
  const bitmapClass = inu.jvm.cls('android.graphics.Bitmap');
  const config = inu.jvm.cls('android.graphics.Bitmap$Config').getStaticField('ARGB_8888');
  const direction = inu.jvm.cls('android.graphics.Path$Direction').getStaticField('CW');
  const stroke = inu.jvm.cls('android.graphics.Paint$Style').getStaticField('STROKE');
  const fill = inu.jvm.cls('android.graphics.Paint$Style').getStaticField('FILL');
  const labels = [];
  for (const language of LANGUAGES) {
    const bitmap = bitmapClass.callStatic('createBitmap', width, height, config);
    const canvas = new (inu.jvm.cls('android.graphics.Canvas'))(bitmap);
    const paint = new (inu.jvm.cls('android.graphics.Paint'))(1);
    const clip = new (inu.jvm.cls('android.graphics.Path'))();
    clip.call('addRoundRect', 0, 0, width, height, 3 * unit, 3 * unit, direction);
    canvas.call('clipPath', clip);
    FLAG_DRAWERS[language.flag]({ canvas, paint, width, height, unit, stroke, fill });
    const drawable = new (inu.jvm.cls('android.graphics.drawable.BitmapDrawable'))(
      context.call('getResources'),
      bitmap,
    );
    drawable.call('setBounds', 0, 0, width, height);
    const span = new (inu.jvm.cls('android.text.style.ImageSpan'))(drawable, 2);
    const label = new (inu.jvm.cls('android.text.SpannableString'))('\uFFFC  ' + language.name);
    label.call('setSpan', span, 0, 1, 33);
    labels.push(label);
  }
  return labels;
}

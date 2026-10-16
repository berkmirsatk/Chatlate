/** Match native settings cells; Inugram clips the outer adapter row to its section shape. */
export function settingsBackground(view, theme) {
  view.call(
    'setBackgroundColor',
    theme.callStatic('getColor', theme.getStaticField('key_windowBackgroundWhite')),
  );
  view.call('setClipToOutline', false);
  view.call('setClipChildren', true);
}

/** Native TextCell previews use 16 dp, without Android TextView's sp conversion. */
export function previewTextSize(view, utilities) {
  view.call('setTextSize', 0, utilities.callStatic('dp', 16));
}

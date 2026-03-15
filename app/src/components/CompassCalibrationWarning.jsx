/**
 * Compact warning shown when compass calibration quality is 'poor'.
 * Dark themed for the instrument panel.
 */
export default function CompassCalibrationWarning() {
  return (
    <div
      role="alert"
      className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg p-2.5 text-xs leading-snug text-center"
    >
      Compass may be inaccurate. Move away from metal or calibrate with a figure-8 motion.
    </div>
  );
}

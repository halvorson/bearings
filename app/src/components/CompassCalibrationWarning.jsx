/**
 * Amber warning banner shown when compass calibration quality is 'poor'.
 */
export default function CompassCalibrationWarning() {
  return (
    <div
      role="alert"
      className="bg-amber-50 text-amber-800 rounded p-3 text-sm leading-snug"
    >
      Compass may be inaccurate. Try moving away from metal objects or calibrate
      by moving your phone in a figure-8.
    </div>
  );
}

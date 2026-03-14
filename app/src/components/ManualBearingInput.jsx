/**
 * Numeric bearing input fallback for devices without compass support.
 *
 * Props:
 *   value    {number|string} — current bearing value (0–360)
 *   onChange {function}      — called with the new numeric value
 */
export default function ManualBearingInput({ value, onChange }) {
  return (
    <div className="flex flex-col items-center gap-3 w-full px-4">
      <label
        htmlFor="manual-bearing"
        className="text-sm text-gray-300 text-center"
      >
        Enter bearing (degrees from north)
      </label>
      <input
        id="manual-bearing"
        type="number"
        min={0}
        max={360}
        step={1}
        value={value === null || value === undefined ? '' : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
          } else {
            const num = Number(raw);
            if (!isNaN(num)) onChange(num);
          }
        }}
        className="
          w-40 text-center text-4xl font-bold
          bg-gray-800 text-white
          border-2 border-gray-600 rounded-xl
          py-3 px-2
          focus:outline-none focus:border-blue-500
          min-h-[56px]
        "
        placeholder="0"
        aria-label="Bearing in degrees"
      />
      {value !== null && value !== undefined && (
        <p className="text-2xl font-semibold text-white">{Math.round(value)}&deg;</p>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { formatError, copyErrorToClipboard } from '../lib/errors.js';

const DISMISS_MS = 6000;

export default function Toast({ toast, onDismiss }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isDev = import.meta.env.DEV;
  const message = isDev
    ? formatError(toast.error)
    : 'Connection issue. Retrying...';

  const handleCopy = async () => {
    await copyErrorToClipboard(toast.error);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      role="alert"
      className="w-full max-w-sm bg-red-900 text-white rounded-lg shadow-lg p-3 flex items-start gap-2"
    >
      <div className="flex-1 text-sm break-words whitespace-pre-wrap">
        {message}
      </div>
      <div className="flex-shrink-0 flex gap-1">
        {isDev && (
          <button
            type="button"
            onClick={handleCopy}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-xs font-medium px-2"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-xs font-medium px-2"
        >
          X
        </button>
      </div>
    </div>
  );
}

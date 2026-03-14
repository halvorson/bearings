/**
 * Format an error for display.
 * In dev: full message, stack trace, Firestore path, and request details.
 * In prod: generic safe message.
 */
export const formatError = (error) => {
  if (!import.meta.env.DEV) {
    return 'Something went wrong. Please refresh the page.';
  }

  const parts = [];

  if (error?.message) {
    parts.push(`Message: ${error.message}`);
  }

  if (error?.code) {
    parts.push(`Code: ${error.code}`);
  }

  // Firestore-specific fields
  if (error?.path) {
    parts.push(`Firestore path: ${error.path}`);
  }

  if (error?.customData?.serverResponse) {
    parts.push(`Server response: ${error.customData.serverResponse}`);
  }

  if (error?.stack) {
    parts.push(`Stack:\n${error.stack}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : String(error);
};

/**
 * Format an error and copy it to the clipboard.
 * Returns a Promise that resolves when the copy is complete.
 */
export const copyErrorToClipboard = async (error) => {
  const text = formatError(error);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for environments where clipboard API is unavailable
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
};

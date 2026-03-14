export const track = (event, params = {}) => {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', event, params);
};

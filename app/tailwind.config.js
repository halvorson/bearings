/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      // Mobile-first: all tap targets >= 44x44px
      minHeight: {
        'tap': '44px'
      },
      minWidth: {
        'tap': '44px'
      },
      // Safe area insets for notched devices
      padding: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      }
    }
  },
  plugins: []
};

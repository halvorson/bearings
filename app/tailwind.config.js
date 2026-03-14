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
      }
    }
  },
  plugins: []
};

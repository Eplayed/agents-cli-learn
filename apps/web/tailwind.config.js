/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: '#7c5cff',
        panel: {
          light: '#ffffff',
          dark: '#121a2b',
        },
      },
    },
  },
  plugins: [],
}

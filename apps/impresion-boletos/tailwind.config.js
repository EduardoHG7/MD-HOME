/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f0ff',
          100: '#ede5ff',
          200: '#dcceff',
          300: '#c4a8ff',
          400: '#a87aff',
          500: '#8b4cf7',
          600: '#7c3aed',
          700: '#6822d4',
          800: '#561cae',
          900: '#48198c',
          950: '#2d0d5e',
        },
      },
    },
  },
  plugins: [],
}

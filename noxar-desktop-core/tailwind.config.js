/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.js"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7b2cbf',
          hover: '#9d4edd'
        },
        darkbg: '#0d0d14',
        darkcard: '#151522',
        accent: '#00f5ff'
      }
    }
  },
  plugins: []
}

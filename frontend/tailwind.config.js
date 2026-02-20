/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      colors: {
        bank: {
          50: 'var(--bank-50)',
          100: 'var(--bank-100)',
          200: 'var(--bank-200)',
          300: 'var(--bank-300)',
          400: 'var(--bank-400)',
          500: 'var(--bank-500)',
          600: 'var(--bank-600)',
          700: 'var(--bank-700)',
          800: 'var(--bank-800)',
          900: 'var(--bank-900)',
        }
      }
    },
  },
  plugins: [],
}

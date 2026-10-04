const c = (v) => `rgb(var(--${v}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        line: c('line'),
        text: c('text'),
        muted: c('muted'),
        brand: c('brand'),
        brandink: c('brand-ink'),
        brandsoft: c('brand-soft'),
        gold: c('gold'),
        danger: c('danger'),
        ok: c('ok'),
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

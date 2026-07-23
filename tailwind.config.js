/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        scc: {
          orange: '#E87722', orangeDk: '#C9631A',
          dark: 'rgb(var(--c-head) / <alpha-value>)',
          bg: 'rgb(var(--c-bg) / <alpha-value>)',
          card: 'rgb(var(--c-card) / <alpha-value>)',
          border: 'rgb(var(--c-border) / <alpha-value>)',
          borderLt: 'rgb(var(--c-borderlt) / <alpha-value>)',
          text: 'rgb(var(--c-text) / <alpha-value>)',
          muted: 'rgb(var(--c-muted) / <alpha-value>)',
          green: '#2F9E44', amber: '#E8920C', red: '#E03131', teal: '#0C8599', purple: '#6741D9'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: { card: '0 1px 3px rgba(27,33,43,0.08), 0 1px 2px rgba(27,33,43,0.04)' }
    }
  },
  plugins: []
};

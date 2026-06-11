/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts,css}'],
  theme: {
    extend: {
      colors: {
        primary: '#ff7830',
        'bg-dark': '#121212',
        'bg-darker': '#0a0a0a',
        'surface': '#1a1a1a',
        'border-subtle': 'rgba(255, 120, 48, 0.08)',
      },
      fontFamily: {
        mono: ['SF Mono', 'Consolas', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}

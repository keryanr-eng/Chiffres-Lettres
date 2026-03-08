import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          500: '#38bdf8',
          600: '#0ea5e9',
        },
      },
      boxShadow: {
        card: '0 10px 40px rgba(2, 6, 23, 0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;

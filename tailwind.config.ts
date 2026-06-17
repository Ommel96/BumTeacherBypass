import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8ec',
          100: '#f9efd0',
          200: '#f3da9e',
          300: '#edc367',
          400: '#e6ab3e',
          500: '#d4892a',
          600: '#b8860b',
          700: '#996a0a',
          800: '#7b550e',
          900: '#654612',
        },
      },
      fontFamily: {
        serif: ['Crimson Pro', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
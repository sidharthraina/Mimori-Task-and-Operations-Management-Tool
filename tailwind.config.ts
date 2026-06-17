import type { Config } from 'tailwindcss'

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
          50:  '#fdf6ee',
          100: '#f9e8cf',
          200: '#f2ce9c',
          300: '#e9ad62',
          400: '#e0903a',
          500: '#d6721e',  // primary – warm coffee orange
          600: '#bc591a',
          700: '#9a4219',
          800: '#7c361d',
          900: '#652e1a',
        },
        dark: {
          900: '#1a120b',
          800: '#2c1a0e',
          700: '#3d2314',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config

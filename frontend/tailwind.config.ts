import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#050805',
          panel: '#0b0f0b',
          green: '#7ed957',
          greenDark: '#4c9a2a'
        }
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7ed957 0%, #4c9a2a 100%)'
      }
    }
  },
  plugins: []
} satisfies Config;

import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#030605',
          panel: '#071009',
          green: '#00ff88',
          greenDark: '#00b35f',
          cyan: '#00d9ff',
          danger: '#ff1744',
          amber: '#ffb020'
        },
        ink: {
          900: '#030605',
          800: '#071009',
          700: '#0b1710',
          600: '#12241a'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #00ff88 0%, #00d9ff 100%)',
        'hud-grid':
          'linear-gradient(rgba(0,255,136,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.045) 1px, transparent 1px)'
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(0,255,136,0.25), 0 0 24px -6px rgba(0,255,136,0.45)',
        'neon-cyan': '0 0 0 1px rgba(0,217,255,0.25), 0 0 24px -6px rgba(0,217,255,0.45)',
        'neon-danger': '0 0 0 1px rgba(255,23,68,0.35), 0 0 28px -4px rgba(255,23,68,0.5)'
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2.2)', opacity: '0' }
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '45%': { opacity: '0.55' },
          '50%': { opacity: '1' },
          '55%': { opacity: '0.7' }
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 1px)' },
          '40%': { transform: 'translate(2px, -1px)' },
          '60%': { transform: 'translate(-1px, -2px)' },
          '80%': { transform: 'translate(1px, 2px)' }
        },
        'sweep-x': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' }
        }
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
        scanline: 'scanline 6s linear infinite',
        flicker: 'flicker 4s ease-in-out infinite',
        glitch: 'glitch 0.28s steps(2) 2',
        'sweep-x': 'sweep-x 2.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
} satisfies Config;

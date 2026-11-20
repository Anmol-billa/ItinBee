import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#FCFCFA',
          subtle: '#F5F5F2',
          elevated: '#FFFFFF',
          muted: '#EFECE6',
        },
        line: {
          DEFAULT: '#E7E5E0',
          strong: '#D6D3CD',
        },
        ink: {
          DEFAULT: '#18181B',
          secondary: '#57534E',
          tertiary: '#655F5B',
        },
        honey: {
          DEFAULT: '#D97706',
          deep: '#B45309',
          darker: '#92400E',
          wash: '#FEF3C7',
        },
        jade: {
          DEFAULT: '#0F766E',
          wash: '#F0FDFA',
        },
      },
      fontFamily: {
        sans: ['var(--font-public-sans)', 'var(--font-devanagari)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        devanagari: ['var(--font-devanagari)', 'var(--font-public-sans)', 'sans-serif'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem' }],     // 11px
        compact: ['0.75rem', { lineHeight: '1.125rem' }],   // 12px
        ui: ['0.8125rem', { lineHeight: '1.25rem' }],       // 13px
        body: ['0.875rem', { lineHeight: '1.375rem' }],     // 14px
      },
      boxShadow: {
        panel: '0 2px 8px -2px rgba(24, 24, 27, 0.05), 0 1px 2px 0 rgba(24, 24, 27, 0.03)',
        dialog: '0 18px 42px -10px rgba(24, 24, 27, 0.14), 0 4px 12px -2px rgba(24, 24, 27, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;

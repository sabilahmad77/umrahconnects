import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Body / UI — Inter
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        // Headings — Manrope
        heading: ['var(--font-manrope)', 'Manrope', 'system-ui', 'sans-serif'],
        // Arabic companion — IBM Plex Sans Arabic
        arabic: ['var(--font-arabic)', 'IBM Plex Sans Arabic', 'sans-serif'],
      },
      colors: {
        // CSS-variable semantic tokens (shadcn/ui pattern)
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Umrah Connect — Deep Umrah Green (primary)
        brand: {
          50:  '#E7EFEC',
          100: '#CDE0DA',
          200: '#A7C7BE',
          300: '#6FA197',
          400: '#357A6E',
          500: '#0F3D37',  // Deep Umrah Green — primary
          600: '#0B2E2A',
          700: '#081F1C',
          800: '#061513',
          900: '#030A09',
        },
        // Gold Accent
        gold: {
          50:  '#F7F1E4',
          100: '#EFE3C7',
          200: '#E2CE9F',
          300: '#D4B97A',
          400: '#CDB074',
          500: '#C8A96B',  // Gold Accent
          600: '#A8894B',
          700: '#876B36',
          800: '#5E4A25',
          900: '#3A2E17',
        },
        // Emerald + Navy + warm surfaces
        emerald: { DEFAULT: '#2A7A6B', 500: '#2A7A6B', 600: '#216154' },
        navy:    { DEFAULT: '#112234', 500: '#112234' },
        sandstone: '#E8DFD1',
        ivory:     '#F8F5EF',
        // Saudi green retained as alias of brand
        saudi: {
          50:  '#E7EFEC', 100: '#CDE0DA', 200: '#A7C7BE', 300: '#6FA197',
          400: '#357A6E', 500: '#0F3D37', 600: '#0B2E2A', 700: '#081F1C',
          800: '#061513', 900: '#030A09',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F4F6',
        surface: '#FFFFFF',
        borderLight: '#EBEBEF',
        obsidian: '#121214',
        obsidianDark: '#0D0D0F',
        obsidianBorder: '#27272A',
        brandOrange: '#FF5A1F',
        brandOrangeLight: '#F97316',
        brandOrangeTint: '#FFF3ED',
        brandOrangeDark: '#C2410C',
        brandMint: '#34D399',
        brandMintDark: '#064E3B',
        brandMintLight: '#D1FAE5',
        brandZinc: '#52525B',
        brandInk: '#111111',
        brandMuted: '#6B7280',
        brandCaption: '#9CA3AF',
        // Preserve institutional colors for backward compatibility
        institutional: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
          navy: '#1E293B',
          navyDark: '#0F172A',
          emerald: '#15803D',
          emeraldHover: '#166534',
          amber: '#B45309',
          amberBg: '#FEF3C7',
          textPrimary: '#0F172A',
          textSecondary: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        bento: '0 4px 20px -2px rgba(17, 17, 17, 0.04)',
        bentoHover: '0 8px 30px -4px rgba(17, 17, 17, 0.08)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
};

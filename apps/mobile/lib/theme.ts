// ─────────────────────────────────────────────────────────────────────────────
// Umrah Connect — Brand Design Tokens (implements the official Brand Identity Kit)
//   Deep Umrah Green  #0F3D37  (primary)
//   Gold Accent       #C8A96B  (accent)
//   Emerald Accent    #2A7A6B
//   Midnight Navy     #112234
//   Sandstone         #E8DFD1
//   Ivory Mist        #F8F5EF  (app background)
//   Slate Border      #D9D7D0
//   Text Primary      #1A1F23   Text Secondary #5E6974
//   Success #1E8E5A · Warning #C98A13 · Error #B54747 · Info #2D6CDF
// Typography: Manrope (headings) · Inter (body/UI) · IBM Plex Sans Arabic
// ─────────────────────────────────────────────────────────────────────────────

export const brand = {
  green:      '#0F3D37', // Deep Umrah Green — primary
  greenDark:  '#0B2E2A',
  greenDeep:  '#081F1C',
  gold:       '#C8A96B', // Gold Accent
  goldDark:   '#A8894B',
  emerald:    '#2A7A6B', // Emerald Accent
  navy:       '#112234', // Midnight Navy
  sandstone:  '#E8DFD1',
  ivory:      '#F8F5EF', // app background
  slate:      '#D9D7D0', // border
  textPrimary:   '#1A1F23',
  textSecondary: '#5E6974',
};

export const colors = {
  // ── brand primary (Deep Umrah Green) ──
  brand50:  '#E7EFEC',
  brand100: '#CDE0DA',
  brand200: '#A7C7BE',
  brand300: '#6FA197',
  brand400: '#357A6E',
  brand500: '#0F3D37', // primary
  brand600: '#0B2E2A',
  brand700: '#081F1C',

  // ── gold accent ──
  gold50:  '#F7F1E4',
  gold100: '#EFE3C7',
  gold500: '#C8A96B',
  gold600: '#A8894B',
  gold700: '#876B36',

  // ── emerald / navy / surfaces ──
  emerald:   '#2A7A6B',
  navy:      '#112234',
  sandstone: '#E8DFD1',
  ivory:     '#F8F5EF',

  // ── status: green (success / active) ──
  green50:  '#E6F4EC',
  green500: '#1E8E5A',
  green600: '#177A4C',
  green700: '#11603C',

  // ── status: blue (info) ──
  blue50:  '#E6EEFB',
  blue500: '#2D6CDF',
  blue600: '#2156B8',
  blue700: '#1A4493',

  // ── status: amber (warning) ──
  yellow50:  '#FBF1DC',
  yellow500: '#C98A13',
  yellow600: '#A6710F',

  // ── status: red (error) ──
  red50:  '#F7E7E7',
  red500: '#B54747',
  red600: '#9A3A3A',

  // ── purple (kept for variety / transport) ──
  purple50:  '#EFEAF6',
  purple500: '#6E59A5',
  purple600: '#574689',

  // ── neutrals (warm, brand-aligned) ──
  gray50:  '#F8F5EF', // Ivory Mist — app background
  gray100: '#EFEBE3', // warm hairline / chip bg
  gray200: '#D9D7D0', // Slate Border
  gray300: '#C4C2BB',
  gray400: '#9A9790',
  gray500: '#5E6974', // Text Secondary
  gray600: '#4A535C',
  gray700: '#363D44',
  gray800: '#252A30',
  gray900: '#1A1F23', // Text Primary
  white: '#ffffff',
  black: '#000000',
};

// Font family names — resolved by expo-font load in app/_layout.tsx
export const font = {
  heading:        'Manrope_700Bold',
  headingSemi:    'Manrope_600SemiBold',
  headingMedium:  'Manrope_500Medium',
  body:           'Inter_400Regular',
  bodyMedium:     'Inter_500Medium',
  bodySemi:       'Inter_600SemiBold',
  bodyBold:       'Inter_700Bold',
  arabic:         'IBMPlexSansArabic_400Regular',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
};

// Premium soft shadow used on cards (matches reference depth)
export const shadow = {
  card: {
    shadowColor: '#0F3D37',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F3D37',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

export const fmtSAR = (cents?: number | null) =>
  cents != null
    ? `SAR ${(Number(cents) / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })}`
    : '—';

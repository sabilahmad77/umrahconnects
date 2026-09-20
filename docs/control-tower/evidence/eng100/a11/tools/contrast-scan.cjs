// Static contrast scan: every className that sets a text colour and a background
// colour on the same element is checked against WCAG 1.4.3 (4.5:1, or 3:1 for
// large text). Catches states the crawl never rendered (rare statuses).
const fs = require('fs');
const path = require('path');

const TW = {
  red: { 50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C', 800: '#991B1B', 900: '#7F1D1D' },
  yellow: { 50: '#FEFCE8', 100: '#FEF9C3', 200: '#FEF08A', 600: '#CA8A04', 700: '#A16207', 800: '#854D0E', 900: '#713F12' },
  amber: { 50: '#FFFBEB', 100: '#FEF3C7', 200: '#FDE68A', 600: '#D97706', 700: '#B45309', 800: '#92400E', 900: '#78350F' },
  green: { 50: '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0', 600: '#16A34A', 700: '#15803D', 800: '#166534', 900: '#14532D' },
  emerald: { 50: '#ECFDF5', 100: '#D1FAE5', 600: '#059669', 700: '#047857', 800: '#065F46' },
  blue: { 50: '#EFF6FF', 100: '#DBEAFE', 600: '#2563EB', 700: '#1D4ED8', 800: '#1E40AF' },
  indigo: { 50: '#EEF2FF', 100: '#E0E7FF', 600: '#4F46E5', 700: '#4338CA' },
  purple: { 50: '#FAF5FF', 100: '#F3E8FF', 600: '#9333EA', 700: '#7E22CE' },
  orange: { 50: '#FFF7ED', 100: '#FFEDD5', 600: '#EA580C', 700: '#C2410C' },
  sky: { 50: '#F0F9FF', 100: '#E0F2FE', 600: '#0284C7', 700: '#0369A1' },
  gray: { 50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF', 500: '#6B7280', 600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827' },
  slate: { 50: '#F8FAFC', 100: '#F1F5F9', 600: '#475569', 700: '#334155', 800: '#1E293B' },
  brand: { 50: '#E7EFEC', 100: '#CDE0DA', 200: '#A7C7BE', 300: '#6FA197', 400: '#357A6E', 500: '#0F3D37', 600: '#0B2E2A', 700: '#081F1C', 800: '#061513', 900: '#030A09' },
  saudi: { 50: '#E7EFEC', 100: '#CDE0DA', 200: '#A7C7BE', 300: '#6FA197', 400: '#357A6E', 500: '#0F3D37', 600: '#0B2E2A', 700: '#081F1C', 800: '#061513', 900: '#030A09' },
  gold: { 50: '#F7F1E4', 100: '#EFE3C7', 200: '#E2CE9F', 300: '#D4B97A', 400: '#CDB074', 500: '#C8A96B', 600: '#A8894B', 700: '#876B36', 800: '#5E4A25', 900: '#3A2E17' },
  white: { DEFAULT: '#FFFFFF' },
  ivory: { DEFAULT: '#F8F5EF' },
  sandstone: { DEFAULT: '#E8DFD1' },
  navy: { DEFAULT: '#112234', 500: '#112234' },
  midnight: { DEFAULT: '#0B1622' },
  emeraldc: {},
};

const hex = (token) => {
  const m = /^(?:text|bg)-([a-z]+)(?:-(\d{2,3}))?$/.exec(token);
  if (!m) return null;
  const [, name, shade] = m;
  const family = TW[name];
  if (!family) return null;
  return family[shade ?? 'DEFAULT'] ?? null;
};
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const root = process.argv[2] || '/Users/macbook/Projects/umrah-connects-eng100/a11/apps/web';
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
for (const d of ['app', 'components']) walk(path.join(root, d));

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    // Class groups: a run of classes inside one quoted string / template chunk.
    for (const chunk of line.split(/['"`]/)) {
      const tokens = chunk.split(/\s+/).filter(Boolean);
      const bgs = tokens.filter((t) => /^bg-/.test(t)).map(hex).filter(Boolean);
      const fgs = tokens.filter((t) => /^text-/.test(t)).map(hex).filter(Boolean);
      if (!bgs.length || !fgs.length) continue;
      const large = /text-(lg|xl|2xl|3xl|4xl|5xl)\b/.test(chunk) || /font-bold/.test(chunk) && /text-(lg|xl)/.test(chunk);
      for (const bg of bgs)
        for (const fg of fgs) {
          const r = ratio(fg, bg);
          const need = large ? 3 : 4.5;
          if (r < need) findings.push({ file: path.relative(root, file), line: i + 1, fg, bg, ratio: Number(r.toFixed(2)), need, snippet: chunk.trim().slice(0, 120) });
        }
    }
  });
}
findings.sort((a, b) => a.ratio - b.ratio);
console.log(JSON.stringify({ count: findings.length, findings }, null, 1));

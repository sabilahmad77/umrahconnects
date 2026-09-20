/**
 * Regression guards for the WCAG 2.2 AA defects the A11 audit fixed. The suite
 * has no DOM, so the behavioural helper is exercised with plain objects and the
 * rest are checked where they actually live: in the source and the stylesheet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tablistKeys } from '../components/ui/tablist';

const WEB = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(WEB, relative), 'utf8');

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(WEB, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (/\.tsx?$/.test(entry.name)) out.push({ file: relative, text: read(relative) });
    }
  };
  walk('app');
  walk('components');
  return out;
}

// ─── The tab strips answer to the arrow keys (2.1.1) ─────────────────────────

function fakeTab(name: string) {
  const calls: string[] = [];
  const tab = {
    name,
    calls,
    hasAttribute: () => false,
    getAttribute: () => null,
    focus() {
      calls.push('focus');
      (globalThis as any).document.activeElement = tab;
    },
    click() {
      calls.push('click');
    },
  };
  return tab;
}

function pressKey(key: string, tabs: ReturnType<typeof fakeTab>[], focused: number | null) {
  (globalThis as any).document = { activeElement: focused === null ? null : tabs[focused] };
  let defaultPrevented = false;
  const event = {
    key,
    currentTarget: { querySelectorAll: () => tabs },
    preventDefault: () => {
      defaultPrevented = true;
    },
  };
  tablistKeys().onKeyDown(event as never);
  const active = (globalThis as any).document.activeElement;
  return { defaultPrevented, focused: active ? tabs.indexOf(active) : -1 };
}

describe('hand-rolled tab strips are operable with the keyboard', () => {
  it('moves to the next tab and activates it on ArrowRight', () => {
    const tabs = [fakeTab('one'), fakeTab('two'), fakeTab('three')];
    const result = pressKey('ArrowRight', tabs, 0);
    expect(result.focused).toBe(1);
    expect(tabs[1].calls).toEqual(['focus', 'click']);
    expect(result.defaultPrevented).toBe(true);
  });

  it('wraps around on ArrowLeft and jumps with Home and End', () => {
    const tabs = [fakeTab('one'), fakeTab('two'), fakeTab('three')];
    expect(pressKey('ArrowLeft', tabs, 0).focused).toBe(2);
    expect(pressKey('End', tabs, 0).focused).toBe(2);
    expect(pressKey('Home', tabs, 2).focused).toBe(0);
  });

  it('leaves other keys and unrelated focus alone', () => {
    const tabs = [fakeTab('one'), fakeTab('two')];
    expect(pressKey('Enter', tabs, 0).defaultPrevented).toBe(false);
    expect(pressKey('ArrowRight', tabs, null).defaultPrevented).toBe(false);
    expect(tabs.every((tab) => tab.calls.length === 0)).toBe(true);
  });

  it('follows a vertical strip with the up and down keys', () => {
    const tabs = [fakeTab('one'), fakeTab('two')];
    (globalThis as any).document = { activeElement: tabs[0] };
    const event = { key: 'ArrowDown', currentTarget: { querySelectorAll: () => tabs }, preventDefault: () => {} };
    tablistKeys('vertical').onKeyDown(event as never);
    expect(tabs[1].calls).toEqual(['focus', 'click']);
  });

  it('is wired into every tab strip in the app', () => {
    const missing = sources()
      .filter(({ file }) => file !== 'components/ui/tablist.ts')
      .filter(({ text }) => text.includes('role="tablist"'))
      .filter(({ text }) => !text.includes('tablistKeys()'))
      .map(({ file }) => file);
    expect(missing).toEqual([]);
  });
});

// ─── Contrast of every colour pair written in the markup (1.4.3) ─────────────

const PALETTE: Record<string, Record<string, string>> = {
  red: { 50: '#FEF2F2', 100: '#FEE2E2', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C', 800: '#991B1B' },
  yellow: { 50: '#FEFCE8', 100: '#FEF9C3', 600: '#CA8A04', 700: '#A16207', 800: '#854D0E' },
  amber: { 50: '#FFFBEB', 100: '#FEF3C7', 600: '#D97706', 700: '#B45309', 800: '#92400E', 900: '#78350F' },
  green: { 50: '#F0FDF4', 100: '#DCFCE7', 600: '#16A34A', 700: '#15803D', 800: '#166534' },
  emerald: { 50: '#ECFDF5', 100: '#D1FAE5', 600: '#059669', 700: '#047857' },
  blue: { 50: '#EFF6FF', 100: '#DBEAFE', 600: '#2563EB', 700: '#1D4ED8' },
  indigo: { 50: '#EEF2FF', 100: '#E0E7FF', 600: '#4F46E5', 700: '#4338CA' },
  purple: { 50: '#FAF5FF', 100: '#F3E8FF', 600: '#9333EA', 700: '#7E22CE' },
  orange: { 50: '#FFF7ED', 100: '#FFEDD5', 600: '#EA580C', 700: '#C2410C' },
  sky: { 50: '#F0F9FF', 100: '#E0F2FE', 600: '#0284C7', 700: '#0369A1' },
  gray: { 50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF', 500: '#6B7280', 600: '#4B5563', 700: '#374151', 800: '#1F2937', 900: '#111827' },
  brand: { 50: '#E7EFEC', 100: '#CDE0DA', 200: '#A7C7BE', 300: '#6FA197', 400: '#357A6E', 500: '#0F3D37', 600: '#0B2E2A', 700: '#081F1C', 800: '#061513', 900: '#030A09' },
  saudi: { 50: '#E7EFEC', 100: '#CDE0DA', 200: '#A7C7BE', 300: '#6FA197', 400: '#357A6E', 500: '#0F3D37', 600: '#0B2E2A', 700: '#081F1C' },
  gold: { 50: '#F7F1E4', 100: '#EFE3C7', 200: '#E2CE9F', 300: '#D4B97A', 400: '#CDB074', 500: '#C8A96B', 600: '#A8894B', 700: '#876B36', 800: '#5E4A25', 900: '#3A2E17' },
  white: { DEFAULT: '#FFFFFF' },
  ivory: { DEFAULT: '#F8F5EF' },
  sandstone: { DEFAULT: '#E8DFD1' },
  navy: { DEFAULT: '#112234', 500: '#112234' },
  midnight: { DEFAULT: '#0B1622' },
};

function colour(token: string): string | null {
  const match = /^(?:text|bg)-([a-z]+)(?:-(\d{2,3}))?$/.exec(token);
  if (!match) return null;
  return PALETTE[match[1]]?.[match[2] ?? 'DEFAULT'] ?? null;
}

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('text keeps its contrast against the surface it is painted on', () => {
  it('has no class pair below 4.5:1', () => {
    const failures: string[] = [];
    for (const { file, text } of sources()) {
      text.split('\n').forEach((line, index) => {
        for (const chunk of line.split(/['"`]/)) {
          const tokens = chunk.split(/\s+/).filter(Boolean);
          const backgrounds = tokens.filter((t) => t.startsWith('bg-')).map(colour).filter(Boolean) as string[];
          const foregrounds = tokens.filter((t) => t.startsWith('text-')).map(colour).filter(Boolean) as string[];
          for (const background of backgrounds)
            for (const foreground of foregrounds) {
              const ratio = contrast(foreground, background);
              if (ratio < 4.5) failures.push(`${file}:${index + 1} ${foreground} on ${background} = ${ratio.toFixed(2)}:1`);
            }
        }
      });
    }
    expect(failures).toEqual([]);
  });
});

// ─── Focus indicators and control boundaries survive in the stylesheet ───────

describe('keyboard focus stays visible', () => {
  const css = read('app/globals.css');

  it('draws the brand outline on form controls even where outline-none is set', () => {
    expect(css).toMatch(/input:focus-visible[\s\S]{0,140}outline: 2px solid #357A6E/);
    expect(css).toContain('textarea:focus-visible');
    expect(css).toContain('select:focus-visible');
  });

  it('draws an outline on menu items, whose tint alone is not a focus indicator', () => {
    expect(css).toMatch(/\.uc-menu-item:focus-visible\s*\{[^}]*outline: 2px solid #357A6E/);
  });

  it('switches to the gold outline on the deep-green surfaces', () => {
    expect(css).toMatch(/aside :focus-visible[\s\S]{0,120}outline-color: #D4B97A/);
  });

  it('keeps a field boundary that reaches 3:1 against the card behind it', () => {
    expect(css).toMatch(/\.uc-control \{[^}]*border-gray-500/);
    expect(contrast('#6B7280', '#FFFFFF')).toBeGreaterThan(3);
  });
});

// ─── ARIA attributes only where they are allowed (4.1.2) ────────────────────

describe('ARIA names are attached to elements that can carry them', () => {
  it('never labels a generic span or div', () => {
    const offenders: string[] = [];
    for (const { file, text } of sources())
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/<(span|div)\b[^>]*aria-label=/g)) {
          const tag = line.slice(match.index, line.indexOf('>', match.index) + 1) || line.slice(match.index);
          if (!/\brole=/.test(tag)) offenders.push(`${file}:${index + 1} ${tag.slice(0, 80)}`);
        }
      });
    expect(offenders).toEqual([]);
  });

  it('names the notification popover, which is a dialog', () => {
    expect(read('components/notifications/notification-bell.tsx')).toMatch(/Popover\.Content[^>]*aria-label="Notifications"/);
  });

  it('keeps the account menu out of modal mode, so the workspace is not hidden from assistive technology', () => {
    expect(read('components/layout/header.tsx')).toContain('<Dropdown.Root modal={false}>');
  });
});

// ─── Focus survives a busy action and a page with no controls (2.4.3, 2.1.1) ─

describe('focus is never left nowhere', () => {
  it('takes focus back when a busy button stops being busy', () => {
    const system = read('components/ui/system.tsx');
    // The button is still disabled while busy (no double submission) …
    expect(system).toContain('disabled={disabled || busy}');
    // … and the browser's focus fixup is undone once the action finishes.
    expect(system).toContain('hadFocus.current = true');
    expect(system).toMatch(/if \(node\.current && \(!active \|\| active === document\.body\)\) node\.current\.focus\(\);/);
  });

  it('gives a scrolling page with nothing focusable a tab stop of its own', () => {
    const shell = read('components/layout/workspace-shell.tsx');
    expect(shell).toContain('main.tabIndex = scrolls && !focusable ? 0 : -1');
    expect(shell).toContain("mutations.observe(main, { childList: true, subtree: true })");
  });
});

// ─── Charts publish their numbers as text (1.1.1) ───────────────────────────

describe('charts are not the only carrier of their data', () => {
  it('marks the drawing decorative and lists the values for assistive technology', () => {
    const view = read('components/reports/reports-view.tsx');
    expect(view).toContain('function ChartFigure');
    expect(view).toMatch(/<div aria-hidden="true">\{children\}<\/div>/);
    expect(view).toContain('<figcaption className="sr-only">');
    expect(view.match(/<ChartFigure /g)?.length).toBe(3);
  });
});

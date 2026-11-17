export type ThemeMode = 'dark' | 'light';

export const DARK = {
  background:    '#0F1117',
  card:          '#1A1D2E',
  text:          '#FFFFFF',
  textSecondary: '#8B8FA8',
  grid:          '#2A2D3E',
  inputBg:       '#252836',
  expense:       '#FF6B6B',
  expenseBg:     '#2D1818',
};

export const LIGHT: typeof DARK = {
  background:    '#F0F2F8',
  card:          '#FFFFFF',
  text:          '#1A1D2E',
  textSecondary: '#6B7280',
  grid:          '#E2E6F0',
  inputBg:       '#F5F7FB',
  expense:       '#E05555',
  expenseBg:     '#FDE8E8',
};

export type Colors = typeof DARK;

export const DEFAULT_ACCENT = '#00D4AA';

export const ACCENT_OPTIONS: { hex: string; name: string }[] = [
  { hex: '#00D4AA', name: 'Teal'    },
  { hex: '#7DD3C8', name: 'Água'    },
  { hex: '#93C5FD', name: 'Azul'    },
  { hex: '#C4B5FD', name: 'Lilás'   },
  { hex: '#F9A8D4', name: 'Rosa'    },
  { hex: '#FCA5A5', name: 'Coral'   },
  { hex: '#6EE7B7', name: 'Menta'   },
  { hex: '#FDBA74', name: 'Pêssego' },
  { hex: '#FCD34D', name: 'Âmbar'   },
];

export const PENDING_COLOR   = '#F5A623';
export const DELIVERED_COLOR = '#2ECC71';
export const WARN            = '#F5A623';

const CACHE_KEY = 'stokai:theme';

/** Escreve as cores como variáveis CSS no <html> e guarda no localStorage (evita "piscar" ao abrir). */
export function applyTheme(theme: ThemeMode, accent: string) {
  const c = theme === 'dark' ? DARK : LIGHT;
  const root = document.documentElement;
  const vars: Record<string, string> = {
    '--bg': c.background, '--card': c.card, '--text': c.text, '--text2': c.textSecondary,
    '--grid': c.grid, '--input': c.inputBg, '--expense': c.expense, '--expense-bg': c.expenseBg,
    '--accent': accent,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = theme;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.background);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ theme, accent })); } catch {}
}

/** Script inline executado antes da página pintar (ver app/layout.tsx). */
export const THEME_BOOT_SCRIPT = `
try {
  var t = JSON.parse(localStorage.getItem('${CACHE_KEY}') || '{}');
  var light = t.theme === 'light';
  var c = light ? ${JSON.stringify(LIGHT)} : ${JSON.stringify(DARK)};
  var r = document.documentElement.style;
  r.setProperty('--bg', c.background); r.setProperty('--card', c.card); r.setProperty('--text', c.text);
  r.setProperty('--text2', c.textSecondary); r.setProperty('--grid', c.grid); r.setProperty('--input', c.inputBg);
  r.setProperty('--expense', c.expense); r.setProperty('--expense-bg', c.expenseBg);
  r.setProperty('--accent', t.accent || '${DEFAULT_ACCENT}');
  r.colorScheme = light ? 'light' : 'dark';
} catch (e) {}
`;

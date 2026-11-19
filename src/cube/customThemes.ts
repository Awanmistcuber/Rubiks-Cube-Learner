import { readCookie, writeCookie } from './dailyChallenge';
import { THEMES } from './themes';
import type { FaceKey, ThemeId, ThemePalette } from './types';

export interface CustomThemeRecord {
  id: string;
  name: string;
  baseThemeId: ThemeId;
  accentHex: string;
  chassisHex: string;
  faceHexColors: Record<FaceKey, string>;
  createdAt: number;
}

export interface StickerFaceMeta {
  key: FaceKey;
  notation: string;
  label: string;
}

export const STICKER_FACES: StickerFaceMeta[] = [
  { key: 'py', notation: 'U', label: 'Top (U)' },
  { key: 'ny', notation: 'D', label: 'Bottom (D)' },
  { key: 'pz', notation: 'F', label: 'Front (F)' },
  { key: 'nz', notation: 'B', label: 'Back (B)' },
  { key: 'px', notation: 'R', label: 'Right (R)' },
  { key: 'nx', notation: 'L', label: 'Left (L)' },
];

export interface FigmaStarterPalette {
  id: string;
  name: string;
  subtitle: string;
  baseThemeId: ThemeId;
  accentHex: string;
  chassisHex: string;
  faceHexColors: Record<FaceKey, string>;
}

export const FIGMA_STARTER_PALETTES: FigmaStarterPalette[] = [
  {
    id: 'figma-ui',
    name: 'Figma Spectrum',
    subtitle: 'Design Tokens',
    baseThemeId: 'monolith',
    accentHex: '#A259FF',
    chassisHex: '#18191E',
    faceHexColors: {
      py: '#F8FAFC',
      ny: '#FFCE2E',
      pz: '#0ACF83',
      nz: '#1ABCFE',
      px: '#F24E1E',
      nx: '#A259FF',
    },
  },
  {
    id: 'bauhaus-swiss',
    name: 'Swiss Bauhaus',
    subtitle: 'Editorial Primary',
    baseThemeId: 'atelier',
    accentHex: '#D9381E',
    chassisHex: '#1C1C1E',
    faceHexColors: {
      py: '#FAF8F5',
      ny: '#EAB308',
      pz: '#15803D',
      nz: '#1D4ED8',
      px: '#D9381E',
      nx: '#EA580C',
    },
  },
  {
    id: 'tokyo-matcha',
    name: 'Tokyo Matcha',
    subtitle: 'Botanical Soft',
    baseThemeId: 'pastel',
    accentHex: '#4D7C5D',
    chassisHex: '#F4F1EA',
    faceHexColors: {
      py: '#FDFBF7',
      ny: '#F2D06B',
      pz: '#7BB686',
      nz: '#5B86A9',
      px: '#E2858E',
      nx: '#E9A16B',
    },
  },
  {
    id: 'dieter-braun',
    name: 'Braun Atelier',
    subtitle: 'Industrial Matte',
    baseThemeId: 'graphite',
    accentHex: '#E86100',
    chassisHex: '#222428',
    faceHexColors: {
      py: '#ECEAE4',
      ny: '#D9A726',
      pz: '#3B7A57',
      nz: '#36628A',
      px: '#C93B2B',
      nx: '#E86100',
    },
  },
];

export const CUSTOM_THEMES_STORAGE_KEY = 'kubi_custom_themes_v1';
export const ACTIVE_THEME_COOKIE_KEY = 'kubi_theme';
export const ACTIVE_CUSTOM_COOKIE_KEY = 'kubi_custom_theme_active';

/**
 * Validates and normalizes any #RGB or #RRGGBB hex color string to uppercase #RRGGBB.
 */
export function normalizeHexColor(input: string, fallback: string): string {
  const clean = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const expanded = clean
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  return fallback.toUpperCase();
}

export function hexToNumber(hex: string): number {
  const normalized = normalizeHexColor(hex, '#FFFFFF');
  return parseInt(normalized.slice(1), 16);
}

export function numberToHex(num: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.round(num)));
  return `#${clamped.toString(16).padStart(6, '0').toUpperCase()}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex, '#E04F26');
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Computes accessible foreground text color (#FFFFFF or #141517) against a hex background
 * using relative sRGB luminance.
 */
export function getContrastForeground(hex: string): '#FFFFFF' | '#141517' {
  const normalized = normalizeHexColor(hex, '#16161A');
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.46 ? '#141517' : '#FFFFFF';
}

export function sanitizeThemeName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return cleaned;
}

/**
 * Extracts editable face hex colors from any ThemePalette.
 */
export function extractFaceHexColors(palette: ThemePalette): Record<FaceKey, string> {
  return {
    py: numberToHex(palette.scene.faceColors.py),
    ny: numberToHex(palette.scene.faceColors.ny),
    pz: numberToHex(palette.scene.faceColors.pz),
    nz: numberToHex(palette.scene.faceColors.nz),
    px: numberToHex(palette.scene.faceColors.px),
    nx: numberToHex(palette.scene.faceColors.nx),
  };
}

/**
 * Synthesizes a complete ThemePalette from a saved CustomThemeRecord, preserving
 * the base studio lighting and UI legibility while injecting custom stickers, chassis, and accent.
 */
export function buildThemePaletteFromCustom(record: CustomThemeRecord): ThemePalette {
  const base = THEMES[record.baseThemeId] ?? THEMES.atelier;
  const accentHex = normalizeHexColor(record.accentHex, base.ui.accent);
  const chassisHex = normalizeHexColor(record.chassisHex, numberToHex(base.scene.chassisColor));

  const faceColors: Record<FaceKey, number> = {
    py: hexToNumber(record.faceHexColors.py),
    ny: hexToNumber(record.faceHexColors.ny),
    pz: hexToNumber(record.faceHexColors.pz),
    nz: hexToNumber(record.faceHexColors.nz),
    px: hexToNumber(record.faceHexColors.px),
    nx: hexToNumber(record.faceHexColors.nx),
  };

  return {
    ...base,
    id: record.id,
    name: sanitizeThemeName(record.name) || 'Custom Palette',
    tag: 'Custom Figma',
    isCustom: true,
    ui: {
      ...base.ui,
      accent: accentHex,
      accentFg: getContrastForeground(accentHex),
      accentSoft: hexToRgba(accentHex, base.isDark ? 0.18 : 0.12),
      swatchPreview: [
        normalizeHexColor(record.faceHexColors.pz, base.ui.swatchPreview[0]),
        normalizeHexColor(record.faceHexColors.px, base.ui.swatchPreview[1]),
        accentHex,
      ],
    },
    scene: {
      ...base.scene,
      chassisColor: hexToNumber(chassisHex),
      particleColor: hexToNumber(accentHex),
      faceColors,
    },
  };
}

export function resolveThemePalette(
  activeThemeKey: string,
  customThemes: CustomThemeRecord[]
): ThemePalette {
  if (activeThemeKey in THEMES) {
    return THEMES[activeThemeKey as ThemeId];
  }
  const found = customThemes.find((t) => t.id === activeThemeKey);
  if (found) {
    return buildThemePaletteFromCustom(found);
  }
  return THEMES.atelier;
}

const VALID_BASE_THEMES = new Set<ThemeId>(['atelier', 'monolith', 'pastel', 'graphite']);

function isValidCustomThemeRecord(item: unknown): item is CustomThemeRecord {
  if (!item || typeof item !== 'object') return false;
  const r = item as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return false;
  if (!VALID_BASE_THEMES.has(r.baseThemeId as ThemeId)) return false;
  if (typeof r.accentHex !== 'string' || typeof r.chassisHex !== 'string') return false;
  if (!r.faceHexColors || typeof r.faceHexColors !== 'object') return false;
  const faces = r.faceHexColors as Record<string, unknown>;
  return STICKER_FACES.every((f) => typeof faces[f.key] === 'string');
}

export function loadCustomThemes(): CustomThemeRecord[] {
  const collected: CustomThemeRecord[] = [];
  const seenIds = new Set<string>();

  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isValidCustomThemeRecord(item) && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            collected.push(item);
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  // Fallback recovery from lightweight active custom theme cookie
  const cookieRaw = readCookie(ACTIVE_CUSTOM_COOKIE_KEY);
  if (cookieRaw) {
    try {
      const parsed = JSON.parse(cookieRaw);
      if (isValidCustomThemeRecord(parsed) && !seenIds.has(parsed.id)) {
        collected.push(parsed);
      }
    } catch {
      // ignore malformed cookie
    }
  }

  return collected;
}

export function saveCustomThemes(
  themes: CustomThemeRecord[],
  activeThemeKey?: string
): void {
  const trimmed = themes.slice(0, 16);
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage restrictions
  }

  // Mirror active custom theme into cookie so reloads preserve custom palette reliably
  const activeCustom = trimmed.find((t) => t.id === activeThemeKey) ?? trimmed[0];
  if (activeCustom) {
    writeCookie(ACTIVE_CUSTOM_COOKIE_KEY, JSON.stringify(activeCustom));
  }
}

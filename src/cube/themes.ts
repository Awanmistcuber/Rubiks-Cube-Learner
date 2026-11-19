import type { ThemeId, ThemePalette } from './types';

export const THEMES: Record<ThemeId, ThemePalette> = {
  atelier: {
    id: 'atelier',
    name: 'Atelier Light',
    tag: 'Swiss Studio',
    isDark: false,
    ui: {
      bg: '#F3F1EC',
      surface: 'rgba(255, 255, 255, 0.96)',
      surfaceSubtle: 'rgba(241, 239, 233, 0.98)',
      surfaceHover: 'rgba(232, 229, 221, 0.98)',
      border: 'rgba(22, 22, 26, 0.11)',
      text: '#16161A',
      muted: '#5F5E58',
      accent: '#E04F26',
      accentFg: '#FFFFFF',
      accentSoft: 'rgba(224, 79, 38, 0.11)',
      shadow: '0 14px 36px rgba(22, 22, 26, 0.08), 0 2px 6px rgba(22, 22, 26, 0.04)',
      swatchPreview: ['#F3F1EC', '#16161A', '#E04F26'],
    },
    scene: {
      background: 0xf3f1ec,
      fogColor: 0xf3f1ec,
      fogDensity: 0.015,
      keyLightColor: 0xfff8ee,
      keyLightIntensity: 1.85,
      hemiSkyColor: 0xe8effa,
      hemiGroundColor: 0xcfc9bc,
      hemiIntensity: 0.78,
      rimLightColor: 0xdbeafe,
      rimLightIntensity: 1.0,
      chassisColor: 0x16171b,
      chassisRoughness: 0.58,
      chassisMetalness: 0.14,
      coreMetalColor: 0xc9cdd4,
      tileRoughness: 0.18,
      tileMetalness: 0.02,
      tileClearcoat: 0.8,
      mirrorColor: 0xd8dce3,
      mirrorAccentColor: 0x9aa3b2,
      particleColor: 0xe04f26,
      ringColor: 0xd0cbc0,
      shadowOpacity: 0.28,
      faceColors: {
        py: 0xf7f7f4, // Crisp Ceramic White (U)
        ny: 0xebb600, // Rich Speedcube Yellow (D)
        pz: 0x008f4c, // Vivid WCA Green (F)
        nz: 0x0e4ec7, // Deep Cobalt Blue (B)
        px: 0xc91e1e, // Flagship Crimson Red (R)
        nx: 0xeb5a10, // Signal WCA Orange (L)
      },
    },
  },

  monolith: {
    id: 'monolith',
    name: 'Monolith Dark',
    tag: 'Obsidian Pro',
    isDark: true,
    ui: {
      bg: '#101114',
      surface: 'rgba(22, 24, 29, 0.96)',
      surfaceSubtle: 'rgba(30, 33, 40, 0.98)',
      surfaceHover: 'rgba(40, 44, 54, 0.98)',
      border: 'rgba(255, 255, 255, 0.1)',
      text: '#F4F5F7',
      muted: '#989EA9',
      accent: '#3B82F6',
      accentFg: '#FFFFFF',
      accentSoft: 'rgba(59, 130, 246, 0.16)',
      shadow: '0 18px 44px rgba(0, 0, 0, 0.52), 0 2px 8px rgba(0, 0, 0, 0.3)',
      swatchPreview: ['#101114', '#1E2128', '#3B82F6'],
    },
    scene: {
      background: 0x101114,
      fogColor: 0x101114,
      fogDensity: 0.018,
      keyLightColor: 0xfff5e8,
      keyLightIntensity: 2.0,
      hemiSkyColor: 0xa4bef2,
      hemiGroundColor: 0x1c1e26,
      hemiIntensity: 0.7,
      rimLightColor: 0x60a5fa,
      rimLightIntensity: 1.35,
      chassisColor: 0x111216,
      chassisRoughness: 0.52,
      chassisMetalness: 0.25,
      coreMetalColor: 0x94a3b8,
      tileRoughness: 0.16,
      tileMetalness: 0.04,
      tileClearcoat: 0.88,
      mirrorColor: 0xcbd5e1,
      mirrorAccentColor: 0x64748b,
      particleColor: 0x60a5fa,
      ringColor: 0x262a34,
      shadowOpacity: 0.48,
      faceColors: {
        py: 0xf1f4f8,
        ny: 0xf0be0c,
        pz: 0x059652,
        nz: 0x1d56d4,
        px: 0xd42222,
        nx: 0xed6014,
      },
    },
  },

  pastel: {
    id: 'pastel',
    name: 'Bento Pastel',
    tag: 'Soft Tactile',
    isDark: false,
    ui: {
      bg: '#EBF0F5',
      surface: 'rgba(255, 255, 255, 0.96)',
      surfaceSubtle: 'rgba(237, 242, 248, 0.98)',
      surfaceHover: 'rgba(225, 234, 244, 0.98)',
      border: 'rgba(26, 38, 56, 0.1)',
      text: '#1A2433',
      muted: '#5D6C80',
      accent: '#2D6CDF',
      accentFg: '#FFFFFF',
      accentSoft: 'rgba(45, 108, 223, 0.12)',
      shadow: '0 14px 34px rgba(26, 36, 51, 0.08), 0 2px 6px rgba(26, 36, 51, 0.04)',
      swatchPreview: ['#EBF0F5', '#E88B84', '#2D6CDF'],
    },
    scene: {
      background: 0xebf0f5,
      fogColor: 0xebf0f5,
      fogDensity: 0.018,
      keyLightColor: 0xfffaf2,
      keyLightIntensity: 2.2,
      hemiSkyColor: 0xf0f6ff,
      hemiGroundColor: 0xd2dce8,
      hemiIntensity: 1.15,
      rimLightColor: 0xbfdbfe,
      rimLightIntensity: 1.1,
      chassisColor: 0xf7f8fa,
      chassisRoughness: 0.72,
      chassisMetalness: 0.04,
      coreMetalColor: 0x94a3b8,
      tileRoughness: 0.34,
      tileMetalness: 0.0,
      tileClearcoat: 0.35,
      mirrorColor: 0xe6d7cf, // Rose champagne anodized aluminum
      mirrorAccentColor: 0xc2a99c,
      particleColor: 0x2d6cdf,
      ringColor: 0xd0dbe8,
      shadowOpacity: 0.2,
      faceColors: {
        py: 0xffffff, // Milk White
        ny: 0xf5d76e, // Warm Butter
        pz: 0x62c39a, // Mint Sage
        nz: 0x6499e9, // Nordic Sky
        px: 0xe8747c, // Soft Coral
        nx: 0xf5a162, // Apricot Peach
      },
    },
  },

  graphite: {
    id: 'graphite',
    name: 'Cyber Graphite',
    tag: 'Machined Metal',
    isDark: true,
    ui: {
      bg: '#161719',
      surface: 'rgba(28, 30, 34, 0.96)',
      surfaceSubtle: 'rgba(38, 40, 45, 0.98)',
      surfaceHover: 'rgba(48, 51, 58, 0.98)',
      border: 'rgba(255, 255, 255, 0.11)',
      text: '#F3F2EE',
      muted: '#9D9B93',
      accent: '#F59E0B',
      accentFg: '#141517',
      accentSoft: 'rgba(245, 158, 11, 0.16)',
      shadow: '0 18px 44px rgba(0, 0, 0, 0.56), 0 2px 8px rgba(0, 0, 0, 0.32)',
      swatchPreview: ['#161719', '#2E3138', '#F59E0B'],
    },
    scene: {
      background: 0x161719,
      fogColor: 0x161719,
      fogDensity: 0.022,
      keyLightColor: 0xffe8c8,
      keyLightIntensity: 2.6,
      hemiSkyColor: 0x9bb2d4,
      hemiGroundColor: 0x23252a,
      hemiIntensity: 0.88,
      rimLightColor: 0xf59e0b,
      rimLightIntensity: 1.45,
      chassisColor: 0x1e2024,
      chassisRoughness: 0.38,
      chassisMetalness: 0.72,
      coreMetalColor: 0xf59e0b,
      tileRoughness: 0.22,
      tileMetalness: 0.35,
      tileClearcoat: 0.78,
      mirrorColor: 0xd4af37, // Brushed Champagne Gold for Mirror Blocks!
      mirrorAccentColor: 0x8f7221,
      particleColor: 0xf59e0b,
      ringColor: 0x30333b,
      shadowOpacity: 0.48,
      faceColors: {
        py: 0xe6e4de, // Ceramic Titanium White
        ny: 0xf5b81b, // Industrial Amber Yellow
        pz: 0x1ca673, // Emerald Anodized
        nz: 0x2a76e8, // Cobalt Anodized
        px: 0xd93829, // Signal Vermilion
        nx: 0xeb6e1f, // Safety Orange
      },
    },
  },
};

export const THEME_LIST: ThemePalette[] = [
  THEMES.atelier,
  THEMES.monolith,
  THEMES.pastel,
  THEMES.graphite,
];

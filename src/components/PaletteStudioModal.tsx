import React, { useEffect, useMemo, useState } from 'react';
import { Check, Palette, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { cubeAudio } from '../cube/audio';
import {
  buildThemePaletteFromCustom,
  extractFaceHexColors,
  FIGMA_STARTER_PALETTES,
  normalizeHexColor,
  numberToHex,
  sanitizeThemeName,
  STICKER_FACES,
  type CustomThemeRecord,
  type FigmaStarterPalette,
} from '../cube/customThemes';
import { THEME_LIST } from '../cube/themes';
import type { FaceKey, ThemeId, ThemePalette } from '../cube/types';

interface PaletteStudioModalProps {
  theme: ThemePalette;
  activeThemeKey: string;
  customThemes: CustomThemeRecord[];
  onPreviewPalette: (preview: ThemePalette | null) => void;
  onSaveCustomTheme: (record: CustomThemeRecord) => void;
  onSelectTheme: (themeKey: string) => void;
  onDeleteCustomTheme: (id: string) => void;
  onClose: () => void;
}

const CHASSIS_PRESETS = [
  { label: 'Carbon', hex: '#16171B' },
  { label: 'Ceramic', hex: '#F4F4F2' },
  { label: 'Graphite', hex: '#282C34' },
];

export const PaletteStudioModal: React.FC<PaletteStudioModalProps> = ({
  theme,
  activeThemeKey,
  customThemes,
  onPreviewPalette,
  onSaveCustomTheme,
  onSelectTheme,
  onDeleteCustomTheme,
  onClose,
}) => {
  const editingExisting = useMemo(
    () => customThemes.find((t) => t.id === activeThemeKey) ?? null,
    [activeThemeKey, customThemes]
  );

  const [editingId, setEditingId] = useState<string | null>(() => editingExisting?.id ?? null);
  const [name, setName] = useState<string>(() => editingExisting?.name ?? 'Figma Custom');
  const [baseThemeId, setBaseThemeId] = useState<ThemeId>(
    () => editingExisting?.baseThemeId ?? (theme.isDark ? 'monolith' : 'atelier')
  );
  const [accentHex, setAccentHex] = useState<string>(() =>
    editingExisting?.accentHex ?? normalizeHexColor(theme.ui.accent, '#E04F26')
  );
  const [chassisHex, setChassisHex] = useState<string>(() =>
    editingExisting?.chassisHex ?? numberToHex(theme.scene.chassisColor)
  );
  const [faceHexColors, setFaceHexColors] = useState<Record<FaceKey, string>>(() =>
    editingExisting ? { ...editingExisting.faceHexColors } : extractFaceHexColors(theme)
  );
  const [savedNotice, setSavedNotice] = useState(false);

  // Build live ThemePalette preview & push immediately to 3D WebGL scene
  const draftRecord: CustomThemeRecord = useMemo(
    () => ({
      id: editingId ?? 'draft-preview',
      name: sanitizeThemeName(name) || 'Custom Palette',
      baseThemeId,
      accentHex: normalizeHexColor(accentHex, '#E04F26'),
      chassisHex: normalizeHexColor(chassisHex, '#16171B'),
      faceHexColors,
      createdAt: Date.now(),
    }),
    [accentHex, baseThemeId, chassisHex, editingId, faceHexColors, name]
  );

  const previewPalette = useMemo(
    () => buildThemePaletteFromCustom(draftRecord),
    [draftRecord]
  );

  useEffect(() => {
    onPreviewPalette(previewPalette);
  }, [onPreviewPalette, previewPalette]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onPreviewPalette(null);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      onPreviewPalette(null);
    };
  }, [onClose, onPreviewPalette]);

  const applyStarter = (starter: FigmaStarterPalette) => {
    cubeAudio.playUiTick();
    setEditingId(null);
    setName(starter.name);
    setBaseThemeId(starter.baseThemeId);
    setAccentHex(starter.accentHex);
    setChassisHex(starter.chassisHex);
    setFaceHexColors({ ...starter.faceHexColors });
  };

  const loadSavedForEditing = (rec: CustomThemeRecord) => {
    cubeAudio.playUiTick();
    setEditingId(rec.id);
    setName(rec.name);
    setBaseThemeId(rec.baseThemeId);
    setAccentHex(rec.accentHex);
    setChassisHex(rec.chassisHex);
    setFaceHexColors({ ...rec.faceHexColors });
    onSelectTheme(rec.id);
  };

  const handleFaceColorChange = (fk: FaceKey, rawVal: string) => {
    setFaceHexColors((prev) => ({
      ...prev,
      [fk]: rawVal.startsWith('#') ? rawVal.toUpperCase() : `#${rawVal.toUpperCase()}`,
    }));
  };

  const handleFaceHexBlur = (fk: FaceKey) => {
    setFaceHexColors((prev) => ({
      ...prev,
      [fk]: normalizeHexColor(prev[fk], '#FFFFFF'),
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeThemeName(name) || 'Custom Palette';
    const cleanFaces: Record<FaceKey, string> = {
      py: normalizeHexColor(faceHexColors.py, '#F7F7F4'),
      ny: normalizeHexColor(faceHexColors.ny, '#EBB600'),
      pz: normalizeHexColor(faceHexColors.pz, '#008F4C'),
      nz: normalizeHexColor(faceHexColors.nz, '#0E4EC7'),
      px: normalizeHexColor(faceHexColors.px, '#C91E1E'),
      nx: normalizeHexColor(faceHexColors.nx, '#EB5A10'),
    };
    const finalRecord: CustomThemeRecord = {
      id: editingId ?? `custom-${Date.now().toString(36)}`,
      name: cleanName,
      baseThemeId,
      accentHex: normalizeHexColor(accentHex, '#E04F26'),
      chassisHex: normalizeHexColor(chassisHex, '#16171B'),
      faceHexColors: cleanFaces,
      createdAt: Date.now(),
    };

    cubeAudio.playUiTick();
    setEditingId(finalRecord.id);
    setName(cleanName);
    setFaceHexColors(cleanFaces);
    onSaveCustomTheme(finalRecord);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const ui = previewPalette.ui;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none flex items-end sm:items-stretch justify-end p-2 pt-[100px] sm:pt-[78px] sm:pb-4 sm:px-5"
      aria-live="polite"
    >
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Figma-Inspired Cube Sticker Palette Studio"
        data-testid="palette-studio-drawer"
        className="pointer-events-auto w-full sm:w-[404px] max-h-[calc(100vh-112px)] sm:max-h-full rounded-2xl border flex flex-col overflow-hidden animate-kubi-enter"
        style={{
          backgroundColor: ui.surface,
          borderColor: ui.border,
          boxShadow: ui.shadow,
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: ui.border, backgroundColor: ui.surfaceSubtle }}
        >
          <div className="min-w-0">
            <h2
              className="font-display text-sm sm:text-base font-bold flex items-center gap-2 truncate"
              style={{ color: ui.text }}
            >
              <Palette className="w-4 h-4 shrink-0" style={{ color: ui.accent }} />
              <span>Sticker Palette Studio</span>
            </h2>
            <p className="text-[11px] truncate" style={{ color: ui.muted }}>
              Live 3D cube preview — craft & save Figma-inspired themes
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              onPreviewPalette(null);
              onClose();
            }}
            aria-label="Close Sticker Palette Studio"
            className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor: ui.surface,
              borderColor: ui.border,
              color: ui.text,
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Inspector Controls */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto kubi-scroll p-4 flex flex-col gap-4">
          {/* 1. Figma Community Starter Templates */}
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: ui.muted }}>
              Figma Starter Palettes
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FIGMA_STARTER_PALETTES.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  data-testid={`starter-${starter.id}`}
                  onClick={() => applyStarter(starter)}
                  className="p-2 rounded-xl border text-left transition-colors cursor-pointer"
                  style={{
                    backgroundColor: ui.surfaceSubtle,
                    borderColor: ui.border,
                  }}
                >
                  <div className="text-xs font-semibold truncate" style={{ color: ui.text }}>
                    {starter.name}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    {STICKER_FACES.map((f) => (
                      <span
                        key={f.key}
                        className="w-3.5 h-3.5 rounded-[4px] border"
                        style={{
                          backgroundColor: starter.faceHexColors[f.key],
                          borderColor: ui.border,
                        }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. 6-Face Cube Sticker Swatches */}
          <div className="pt-3 border-t" style={{ borderColor: ui.border }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: ui.muted }}>
                Cube Sticker Colors
              </span>
              <button
                type="button"
                onClick={() => setFaceHexColors(extractFaceHexColors(THEME_LIST[0]))}
                className="text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                style={{ color: ui.muted }}
              >
                <RotateCcw className="w-3 h-3" />
                Reset WCA
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {STICKER_FACES.map((face) => {
                const hexVal = faceHexColors[face.key];
                const safeHex = normalizeHexColor(hexVal, '#FFFFFF');
                return (
                  <div
                    key={face.key}
                    className="p-2 rounded-xl border flex items-center gap-2"
                    style={{
                      backgroundColor: ui.surfaceSubtle,
                      borderColor: ui.border,
                    }}
                  >
                    <label
                      className="relative w-8 h-8 rounded-lg border shrink-0 overflow-hidden cursor-pointer block"
                      style={{
                        backgroundColor: safeHex,
                        borderColor: ui.border,
                      }}
                      title={`Pick color for ${face.label}`}
                    >
                      <input
                        type="color"
                        aria-label={`${face.label} sticker color`}
                        data-testid={`sticker-color-${face.key}`}
                        value={safeHex}
                        onChange={(e) => handleFaceColorChange(face.key, e.target.value)}
                        className="opacity-0 inset-0 absolute w-full h-full cursor-pointer"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold leading-tight" style={{ color: ui.text }}>
                        {face.label}
                      </div>
                      <input
                        type="text"
                        value={hexVal}
                        maxLength={7}
                        aria-label={`${face.label} hex code`}
                        onChange={(e) => handleFaceColorChange(face.key, e.target.value)}
                        onBlur={() => handleFaceHexBlur(face.key)}
                        className="font-mono-tabular text-[11px] bg-transparent outline-none w-full uppercase mt-0.5"
                        style={{ color: ui.muted }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Studio Surface Lighting, Chassis Plastic & Accent */}
          <div className="pt-3 border-t flex flex-col gap-3" style={{ borderColor: ui.border }}>
            <div>
              <div className="text-xs font-semibold mb-1.5" style={{ color: ui.muted }}>
                Base Studio Lighting
              </div>
              <div className="grid grid-cols-4 gap-1">
                {THEME_LIST.map((base) => {
                  const active = base.id === baseThemeId;
                  return (
                    <button
                      key={base.id}
                      type="button"
                      onClick={() => setBaseThemeId(base.id as ThemeId)}
                      className="h-8 px-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer truncate"
                      style={{
                        backgroundColor: active ? ui.accentSoft : ui.surfaceSubtle,
                        borderColor: active ? ui.accent : ui.border,
                        color: active ? ui.accent : ui.text,
                      }}
                    >
                      {base.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Cube Plastic Body */}
              <div
                className="p-2 rounded-xl border"
                style={{ backgroundColor: ui.surfaceSubtle, borderColor: ui.border }}
              >
                <div className="text-[11px] font-semibold mb-1.5" style={{ color: ui.text }}>
                  Cube Plastic
                </div>
                <div className="flex items-center gap-1.5">
                  {CHASSIS_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.label}
                      aria-label={`Set cube plastic to ${preset.label}`}
                      onClick={() => setChassisHex(preset.hex)}
                      className="w-6 h-6 rounded-md border cursor-pointer"
                      style={{
                        backgroundColor: preset.hex,
                        borderColor:
                          normalizeHexColor(chassisHex, '#16171B') === preset.hex
                            ? ui.accent
                            : ui.border,
                      }}
                    />
                  ))}
                  <label
                    className="relative h-6 px-1.5 rounded-md border overflow-hidden cursor-pointer ml-auto inline-flex items-center gap-1"
                    style={{
                      backgroundColor: ui.surface,
                      borderColor: ui.border,
                    }}
                    title="Custom plastic color"
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-[3px] border shrink-0"
                      style={{
                        backgroundColor: normalizeHexColor(chassisHex, '#16171B'),
                        borderColor: ui.border,
                      }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: ui.muted }}>
                      Pick
                    </span>
                    <input
                      type="color"
                      aria-label="Custom cube plastic color"
                      value={normalizeHexColor(chassisHex, '#16171B')}
                      onChange={(e) => setChassisHex(e.target.value.toUpperCase())}
                      className="opacity-0 inset-0 absolute w-full h-full cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Studio UI Accent */}
              <div
                className="p-2 rounded-xl border flex items-center gap-2"
                style={{ backgroundColor: ui.surfaceSubtle, borderColor: ui.border }}
              >
                <label
                  className="relative w-8 h-8 rounded-lg border shrink-0 overflow-hidden cursor-pointer block"
                  style={{
                    backgroundColor: normalizeHexColor(accentHex, '#E04F26'),
                    borderColor: ui.border,
                  }}
                >
                  <input
                    type="color"
                    aria-label="Studio accent color"
                    data-testid="palette-accent-color"
                    value={normalizeHexColor(accentHex, '#E04F26')}
                    onChange={(e) => setAccentHex(e.target.value.toUpperCase())}
                    className="opacity-0 inset-0 absolute w-full h-full cursor-pointer"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold leading-tight" style={{ color: ui.text }}>
                    UI Accent
                  </div>
                  <input
                    type="text"
                    value={accentHex}
                    maxLength={7}
                    aria-label="Studio accent hex code"
                    onChange={(e) => setAccentHex(e.target.value.toUpperCase())}
                    onBlur={() => setAccentHex(normalizeHexColor(accentHex, '#E04F26'))}
                    className="font-mono-tabular text-[11px] bg-transparent outline-none w-full uppercase mt-0.5"
                    style={{ color: ui.muted }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Name & Persist Theme */}
          <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: ui.border }}>
            <label htmlFor="custom-theme-name" className="text-xs font-semibold" style={{ color: ui.muted }}>
              Theme Name
            </label>
            <div className="flex items-center gap-2">
              <input
                id="custom-theme-name"
                data-testid="custom-theme-name-input"
                type="text"
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Figma Neon, Kyoto Clay"
                className="flex-1 h-10 px-3 rounded-xl border text-xs sm:text-sm font-medium outline-none"
                style={{
                  backgroundColor: ui.surfaceSubtle,
                  borderColor: ui.border,
                  color: ui.text,
                }}
              />
              <button
                type="submit"
                data-testid="save-custom-theme-btn"
                className="h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: ui.accent,
                  color: ui.accentFg,
                }}
              >
                {savedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                <span>{savedNotice ? 'Saved' : editingId ? 'Update' : 'Save Theme'}</span>
              </button>
            </div>
          </div>

          {/* 5. Saved Custom Themes Shelf */}
          {customThemes.length > 0 && (
            <div className="pt-3 border-t" style={{ borderColor: ui.border }}>
              <div className="text-xs font-semibold mb-2" style={{ color: ui.muted }}>
                Saved Custom Themes ({customThemes.length})
              </div>
              <div className="flex flex-col gap-1.5" data-testid="saved-custom-themes-list">
                {customThemes.map((rec) => {
                  const isCurrent = rec.id === activeThemeKey;
                  return (
                    <div
                      key={rec.id}
                      className="p-2 rounded-xl border flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: isCurrent ? ui.accentSoft : ui.surfaceSubtle,
                        borderColor: isCurrent ? ui.accent : ui.border,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => loadSavedForEditing(rec)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="grid grid-cols-3 gap-0.5 shrink-0">
                          {STICKER_FACES.map((f) => (
                            <span
                              key={f.key}
                              className="w-2.5 h-2.5 rounded-[2px]"
                              style={{ backgroundColor: rec.faceHexColors[f.key] }}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-semibold truncate" style={{ color: ui.text }}>
                          {rec.name}
                        </span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Delete custom theme ${rec.name}`}
                        onClick={() => {
                          if (editingId === rec.id) setEditingId(null);
                          onDeleteCustomTheme(rec.id);
                        }}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: ui.surface,
                          borderColor: ui.border,
                          color: ui.muted,
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </aside>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Award,
  BookOpen,
  Camera,
  ChevronDown,
  CloudRain,
  Download,
  Globe,
  HardDrive,
  Headphones,
  Home,
  Music,
  Palette,
  Play,
  RotateCcw,
  Shuffle,
  Trophy,
  Upload,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import { AMBIENT_SOUNDSCAPES } from '../cube/audio';
import type { BackupImportMode } from '../cube/backup';
import { PUZZLE_META } from '../cube/curriculum';
import { buildThemePaletteFromCustom, type CustomThemeRecord } from '../cube/customThemes';
import { THEME_LIST } from '../cube/themes';
import type { AmbientSoundscapeId, SolveSnapshot, ThemePalette } from '../cube/types';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/i18n';
import { useI18n } from '../i18n/I18nContext';
import { formatTimer } from './TopHud';

interface PauseModalProps {
  theme: ThemePalette;
  customThemes: CustomThemeRecord[];
  solveCount: number;
  soundscape: AmbientSoundscapeId;
  ambientVolume: number;
  spatialAudioEnabled: boolean;
  onResume: () => void;
  onRestart: () => void;
  onSelectTheme: (themeKey: string) => void;
  onOpenPaletteStudio: () => void;
  onSelectSoundscape: (s: AmbientSoundscapeId) => void;
  onAmbientVolumeChange: (v: number) => void;
  onToggleSpatialAudio: () => void;
  onExportBackupJson: () => { ok: boolean; message: string };
  onImportBackupJson: (rawText: string, mode: BackupImportMode) => { ok: boolean; message: string };
  onExportSnapshot: () => void;
  onBackToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  theme,
  customThemes,
  solveCount,
  soundscape,
  ambientVolume,
  spatialAudioEnabled,
  onResume,
  onRestart,
  onSelectTheme,
  onOpenPaletteStudio,
  onSelectSoundscape,
  onAmbientVolumeChange,
  onToggleSpatialAudio,
  onExportBackupJson,
  onImportBackupJson,
  onExportSnapshot,
  onBackToTitle,
}) => {
  const { locale, setLocale, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<BackupImportMode>('merge');
  const [backupFeedback, setBackupFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = onImportBackupJson(text, importMode);
      setBackupFeedback(result);
    } catch {
      setBackupFeedback({ ok: false, message: 'Unable to read the selected file.' });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 12, 16, 0.48)' }}
    >
      <div
        className="w-full max-w-sm max-h-[92dvh] overflow-y-auto kubi-scroll rounded-2xl border p-5 sm:p-6 animate-kubi-enter"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          boxShadow: theme.ui.shadow,
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2
              id="pause-title"
              className="font-display text-2xl font-bold tracking-tight"
              style={{ color: theme.ui.text }}
            >
              {t('settings.title')}
            </h2>
            <p className="text-xs sm:text-sm mt-1" style={{ color: theme.ui.muted }}>
              {t('settings.subtitle')}
            </p>
          </div>
          <button
            type="button"
            data-testid="pause-close-btn"
            aria-label="Close settings"
            title="Close"
            onClick={onResume}
            className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.muted,
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* UI Language Localization Selector */}
        <div className="mb-4">
          <label
            htmlFor="settings-language-select"
            className="text-xs font-medium inline-flex items-center gap-1.5 mb-2"
            style={{ color: theme.ui.muted }}
          >
            <Globe className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
            <span>{t('settings.language')}</span>
          </label>
          <div className="relative">
            <select
              id="settings-language-select"
              data-testid="settings-language-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as SupportedLocale)}
              className="w-full h-10 pl-3 pr-9 rounded-xl border text-xs font-semibold outline-none cursor-pointer appearance-none"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.nativeName} ({loc.englishName})
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: theme.ui.muted }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Quick Theme Switcher (Built-in + Custom Figma Palettes) */}
        <div className="mb-4 pt-3 border-t" style={{ borderColor: theme.ui.border }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
              {t('settings.theme')}
            </span>
            <button
              type="button"
              onClick={onOpenPaletteStudio}
              className="text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              style={{ color: theme.ui.accent }}
            >
              <Palette className="w-3 h-3" />
              <span>{t('settings.customStickers')}</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto kubi-scroll pr-0.5">
            {[...THEME_LIST, ...customThemes.map(buildThemePaletteFromCustom)].map((t) => {
              const active = t.id === theme.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTheme(t.id)}
                  className="h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                    borderColor: active ? theme.ui.accent : theme.ui.border,
                    color: theme.ui.text,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: t.ui.swatchPreview[2] }}
                  />
                  <span className="truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3D Spatial Click Audio & Ambient Soundscapes */}
        <div className="mb-5 pt-3 border-t" style={{ borderColor: theme.ui.border }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
              <AudioLines
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: spatialAudioEnabled ? theme.ui.accent : theme.ui.muted }}
              />
              <span>{t('settings.spatialAudio')}</span>
            </span>
            <button
              type="button"
              data-testid="settings-spatial-audio-toggle"
              aria-pressed={spatialAudioEnabled}
              onClick={onToggleSpatialAudio}
              className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors shrink-0"
              style={{
                backgroundColor: spatialAudioEnabled ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                borderColor: spatialAudioEnabled ? theme.ui.accent : theme.ui.border,
                color: spatialAudioEnabled ? theme.ui.accent : theme.ui.muted,
              }}
            >
              {spatialAudioEnabled ? t('settings.spatialAudioOn') : t('settings.spatialAudioOff')}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
              <Headphones className="w-3.5 h-3.5" style={{ color: soundscape !== 'off' ? theme.ui.accent : theme.ui.muted }} />
              {t('settings.ambientSoundscape')}
            </span>
            {soundscape !== 'off' && (
              <span className="font-mono-tabular text-[11px]" style={{ color: theme.ui.muted }}>
                {Math.round(ambientVolume * 100)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5" data-testid="settings-soundscapes-menu">
            {AMBIENT_SOUNDSCAPES.map((scape) => {
              const active = scape.id === soundscape;
              const Icon =
                scape.id === 'rainy'
                  ? CloudRain
                  : scape.id === 'lofi'
                    ? Music
                    : scape.id === 'whitenoise'
                      ? Waves
                      : VolumeX;
              return (
                <button
                  key={scape.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectSoundscape(scape.id)}
                  className="h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                    borderColor: active ? theme.ui.accent : theme.ui.border,
                    color: active ? theme.ui.accent : theme.ui.text,
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{scape.shortLabel}</span>
                </button>
              );
            })}
          </div>
          {soundscape !== 'off' && (
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={ambientVolume}
              onChange={(e) => onAmbientVolumeChange(parseFloat(e.target.value))}
              aria-label="Ambient soundscape volume"
              className="kubi-slider w-full mt-2.5"
            />
          )}
        </div>

        {/* Local Storage Progress Backup (JSON Export / Import) */}
        <div className="mb-5 pt-3 border-t" style={{ borderColor: theme.ui.border }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
              <HardDrive className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
              {t('settings.backupRestore')}
            </span>
            <span className="font-mono-tabular text-[11px]" style={{ color: theme.ui.muted }}>
              {t('settings.backupSummary', { themes: customThemes.length, solves: solveCount })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="settings-export-json-btn"
              onClick={() => setBackupFeedback(onExportBackupJson())}
              className="h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{t('settings.exportJson')}</span>
            </button>

            <button
              type="button"
              data-testid="settings-import-json-btn"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>{t('settings.importJson')}</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="settings-export-snapshot-btn"
            onClick={onExportSnapshot}
            className="w-full h-9 mt-1.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <Camera className="w-3.5 h-3.5 shrink-0" style={{ color: theme.ui.accent }} />
            <span>{t('settings.exportPng')}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            data-testid="settings-import-json-input"
            aria-label="Import Kubi Studio backup JSON file"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />

          <div className="flex items-center justify-between gap-2 mt-2 text-[11px]">
            <span style={{ color: theme.ui.muted }}>{t('settings.importMode')}</span>
            <div
              className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border"
              style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surfaceSubtle }}
            >
              {(['merge', 'replace'] as const).map((m) => {
                const active = importMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-testid={`import-mode-${m}`}
                    aria-pressed={active}
                    onClick={() => setImportMode(m)}
                    className="h-6 px-2 rounded-md text-[11px] font-semibold cursor-pointer"
                    style={{
                      backgroundColor: active ? theme.ui.surface : 'transparent',
                      color: active ? theme.ui.accent : theme.ui.muted,
                    }}
                  >
                    {m === 'merge' ? t('settings.merge') : t('settings.replace')}
                  </button>
                );
              })}
            </div>
          </div>

          {backupFeedback && (
            <p
              role={backupFeedback.ok ? 'status' : 'alert'}
              data-testid="settings-backup-feedback"
              className="mt-2 text-[11px] font-medium leading-snug px-2.5 py-1.5 rounded-lg border"
              style={{
                backgroundColor: backupFeedback.ok ? theme.ui.accentSoft : 'rgba(220, 38, 38, 0.08)',
                borderColor: backupFeedback.ok ? theme.ui.accent : 'rgba(220, 38, 38, 0.35)',
                color: backupFeedback.ok ? theme.ui.text : '#DC2626',
              }}
            >
              {backupFeedback.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: theme.ui.accent,
              color: theme.ui.accentFg,
            }}
          >
            <Play className="w-4 h-4" />
            <span>{t('settings.resume')}</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full h-10 rounded-xl border font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('settings.resetPuzzle')}</span>
          </button>

          <button
            type="button"
            onClick={onBackToTitle}
            className="w-full h-10 rounded-xl border font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              borderColor: theme.ui.border,
              color: theme.ui.muted,
            }}
          >
            <Home className="w-4 h-4" />
            <span>{t('settings.backToTitle')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  aspect: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  tiltPhase: number;
  tiltSpeed: number;
  life: number;
  maxLife: number;
}

const VictoryConfettiCanvas: React.FC<{ theme: ThemePalette }> = ({ theme }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const toHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const palette = [
      toHex(theme.scene.faceColors.px),
      toHex(theme.scene.faceColors.nx),
      toHex(theme.scene.faceColors.py),
      toHex(theme.scene.faceColors.pz),
      toHex(theme.scene.faceColors.nz),
      theme.ui.accent,
    ];

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const pieces: ConfettiPiece[] = [];
    const totalCount = prefersReducedMotion ? 42 : 108;

    for (let i = 0; i < totalCount; i++) {
      const fromLeft = i % 3 === 0;
      const fromRight = i % 3 === 1;
      const spawnX = fromLeft
        ? width * (0.14 + Math.random() * 0.2)
        : fromRight
          ? width * (0.66 + Math.random() * 0.2)
          : width * (0.25 + Math.random() * 0.5);
      const spawnY = prefersReducedMotion
        ? height * (0.1 + Math.random() * 0.72)
        : fromLeft || fromRight
          ? height * (0.58 + Math.random() * 0.16)
          : -16 - Math.random() * 140;

      const angle = fromLeft
        ? -Math.PI * (0.28 + Math.random() * 0.22)
        : fromRight
          ? -Math.PI * (0.5 + Math.random() * 0.22)
          : Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;

      const speed = fromLeft || fromRight ? 420 + Math.random() * 360 : 85 + Math.random() * 130;

      pieces.push({
        x: spawnX,
        y: spawnY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 5,
        aspect: 0.45 + Math.random() * 0.5,
        color: palette[i % palette.length],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 8.5,
        tiltPhase: Math.random() * Math.PI * 2,
        tiltSpeed: 4 + Math.random() * 5,
        life: 0,
        maxLife: 2.6 + Math.random() * 1.6,
      });
    }

    const drawPieces = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        const progress = p.life / p.maxLife;
        if (progress >= 1) continue;
        const alpha = progress > 0.72 ? Math.max(0, 1 - (progress - 0.72) / 0.28) : 0.94;
        const flipScale = 0.28 + 0.72 * Math.abs(Math.cos(p.tiltPhase));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(1, flipScale);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * p.aspect * 0.5, p.size, p.size * p.aspect);
        ctx.restore();
      }
    };

    if (prefersReducedMotion) {
      drawPieces();
      return () => {
        window.removeEventListener('resize', resize);
      };
    }

    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(Math.max((now - lastTs) / 1000, 0.001), 0.05);
      lastTs = now;

      let aliveCount = 0;
      const gravity = 560;
      const drag = Math.exp(-1.15 * dt);

      for (const p of pieces) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        aliveCount++;

        p.vx *= drag;
        p.vy = p.vy * drag + gravity * dt;
        p.x += p.vx * dt + Math.sin(p.tiltPhase) * 28 * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotationSpeed * dt;
        p.tiltPhase += p.tiltSpeed * dt;
      }

      drawPieces();
      if (aliveCount > 0) {
        rafId = window.requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="victory-confetti-canvas"
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};

interface VictoryModalProps {
  theme: ThemePalette;
  snapshot: SolveSnapshot;
  onPlayAgain: () => void;
  onOpenLessons: () => void;
  onOpenDailyLeaderboard?: () => void;
  onDismiss: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  theme,
  snapshot,
  onPlayAgain,
  onOpenLessons,
  onOpenDailyLeaderboard,
  onDismiss,
}) => {
  const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 12, 16, 0.45)' }}
    >
      <VictoryConfettiCanvas theme={theme} />
      <div
        className="relative z-10 w-full max-w-md max-h-[92dvh] overflow-y-auto kubi-scroll rounded-2xl border p-5 sm:p-7 animate-kubi-enter"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          boxShadow: theme.ui.shadow,
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: theme.ui.accentSoft, color: theme.ui.accent }}
          >
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="victory-title"
              className="font-display text-2xl font-bold tracking-tight leading-tight"
              style={{ color: theme.ui.text }}
            >
              {t('victory.title')}
            </h2>
            <p className="text-xs" style={{ color: theme.ui.muted }}>
              {PUZZLE_META[snapshot.puzzleType].label}
              {snapshot.isNewRecord ? ` · ${t('victory.newRecord')}` : ''}
            </p>
          </div>
        </div>

        {/* 3 Mastery Stat Readouts */}
        <div
          className="grid grid-cols-3 gap-2 my-5 p-3 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
        >
          <div>
            <div className="text-[11px]" style={{ color: theme.ui.muted }}>
              {t('victory.clearTime')}
            </div>
            <div className="font-mono-tabular text-base font-bold mt-0.5" style={{ color: theme.ui.text }}>
              {formatTimer(snapshot.elapsedMs)}
            </div>
          </div>

          <div>
            <div className="text-[11px]" style={{ color: theme.ui.muted }}>
              {t('victory.moves')}
            </div>
            <div className="font-mono-tabular text-base font-bold mt-0.5" style={{ color: theme.ui.text }}>
              {snapshot.moves}
            </div>
          </div>

          <div>
            <div className="text-[11px]" style={{ color: theme.ui.muted }}>
              {t('victory.bestTime')}
            </div>
            <div className="font-mono-tabular text-base font-bold mt-0.5" style={{ color: theme.ui.accent }}>
              {snapshot.bestMs !== null ? formatTimer(snapshot.bestMs) : formatTimer(snapshot.elapsedMs)}
            </div>
          </div>
        </div>

        {snapshot.dailyChallenge && (
          <div
            className="mb-4 px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs"
            style={{
              backgroundColor: theme.ui.accentSoft,
              borderColor: theme.ui.accent,
              color: theme.ui.text,
            }}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Trophy className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
              Daily {snapshot.dailyChallenge.dateKey} Submitted
            </span>
            <span className="font-mono-tabular font-bold" style={{ color: theme.ui.accent }}>
              {snapshot.dailyChallenge.rank
                ? `Global #${snapshot.dailyChallenge.rank} of ${snapshot.dailyChallenge.totalParticipants}`
                : 'Recorded'}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {snapshot.dailyChallenge && onOpenDailyLeaderboard ? (
            <button
              type="button"
              onClick={onOpenDailyLeaderboard}
              className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              <Trophy className="w-4 h-4" />
              <span>{t('victory.viewLeaderboard')}</span>
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              <Shuffle className="w-4 h-4" />
              <span>{t('victory.newScramble')}</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenLessons}
              className="h-10 rounded-xl border font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <BookOpen className="w-4 h-4" />
              <span>{t('victory.lessons')}</span>
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="h-10 rounded-xl border font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                borderColor: theme.ui.border,
                color: theme.ui.muted,
              }}
            >
              <span>{t('victory.inspectCube')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

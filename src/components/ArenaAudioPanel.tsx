import React, { useEffect, useRef } from 'react';
import { Headphones, Mic, MicOff, RefreshCw, Volume2, VolumeX, X } from 'lucide-react';
import type { AudioDeviceOption } from '../cube/audioDevices';
import type { ThemePalette } from '../cube/types';
import { useI18n } from '../i18n/I18nContext';

export interface ArenaAudioPanelProps {
  open: boolean;
  onClose: () => void;
  theme: ThemePalette;
  micEnabled: boolean;
  systemAudioMuted: boolean;
  audioInputDevices: AudioDeviceOption[];
  audioOutputDevices: AudioDeviceOption[];
  selectedMicId: string;
  selectedSpeakerId: string;
  canSelectSpeaker: boolean;
  switchingAudioDevice: boolean;
  onToggleMic: () => void;
  onToggleSystemAudio: () => void;
  onSelectMic: (deviceId: string) => void;
  onSelectSpeaker: (deviceId: string) => void;
  onRefreshDevices: () => void;
}

/**
 * In-match Audio Controls & Device Selector panel.
 * Renders as an anchored popover on desktop (>= md) and a thumb-reachable slide-up sheet on mobile (< md),
 * allowing players to mute/unmute and switch microphone or speaker devices live without leaving their 1v1 match.
 */
export const ArenaAudioPanel: React.FC<ArenaAudioPanelProps> = ({
  open,
  onClose,
  theme,
  micEnabled,
  systemAudioMuted,
  audioInputDevices,
  audioOutputDevices,
  selectedMicId,
  selectedSpeakerId,
  canSelectSpeaker,
  switchingAudioDevice,
  onToggleMic,
  onToggleSystemAudio,
  onSelectMic,
  onSelectSpeaker,
  onRefreshDevices,
}) => {
  const { t } = useI18n();
  const onCloseRef = useRef(onClose);
  const onRefreshRef = useRef(onRefreshDevices);
  onCloseRef.current = onClose;
  onRefreshRef.current = onRefreshDevices;

  useEffect(() => {
    if (!open) return;
    onRefreshRef.current();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  const micOptions: AudioDeviceOption[] =
    audioInputDevices.length > 0
      ? audioInputDevices
      : [
          {
            deviceId: 'default',
            label: 'System Default Microphone',
            kind: 'audioinput',
            isDefault: true,
          },
        ];

  const speakerOptions: AudioDeviceOption[] =
    audioOutputDevices.length > 0
      ? audioOutputDevices
      : [
          {
            deviceId: 'default',
            label: 'System Default Speaker',
            kind: 'audiooutput',
            isDefault: true,
          },
        ];

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end md:block"
      role="dialog"
      aria-modal="true"
      aria-label="Arena Audio Controls and Device Selection"
    >
      {/* Backdrop click dismiss */}
      <button
        type="button"
        aria-label="Close audio settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 md:bg-transparent backdrop-blur-[2px] md:backdrop-blur-none cursor-pointer"
      />

      {/* Responsive Card: Bottom sheet on Mobile (< md), Anchored Top-Right Popover on Desktop (>= md) */}
      <div
        data-testid="arena-audio-panel"
        className="relative z-10 w-full md:w-[360px] md:fixed md:top-[60px] md:right-6 rounded-t-3xl md:rounded-2xl border-t md:border shadow-2xl overflow-hidden kubi-safe-bottom md:pb-0"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          color: theme.ui.text,
        }}
      >
        {/* Mobile grab handle */}
        <div className="pt-2.5 pb-1 flex justify-center md:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: theme.ui.border }} />
        </div>

        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2"
          style={{ borderColor: theme.ui.border }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Headphones className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
            <h3 className="font-display text-sm font-bold truncate">{t('arena.audioAndDevices')}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="audio-panel-refresh-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onRefreshDevices();
              }}
              aria-label="Refresh audio devices"
              className="h-9 md:h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${switchingAudioDevice ? 'animate-spin' : ''}`} />
              <span>Scan</span>
            </button>
            <button
              type="button"
              data-testid="audio-panel-close-btn"
              onClick={onClose}
              aria-label="Close audio settings"
              className="w-10 h-10 md:w-8 md:h-8 rounded-lg border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4">
          {/* Quick Mute / Unmute Controls */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="audio-panel-mic-toggle"
              aria-pressed={!micEnabled}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMic();
              }}
              className="min-h-[52px] md:min-h-[46px] px-3 py-2 rounded-xl border flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              style={{
                backgroundColor: micEnabled
                  ? theme.ui.surfaceSubtle
                  : 'rgba(220, 38, 38, 0.12)',
                borderColor: micEnabled ? theme.ui.border : 'rgba(220, 38, 38, 0.45)',
                color: micEnabled ? theme.ui.text : '#DC2626',
              }}
            >
              {micEnabled ? (
                <Mic className="w-4 h-4 shrink-0" style={{ color: '#16A34A' }} />
              ) : (
                <MicOff className="w-4 h-4 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-tight truncate">{t('arena.microphone')}</div>
                <div
                  className="text-[11px] leading-tight mt-0.5 truncate"
                  style={{ color: micEnabled ? theme.ui.muted : '#DC2626' }}
                >
                  {micEnabled ? 'Live · Tap to mute' : 'Muted · Tap to unmute'}
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="audio-panel-system-toggle"
              aria-pressed={systemAudioMuted}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleSystemAudio();
              }}
              className="min-h-[52px] md:min-h-[46px] px-3 py-2 rounded-xl border flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              style={{
                backgroundColor: !systemAudioMuted
                  ? theme.ui.surfaceSubtle
                  : 'rgba(220, 38, 38, 0.12)',
                borderColor: !systemAudioMuted ? theme.ui.border : 'rgba(220, 38, 38, 0.45)',
                color: !systemAudioMuted ? theme.ui.text : '#DC2626',
              }}
            >
              {systemAudioMuted ? (
                <VolumeX className="w-4 h-4 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 shrink-0" style={{ color: '#16A34A' }} />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-tight truncate">{t('arena.systemAudio')}</div>
                <div
                  className="text-[11px] leading-tight mt-0.5 truncate"
                  style={{ color: !systemAudioMuted ? theme.ui.muted : '#DC2626' }}
                >
                  {systemAudioMuted ? 'Muted · Tap to unmute' : 'On · Opponent & SFX'}
                </div>
              </div>
            </button>
          </div>

          {/* Microphone Input Device Selector */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="arena-mic-device-select"
              className="text-xs font-semibold flex items-center justify-between gap-2"
            >
              <span>{t('arena.micInput')}</span>
              <span className="text-[11px] font-normal" style={{ color: theme.ui.muted }}>
                {micOptions.length} available
              </span>
            </label>
            <select
              id="arena-mic-device-select"
              data-testid="audio-panel-mic-select"
              value={selectedMicId}
              disabled={switchingAudioDevice}
              onChange={(e) => {
                const nextId = e.target.value;
                e.currentTarget.blur();
                onSelectMic(nextId);
              }}
              className="w-full h-11 md:h-10 px-3 rounded-xl border text-xs font-medium outline-none cursor-pointer disabled:opacity-60"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              {micOptions.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          </div>

          {/* System Audio / Speaker Output Device Selector */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="arena-speaker-device-select"
              className="text-xs font-semibold flex items-center justify-between gap-2"
            >
              <span>{t('arena.speakerOutput')}</span>
              <span className="text-[11px] font-normal" style={{ color: theme.ui.muted }}>
                {canSelectSpeaker ? `${speakerOptions.length} available` : 'OS Managed'}
              </span>
            </label>
            {canSelectSpeaker ? (
              <select
                id="arena-speaker-device-select"
                data-testid="audio-panel-speaker-select"
                value={selectedSpeakerId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  e.currentTarget.blur();
                  onSelectSpeaker(nextId);
                }}
                className="w-full h-11 md:h-10 px-3 rounded-xl border text-xs font-medium outline-none cursor-pointer"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.border,
                  color: theme.ui.text,
                }}
              >
                {speakerOptions.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label}
                  </option>
                ))}
              </select>
            ) : (
              <div
                data-testid="audio-panel-speaker-fallback"
                className="w-full px-3 py-2.5 rounded-xl border text-xs leading-snug"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.border,
                  color: theme.ui.muted,
                }}
              >
                This browser routes speaker output via your device audio settings. You can still
                mute or unmute system audio above.
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: theme.ui.muted }}>
            {t('arena.audioLiveNote')}
          </p>
        </div>
      </div>
    </div>
  );
};

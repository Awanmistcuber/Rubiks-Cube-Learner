export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
  isDefault: boolean;
}

export interface PartitionedAudioDevices {
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
}

export interface MediaDeviceLike {
  deviceId: string;
  kind: string;
  label?: string;
}

/**
 * Partition raw MediaDeviceInfo[] into deduplicated, human-labeled microphone
 * inputs and speaker/system-audio outputs.
 */
export function partitionAudioDevices(devices: readonly MediaDeviceLike[]): PartitionedAudioDevices {
  const inputs: AudioDeviceOption[] = [];
  const outputs: AudioDeviceOption[] = [];
  const seenInputIds = new Set<string>();
  const seenOutputIds = new Set<string>();

  let unnamedInputCount = 0;
  let unnamedOutputCount = 0;

  for (const dev of devices) {
    if (!dev || typeof dev.deviceId !== 'string') continue;
    const id = dev.deviceId.trim();
    if (!id) continue;

    const rawLabel = typeof dev.label === 'string' ? dev.label.trim() : '';

    if (dev.kind === 'audioinput') {
      if (seenInputIds.has(id)) continue;
      seenInputIds.add(id);
      const isDefault = id === 'default';
      let label = rawLabel;
      if (!label) {
        if (isDefault) {
          label = 'System Default Microphone';
        } else {
          unnamedInputCount += 1;
          label = `Microphone ${unnamedInputCount}`;
        }
      }
      inputs.push({ deviceId: id, label, kind: 'audioinput', isDefault });
    } else if (dev.kind === 'audiooutput') {
      if (seenOutputIds.has(id)) continue;
      seenOutputIds.add(id);
      const isDefault = id === 'default';
      let label = rawLabel;
      if (!label) {
        if (isDefault) {
          label = 'System Default Speaker';
        } else {
          unnamedOutputCount += 1;
          label = `Speaker ${unnamedOutputCount}`;
        }
      }
      outputs.push({ deviceId: id, label, kind: 'audiooutput', isDefault });
    }
  }

  return { inputs, outputs };
}

/**
 * Resolve the active device ID after a device list refresh or plug/unplug event.
 * Preserves the user's preferred device if still present; otherwise falls back to
 * 'default' or the first enumerated device.
 */
export function resolveSelectedDeviceId(
  devices: readonly AudioDeviceOption[],
  preferredId: string | null | undefined
): string {
  if (devices.length === 0) return 'default';
  if (preferredId && devices.some((d) => d.deviceId === preferredId)) {
    return preferredId;
  }
  const defaultDev = devices.find((d) => d.isDefault || d.deviceId === 'default');
  return defaultDev ? defaultDev.deviceId : devices[0].deviceId;
}

/**
 * Feature-detect browser support for HTMLMediaElement.prototype.setSinkId
 * (supported in Chromium-based browsers; gracefully falls back on Safari/Firefox).
 */
export function supportsAudioOutputSelection(
  proto?: { setSinkId?: unknown } | null
): boolean {
  if (proto) {
    return typeof proto.setSinkId === 'function';
  }
  if (typeof HTMLMediaElement === 'undefined') return false;
  return typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function';
}

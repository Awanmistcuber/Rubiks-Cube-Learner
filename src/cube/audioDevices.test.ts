import test from 'node:test';
import assert from 'node:assert/strict';
import {
  partitionAudioDevices,
  resolveSelectedDeviceId,
  supportsAudioOutputSelection,
} from './audioDevices';

test('partitionAudioDevices separates inputs and outputs, deduplicates IDs, and provides clean fallback labels', () => {
  const { inputs, outputs } = partitionAudioDevices([
    { deviceId: 'default', kind: 'audioinput', label: '' },
    { deviceId: 'mic-usb', kind: 'audioinput', label: 'Blue Yeti USB' },
    { deviceId: 'mic-usb', kind: 'audioinput', label: 'Duplicate Yeti' },
    { deviceId: 'mic-2', kind: 'audioinput', label: '   ' },
    { deviceId: '', kind: 'audioinput', label: 'Empty ID ignored' },
    { deviceId: 'cam-1', kind: 'videoinput', label: 'FaceTime HD' },
    { deviceId: 'default', kind: 'audiooutput', label: '' },
    { deviceId: 'spk-bt', kind: 'audiooutput', label: 'AirPods Pro' },
    { deviceId: 'spk-2', kind: 'audiooutput', label: '' },
  ]);

  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].label, 'System Default Microphone');
  assert.equal(inputs[0].isDefault, true);
  assert.equal(inputs[1].label, 'Blue Yeti USB');
  assert.equal(inputs[2].label, 'Microphone 1');

  assert.equal(outputs.length, 3);
  assert.equal(outputs[0].label, 'System Default Speaker');
  assert.equal(outputs[1].label, 'AirPods Pro');
  assert.equal(outputs[2].label, 'Speaker 1');
});

test('resolveSelectedDeviceId keeps connected preferred device and gracefully recovers on unplug', () => {
  const { inputs } = partitionAudioDevices([
    { deviceId: 'default', kind: 'audioinput', label: 'Default Mic' },
    { deviceId: 'mic-usb', kind: 'audioinput', label: 'USB Mic' },
  ]);

  assert.equal(resolveSelectedDeviceId(inputs, 'mic-usb'), 'mic-usb');
  assert.equal(resolveSelectedDeviceId(inputs, 'removed-headset'), 'default');

  const noDefault = inputs.filter((d) => !d.isDefault);
  assert.equal(resolveSelectedDeviceId(noDefault, 'removed-headset'), 'mic-usb');
  assert.equal(resolveSelectedDeviceId([], 'mic-usb'), 'default');
});

test('supportsAudioOutputSelection accurately reflects setSinkId availability', () => {
  assert.equal(supportsAudioOutputSelection({ setSinkId: () => Promise.resolve() }), true);
  assert.equal(supportsAudioOutputSelection({}), false);
});

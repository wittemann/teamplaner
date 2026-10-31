import { describe, expect, it } from 'vitest';
import { keyBytes, pushStep, type Device } from './push-state.ts';

const device = (overrides: Partial<Device>) =>
  ({
    ios: false,
    standalone: false,
    supported: true,
    permission: 'default',
    subscribed: false,
    ...overrides,
  }) satisfies Device;

describe('pushStep', () => {
  it('sends iPhones in the browser to the home screen first', () => {
    expect(pushStep(device({ ios: true, supported: false }))).toBe('install');
    expect(pushStep(device({ ios: true, standalone: true }))).toBe('ask');
  });

  it('asks until permission is given and the device is signed up', () => {
    expect(pushStep(device({}))).toBe('ask');
    expect(pushStep(device({ permission: 'granted' }))).toBe('ask');
    expect(pushStep(device({ permission: 'granted', subscribed: true }))).toBe('on');
  });

  it('shows blocked and unsupported browsers', () => {
    expect(pushStep(device({ permission: 'denied' }))).toBe('blocked');
    expect(pushStep(device({ supported: false }))).toBe('none');
  });
});

describe('keyBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...keyBytes('-_8')]).toEqual([0xfb, 0xff]);
  });
});

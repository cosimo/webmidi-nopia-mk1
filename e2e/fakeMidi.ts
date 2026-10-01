import type { Page } from '@playwright/test';

export const M32 = 'Komplete Kontrol M32';
export const SYNTH = 'Fake Synth';

/**
 * Runs in the browser before the app: replaces navigator.requestMIDIAccess with a fake that
 * has the given ports, and exposes window.__midi to send input and read what was output.
 */
function installFakeMidi(opts: { inputs: string[]; outputs: string[] }) {
  type Port = {
    id: string; name: string; type: string; state: string; connection: string;
    onmidimessage: null | ((e: { data: Uint8Array }) => void);
    send(data: number[]): void;
  };
  const sent: { port: string; data: number[] }[] = [];
  const port = (name: string, type: string): Port => ({
    id: `${type}:${name}`, name, type, state: 'connected', connection: 'open', onmidimessage: null,
    send(data) { sent.push({ port: name, data: Array.from(data) }); },
  });
  const inputs = new Map(opts.inputs.map((n) => [`input:${n}`, port(n, 'input')]));
  const outputs = new Map(opts.outputs.map((n) => [`output:${n}`, port(n, 'output')]));
  const access = { inputs, outputs, sysexEnabled: false, onstatechange: null as null | ((e: unknown) => void) };
  Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', {
    configurable: true,
    value: async () => access,
  });
  (window as unknown as { __midi: unknown }).__midi = {
    sent,
    send(name: string, data: number[]) {
      inputs.get(`input:${name}`)?.onmidimessage?.({ data: new Uint8Array(data) });
    },
    setConnected(name: string, connected: boolean) {
      const p = inputs.get(`input:${name}`) ?? outputs.get(`output:${name}`)!;
      p.state = connected ? 'connected' : 'disconnected';
      access.onstatechange?.({ port: p });
    },
  };
}

export async function withFakeMidi(page: Page, inputs = [M32], outputs = [SYNTH]) {
  await page.addInitScript(installFakeMidi, { inputs, outputs });
}

export async function withoutWebMidi(page: Page) {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });
}

/** Send a MIDI message from a fake input (default: the M32). */
export async function sendMidi(page: Page, data: number[], input = M32) {
  await page.evaluate(([name, d]) => (window as any).__midi.send(name, d), [input, data] as const);
}

export async function midiSent(page: Page): Promise<{ port: string; data: number[] }[]> {
  return page.evaluate(() => (window as any).__midi.sent);
}

export async function setConnected(page: Page, name: string, connected: boolean) {
  await page.evaluate(([n, c]) => (window as any).__midi.setConnected(n, c), [name, connected] as const);
}

/** Collects page errors and console errors; assert it is empty at the end of a test. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
  return errors;
}

export async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-overlay').click();
  await page.getByTestId('start-overlay').waitFor({ state: 'hidden' });
}

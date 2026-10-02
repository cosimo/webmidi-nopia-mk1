import { expect, test } from '@playwright/test';
import { collectErrors, M32, midiSent, sendMidi, setConnected, start, SYNTH, withFakeMidi } from './fakeMidi';

const sentBytes = async (page: Parameters<typeof midiSent>[0]) => (await midiSent(page)).map((m) => m.data.join(','));

test.describe('modules and MIDI out', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('every preset builds and plays', async ({ page }) => {
    const presets = { keys: ['organ', 'pluck', 'epiano'], pad: ['glass', 'warmPad'], bass: ['sawBass', 'sub'], melody: ['leadGlide', 'lead'] };
    for (const [id, ids] of Object.entries(presets)) {
      await page.getByTestId(`${id}-open`).click();
      for (const preset of ids) {
        await page.getByTestId(`${id}-preset`).selectOption(preset);
        await sendMidi(page, [0x90, 48, 100]);
        await sendMidi(page, [0x90, 72, 100]);
        await sendMidi(page, [0xe0, 0, 100]);
        await sendMidi(page, [0xb0, 1, 90]);
        await sendMidi(page, [0x80, 48, 0]);
        await sendMidi(page, [0x80, 72, 0]);
      }
    }
    await expect(page.getByTestId('oled-chord')).toHaveText('C');
  });

  test('fast chord changes at full extensions never drop notes', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => void (m.type() === 'warning' && warnings.push(m.text())));
    await sendMidi(page, [0xb0, 14, 127]); // Extensions to max (default binding CC14)
    for (let i = 0; i < 16; i++) {
      const note = 48 + ((i * 5) % 12);
      await sendMidi(page, [0x90, note, 100]);
      await page.waitForTimeout(240); // ~4 chords per second
      await sendMidi(page, [0x80, note, 0]);
    }
    expect(warnings.filter((w) => /polyphony/i.test(w))).toEqual([]);
  });

  test('modules send MIDI on their own channels; panic sends note-offs and CC123', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await page.getByTestId('bass-open').click();
    await page.getByTestId('bass-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]); // C
    await expect.poll(() => sentBytes(page)).toEqual(
      expect.arrayContaining(['144,60,100', '144,64,100', '144,67,100', '145,36,100']),
    );
    await page.getByTestId('panic').click();
    expect(await sentBytes(page)).toEqual(
      expect.arrayContaining(['128,60,0', '128,64,0', '128,67,0', '176,123,0', '129,36,0', '177,123,0']),
    );
    await expect(page.getByTestId('oled-chord')).toHaveText('C'); // last chord stays, dimmed
  });

  test('melody notes and pitch bend go out on channel 5', async ({ page }) => {
    await page.getByTestId('melody-open').click();
    await page.getByTestId('melody-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 72, 90]);
    await sendMidi(page, [0xe0, 0, 96]);
    await expect.poll(() => sentBytes(page)).toEqual(expect.arrayContaining(['148,72,90', '228,0,96']));
  });

  test('hiding the page silences held notes', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await sentBytes(page)).toEqual(expect.arrayContaining(['128,60,0', '128,64,0', '128,67,0', '176,123,0']));
  });

  test('unplugging the input silences held notes', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]);
    await setConnected(page, M32, false);
    expect(await sentBytes(page)).toEqual(expect.arrayContaining(['128,60,0', '176,123,0']));
  });

  test('a vanished output port falls back to internal sound with a warning badge', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await setConnected(page, SYNTH, false);
    await expect(page.getByTestId('module-keys').locator('.badge')).toBeVisible();
    await setConnected(page, SYNTH, true);
    await expect(page.getByTestId('module-keys').locator('.badge')).toBeHidden();
  });
});

test('unplugging the input silences held notes when another input takes over', async ({ page }) => {
  await withFakeMidi(page, [M32, 'Other Keys'], [SYNTH]);
  await start(page);
  await page.getByTestId('keys-open').click();
  await page.getByTestId('keys-port').selectOption(SYNTH);
  await sendMidi(page, [0x90, 48, 100]);
  await setConnected(page, M32, false); // no input was chosen, so "Other Keys" is picked instead
  expect(await sentBytes(page)).toEqual(expect.arrayContaining(['128,60,0', '176,123,0']));
});

test('selecting the same port as input and output warns about feedback', async ({ page }) => {
  await withFakeMidi(page, ['Bome'], ['Bome']);
  await start(page);
  await page.getByTestId('output-all').selectOption('Bome');
  await expect(page.getByTestId('banner-feedback')).toBeVisible();
});

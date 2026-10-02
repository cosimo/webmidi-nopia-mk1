import { expect, test, type Page } from '@playwright/test';
import { collectErrors, midiSent, sendMidi, start, SYNTH, withFakeMidi } from './fakeMidi';

/** Note numbers of the note-ons sent on a MIDI channel (1..16), in order. */
async function noteOns(page: Page, channel: number): Promise<number[]> {
  return (await midiSent(page)).filter((m) => m.data[0] === 0x8f + channel && m.data[2] > 0).map((m) => m.data[1]);
}

/** How many messages with this status byte were sent. */
async function countStatus(page: Page, status: number): Promise<number> {
  return (await midiSent(page)).filter((m) => m.data[0] === status).length;
}

async function enableArp(page: Page, rate = '1/16') {
  await page.getByTestId('arp-open').click();
  await page.getByTestId('arp-enabled').check();
  await page.getByTestId('arp-port').selectOption(SYNTH);
  await page.getByTestId('arp-rate').selectOption(rate);
}

test.describe('rhythm', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the Arp plays the held chord upward on channel 3 and stops when it is released', async ({ page }) => {
    await enableArp(page);
    await sendMidi(page, [0x90, 48, 100]); // C: Keys voicing 60 64 67
    await expect.poll(async () => (await noteOns(page, 3)).slice(0, 4)).toEqual([60, 64, 67, 60]);
    await sendMidi(page, [0x80, 48, 0]);
    await page.waitForTimeout(300); // steps already scheduled ahead may still go out
    const count = (await noteOns(page, 3)).length;
    await page.waitForTimeout(500);
    expect((await noteOns(page, 3)).length).toBe(count);
  });

  test('panic stops the Arp and leaves no note hanging', async ({ page }) => {
    await enableArp(page);
    await sendMidi(page, [0x90, 48, 100]);
    await expect.poll(async () => (await noteOns(page, 3)).length).toBeGreaterThanOrEqual(2);
    await page.getByTestId('panic').click();
    await expect.poll(() => countStatus(page, 0xb2)).toBeGreaterThan(0); // CC123 on channel 3
    const count = (await noteOns(page, 3)).length;
    await page.waitForTimeout(500);
    expect((await noteOns(page, 3)).length).toBe(count);
    expect(await countStatus(page, 0x82)).toBe(count); // a note-off for every note-on
  });

  test('tempo can be typed and tapped, and is remembered', async ({ page }) => {
    const tempo = page.getByTestId('tempo');
    await expect(tempo).toHaveValue('100');
    await tempo.fill('150');
    await tempo.blur();
    await start(page); // reload
    await expect(tempo).toHaveValue('150');
    await page.getByTestId('tap').click();
    await page.waitForTimeout(600);
    await page.getByTestId('tap').click();
    const bpm = Number(await tempo.inputValue());
    expect(bpm).toBeGreaterThanOrEqual(70);
    expect(bpm).toBeLessThanOrEqual(100);
  });

  test('the mod strip strums the held chord on channel 6; each note ends after 1.5 s', async ({ page }) => {
    await page.getByTestId('strum-open').click();
    await page.getByTestId('strum-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]); // C
    await sendMidi(page, [0xb0, 1, 0]);
    await sendMidi(page, [0xb0, 1, 127]);
    await expect.poll(() => noteOns(page, 6)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    await expect.poll(() => countStatus(page, 0x85)).toBe(7);
  });

  test('with the mod strip set to Vibrato, CC1 goes to the Melody instead', async ({ page }) => {
    await page.getByTestId('melody-open').click();
    await page.getByTestId('melody-port').selectOption(SYNTH);
    await page.getByTestId('strum-open').click();
    await page.getByTestId('strum-port').selectOption(SYNTH);
    await page.getByTestId('mod-strip').click(); // the panel's Strum · Vib switch
    await sendMidi(page, [0x90, 48, 100]);
    await sendMidi(page, [0xb0, 1, 90]);
    await expect.poll(async () => (await midiSent(page)).map((m) => m.data.join(','))).toContain('180,1,90');
    expect(await noteOns(page, 6)).toEqual([]);
  });

  test('the metronome toggles', async ({ page }) => {
    await page.getByTestId('metronome').click();
    await expect(page.getByTestId('metronome')).toHaveClass(/active/);
    await page.waitForTimeout(700); // a few clicks at 100 BPM, without errors
  });
});

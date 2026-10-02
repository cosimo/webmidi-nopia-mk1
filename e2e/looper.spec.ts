import { expect, test, type Page } from '@playwright/test';
import { collectErrors, midiSent, sendMidi, start, SYNTH, withFakeMidi } from './fakeMidi';

/** Note numbers of the Keys module's note-ons (MIDI channel 1), in order. */
async function keysNotes(page: Page): Promise<number[]> {
  return (await midiSent(page)).filter((m) => m.data[0] === 0x90 && m.data[2] > 0).map((m) => m.data[1]);
}

/** Records one bar holding C for a moment, and waits until the loop plays. */
async function recordBarOfC(page: Page) {
  const verse = page.getByTestId('slot-verse');
  await page.getByTestId('loop-rec').click();
  await expect(verse).toHaveAttribute('data-state', 'recording');
  await expect(verse).not.toHaveClass(/waiting/, { timeout: 3000 }); // recording starts on the next bar
  await sendMidi(page, [0x90, 48, 100]); // C
  await page.waitForTimeout(300);
  await sendMidi(page, [0x80, 48, 0]);
  await page.getByTestId('loop-rec').click(); // stops at the end of this bar, then plays
  await expect(verse).toHaveAttribute('data-state', 'playing', { timeout: 3000 });
}

test.describe('looper', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
    const tempo = page.getByTestId('tempo');
    await tempo.fill('240'); // one bar per second
    await tempo.blur();
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('records a bar of chords and plays it back over MIDI', async ({ page }) => {
    await recordBarOfC(page);
    await expect(page.getByTestId('slot-verse')).toHaveClass(/selected/);
    // played live once, then replayed every second
    await expect.poll(async () => (await keysNotes(page)).filter((n) => n === 60).length, { timeout: 5000 })
      .toBeGreaterThanOrEqual(3);
  });

  test('the loop follows a tonic change: chords are stored as table rows', async ({ page }) => {
    await recordBarOfC(page);
    await page.getByTestId('tonic-2').click(); // D major: the loop's I chord is now D, with F♯
    await expect.poll(async () => (await keysNotes(page)).filter((n) => n % 12 === 6).length, { timeout: 5000 })
      .toBeGreaterThan(0);
  });

  test('the Arp plays a loop chord from its first beat', async ({ page }) => {
    await page.getByTestId('arp-open').click();
    await page.getByTestId('arp-enabled').check();
    await page.getByTestId('arp-port').selectOption(SYNTH);
    await page.getByTestId('arp-rate').selectOption('1/4');
    const verse = page.getByTestId('slot-verse');
    await sendMidi(page, [0x90, 48, 100]); // held before recording starts: the loop's C begins on beat 1
    await page.getByTestId('loop-rec').click();
    await expect(verse).not.toHaveClass(/waiting/, { timeout: 3000 });
    await page.waitForTimeout(300);
    await sendMidi(page, [0x80, 48, 0]);
    await page.getByTestId('loop-rec').click();
    await expect(verse).toHaveAttribute('data-state', 'playing', { timeout: 3000 });
    // replayed notes carry port timestamps: an Arp step must start with the loop's chord
    await expect.poll(async () => {
      const sent = await midiSent(page);
      const starts = (status: number, note?: number) => sent
        .filter((m) => m.data[0] === status && m.data[2] > 0 && (note === undefined || m.data[1] === note) && m.t !== undefined)
        .map((m) => m.t!);
      const arp = starts(0x92);
      return starts(0x90, 60).some((t) => arp.some((a) => Math.abs(a - t) < 10));
    }, { timeout: 5000 }).toBe(true);
  });

  test('clear stops the loop', async ({ page }) => {
    await recordBarOfC(page);
    await page.getByTestId('loop-clear').click();
    await expect(page.getByTestId('slot-verse')).toHaveAttribute('data-state', 'empty');
    await page.waitForTimeout(300); // replayed steps already scheduled ahead may still go out
    const count = (await keysNotes(page)).length;
    await page.waitForTimeout(1500);
    expect((await keysNotes(page)).length).toBe(count);
  });
});

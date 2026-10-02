import { expect, test } from '@playwright/test';
import { collectErrors, midiSent, sendMidi, start, SYNTH, withFakeMidi } from './fakeMidi';

const sentBytes = async (page: Parameters<typeof midiSent>[0]) => (await midiSent(page)).map((m) => m.data.join(','));

test.describe('the Nopia faceplate', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the panel carries the instrument; ports and system buttons sit on the strip above it', async ({ page }) => {
    const plate = page.locator('.faceplate');
    for (const id of ['layout', 'tonality', 'table', 'tempo', 'tap', 'metronome', 'mod-strip', 'slot-verse', 'loop-rec', 'panic', 'oled-chord', 'tonic-0', 'key-48']) {
      await expect(plate.getByTestId(id)).toBeVisible();
    }
    for (const target of ['extensions', 'tempo', 'reverb', 'delay', 'tone', 'master', 'vol.keys', 'vol.strum']) {
      await expect(plate.locator(`[data-learn="${target}"]`).first()).toBeVisible();
    }
    const strip = page.locator('.strip');
    for (const id of ['input-select', 'output-all', 'monitor-toggle', 'learn-toggle', 'settings-toggle']) {
      await expect(strip.getByTestId(id)).toBeVisible();
    }
  });

  test('the chord octave is on the panel, the melody keys on a strip below it', async ({ page }) => {
    await expect(page.locator('.faceplate [data-testid="key-59"]')).toBeVisible();
    await expect(page.locator('.faceplate [data-testid="key-60"]')).toHaveCount(0);
    await expect(page.locator('.melody-strip [data-testid="key-60"]')).toBeVisible();
    await expect(page.locator('.melody-strip [data-testid="key-79"]')).toBeVisible();
    await page.getByTestId('melody-open').click();
    await page.getByTestId('melody-port').selectOption(SYNTH);
    await page.getByTestId('key-72').dispatchEvent('pointerdown', { pointerId: 1 });
    await expect(page.getByTestId('key-72')).toHaveClass(/pressed/);
    await expect.poll(() => sentBytes(page)).toContain('148,72,100');
  });

  test('a module\'s settings open from its label and close on a click elsewhere', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await expect(page.getByTestId('keys-port')).toBeVisible();
    await page.getByTestId('bass-open').click(); // one at a time
    await expect(page.getByTestId('keys-port')).toBeHidden();
    await expect(page.getByTestId('bass-port')).toBeVisible();
    await page.getByTestId('oled-chord').click();
    await expect(page.getByTestId('bass-port')).toBeHidden();
  });

  test('the toggles show their state on the panel', async ({ page }) => {
    await expect(page.getByTestId('layout-label')).toHaveText('Real');
    await page.getByTestId('layout').click();
    await expect(page.getByTestId('layout-label')).toHaveText('Static');
    await expect(page.getByTestId('layout')).toHaveClass(/lit/);
    await expect(page.getByTestId('table-label')).toHaveText('Sec. dom');
    await page.getByTestId('table').click();
    await expect(page.getByTestId('table-label')).toHaveText('Borrowed');
    await expect(page.getByTestId('table')).toHaveClass(/active/);
  });

  test('Key latches: the next chord key sets the tonic', async ({ page }) => {
    const key = page.getByTestId('key-button');
    await key.click();
    await expect(key).toHaveClass(/lit/);
    await page.getByTestId('key-55').dispatchEvent('pointerdown', { pointerId: 1 }); // G
    await page.getByTestId('key-55').dispatchEvent('pointerup', { pointerId: 1 });
    await expect(page.getByTestId('oled-status')).toContainText('G major');
    await expect(key).not.toHaveClass(/lit/);
    await page.getByTestId('key-50').dispatchEvent('pointerdown', { pointerId: 1 }); // unlatched: plays again
    await expect(page.getByTestId('oled-chord')).toHaveText('D'); // V of G
  });

  test('pressing Key again cancels it', async ({ page }) => {
    const key = page.getByTestId('key-button');
    await key.click();
    await key.click();
    await expect(key).not.toHaveClass(/lit/);
    await page.getByTestId('key-55').dispatchEvent('pointerdown', { pointerId: 1 });
    await expect(page.getByTestId('oled-chord')).toHaveText('G');
    await expect(page.getByTestId('oled-status')).toContainText('C major');
  });

  test('the Strum · Vib switch sends the mod strip to the Melody\'s vibrato', async ({ page }) => {
    await page.getByTestId('melody-open').click();
    await page.getByTestId('melody-port').selectOption(SYNTH);
    await page.getByTestId('mod-strip').click();
    await sendMidi(page, [0xb0, 1, 90]);
    await expect.poll(() => sentBytes(page)).toContain('180,1,90');
  });
});

import { expect, test } from '@playwright/test';
import { collectErrors, sendMidi, start, withFakeMidi } from './fakeMidi';

test.describe('settings, learn and monitor', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the mapping list learns a hardware CC', async ({ page }) => {
    await page.getByTestId('settings-toggle').click();
    await page.getByTestId('learn-reverb').click();
    await sendMidi(page, [0xb0, 30, 64]);
    await expect(page.getByTestId('binding-reverb')).toHaveText('CC 30 · ch 1');
  });

  test('learn mode: click a control, then move a hardware control', async ({ page }) => {
    await page.getByTestId('learn-toggle').click();
    const ext = page.locator('.controls [data-learn="extensions"]');
    await ext.click();
    await expect(ext).toHaveClass(/armed/);
    await sendMidi(page, [0xb1, 40, 0]);
    await expect(ext).not.toHaveClass(/armed/);
    await sendMidi(page, [0xb1, 40, 100]); // now bound; 100 is unambiguously absolute → level 3
    await sendMidi(page, [0x90, 48, 100]);
    await expect(page.getByTestId('oled-chord')).toHaveText('Cmaj13');
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('binding-extensions')).toHaveText('CC 40 · ch 2');
  });

  test('press-a-key sets the split point', async ({ page }) => {
    await page.getByTestId('settings-toggle').click();
    await page.getByTestId('split-point').locator('..').getByRole('button').click();
    await sendMidi(page, [0x90, 64, 100]);
    await expect(page.getByTestId('split-point')).toHaveValue('64');
    await sendMidi(page, [0x90, 62, 100]); // now in the chord zone: D → Dm
    await expect(page.getByTestId('oled-chord')).toHaveText('Dm');
  });

  test('the MIDI monitor shows incoming messages', async ({ page }) => {
    await page.getByTestId('monitor-toggle').click();
    await sendMidi(page, [0xb0, 14, 65]);
    await expect(page.getByTestId('monitor')).toContainText('CC         ch1  #14 = 65');
  });
});

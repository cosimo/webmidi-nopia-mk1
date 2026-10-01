import { expect, test } from '@playwright/test';
import { collectErrors, M32, sendMidi, setConnected, start, withFakeMidi, withoutWebMidi } from './fakeMidi';

test.describe('playing with a fake M32', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('chord keys play chords and the OLED explains them', async ({ page }) => {
    await sendMidi(page, [0x90, 48, 100]); // C
    await expect(page.getByTestId('oled-chord')).toHaveText('C');
    await expect(page.getByTestId('oled-roman')).toHaveText('I');
    await sendMidi(page, [0x90, 49, 100]); // C♯ → A7
    await expect(page.getByTestId('oled-chord')).toHaveText('A7');
    await expect(page.getByTestId('oled-fn')).toHaveText('V7/ii → Dm');
    await expect(page.getByTestId('oled-status')).toHaveText('C major · real · secondary dominants');
  });

  test('chord-zone keys are labelled and relabel live', async ({ page }) => {
    await expect(page.getByTestId('key-49')).toContainText('A7');
    await expect(page.getByTestId('key-49')).toContainText('V7/ii');
    await page.getByTestId('table').click();
    await expect(page.getByTestId('key-49')).toContainText('D♭');
    await page.getByTestId('tonic-2').click();
    await expect(page.getByTestId('key-50')).toContainText('D');
    await expect(page.getByTestId('oled-status')).toHaveText('D major · real · borrowed');
  });

  test('holding the key-select note and pressing a chord key sets the tonic', async ({ page }) => {
    await sendMidi(page, [0x90, 79, 100]);
    await sendMidi(page, [0x90, 55, 100]); // G
    await sendMidi(page, [0x80, 55, 0]);
    await sendMidi(page, [0x80, 79, 0]);
    await expect(page.getByTestId('oled-status')).toContainText('G major');
    await expect(page.getByTestId('tonic-7')).toHaveClass(/active/);
  });

  test('clicking on-screen keys plays chords', async ({ page }) => {
    await page.getByTestId('key-50').dispatchEvent('pointerdown', { pointerId: 1 });
    await expect(page.getByTestId('oled-chord')).toHaveText('Dm');
    await expect(page.getByTestId('key-50')).toHaveClass(/pressed/);
  });

  test('settings survive a reload', async ({ page }) => {
    await page.getByTestId('tonality').click();
    await page.getByTestId('tonic-9').click();
    await page.reload();
    await expect(page.getByTestId('oled-status')).toHaveText('A minor · real · secondary dominants');
  });

  test('unplugging the input shows a hint until it is back', async ({ page }) => {
    await setConnected(page, M32, false);
    await expect(page.getByTestId('banner-input')).toBeVisible();
    await setConnected(page, M32, true);
    await expect(page.getByTestId('banner-input')).toBeHidden();
  });
});

test('without Web MIDI, a banner explains and the on-screen keyboard still works', async ({ page }) => {
  await withoutWebMidi(page);
  await start(page);
  await expect(page.getByTestId('banner-midi')).toContainText('Chrome or Edge');
  await page.getByTestId('key-48').dispatchEvent('pointerdown', { pointerId: 1 });
  await expect(page.getByTestId('oled-chord')).toHaveText('C');
});

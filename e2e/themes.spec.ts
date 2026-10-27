// End-to-end tests for switchable themes (ADR-0056) at 320, 390 and 1280px: every theme passes the
// axe scan with no sideways scrolling on the main pages; the footer's chooser switches the theme
// and it is still on after a reload, with no flash of the default (the boot script); and a
// `?theme=` link opens in that theme and is remembered.
import { readdirSync, readFileSync } from 'node:fs'
import { expect, expectNoA11yViolations, expectNoHorizontalOverflow, test } from './fixtures'

// Every theme, read from tokens/themes/ like the build does.
const THEMES = readdirSync('tokens/themes').map((id) => ({
  id,
  ...(JSON.parse(readFileSync(`tokens/themes/${id}/meta.json`, 'utf8')) as {
    label: string
    default?: boolean
  }),
}))
const other = THEMES.find((t) => !t.default)
if (!other) throw new Error('These tests need a second theme in tokens/themes/')

for (const theme of THEMES) {
  for (const path of ['/', '/movie/1091', '/lists']) {
    test(`${path} in ${theme.label} has no axe violations and no horizontal overflow`, async ({
      page,
    }) => {
      await page.goto(`${path}?theme=${theme.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // The theme's fonts change line lengths; check the layout once they're in.
      await page.evaluate(() => document.fonts.ready)
      await expectNoA11yViolations(page)
      await expectNoHorizontalOverflow(page)
    })
  }
}

test('the footer chooser switches the theme, and it stays on after a reload', async ({ page }) => {
  await page.goto('/')
  const look = page.getByRole('combobox', { name: 'Look' })
  await look.selectOption(other.id)
  await expect(page.locator('html')).toHaveAttribute('data-theme', other.id)
  // On reload, the theme is on as soon as the page exists: the boot script in <head> sets it
  // before the body, so the default never paints first.
  await page.reload({ waitUntil: 'commit' })
  await page.waitForSelector('body')
  await expect(page.locator('html')).toHaveAttribute('data-theme', other.id)
  await expect(page.getByRole('combobox', { name: 'Look' })).toHaveValue(other.id)
})

test('a ?theme= link opens in that theme and is remembered', async ({ page }) => {
  await page.goto(`/?theme=${other.id}`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', other.id)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', other.id)
})

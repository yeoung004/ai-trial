import { test, expect, type Page } from '@playwright/test';
const roles = ['의사', '선생님', '헬스 트레이너'].map((title, i) => ({ id: `expert-${i+1}`, title, domain: '', reason: 'Assigned specialist', primaryQuestion: 'What matters?' }));
const result = { question: 'Layout test', mode: 'DEBATE', roles, experts: [], judge: { conclusion: 'A complete ruling. '.repeat(80), strongest_reason: 'Reason', recommendation: 'Next step' }, usage: { costComplete: false, totalCost: null } };
async function visibleDock(page: Page) {
  const box = await page.getByTestId('input-dock').boundingBox();
  const height = page.viewportSize()!.height;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  await expect(page.getByRole('textbox', { name: 'YOUR QUESTION' })).toBeVisible();
  expect(await page.evaluate(() => ({ vertical: document.documentElement.scrollHeight <= innerHeight, horizontal: document.documentElement.scrollWidth <= innerWidth }))).toEqual({ vertical: true, horizontal: true });
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/bootstrap' ? { models: [], providers: [], history: [{ id: 'fixture', question: 'Saved ruling', createdAt: '2026-10-17', mode: 'DEBATE' }] }
      : path === '/api/history/fixture' ? { result } : { models: [], providers: [] };
    await route.fulfill({ json: body });
  });
});
for (const [width, height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[390,700]]) {
  test(`input stays visible at ${width}x${height} including long final ruling`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await visibleDock(page);
    await page.screenshot({ path: testInfo.outputPath('idle.png') });
    await page.getByRole('textbox', { name: 'YOUR QUESTION' }).fill('Long input\n'.repeat(100));
    await visibleDock(page);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('button', { name: /Saved ruling/ }).click();
    await expect(page.getByRole('region', { name: 'Judge ruling' })).toBeAttached();
    await visibleDock(page);
    const scroll = page.getByTestId('courtroom-scroll');
    expect(await scroll.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
    await scroll.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await visibleDock(page);
    await page.screenshot({ path: testInfo.outputPath('final-ruling.png') });
  });
}
for (const mode of ['MANUAL', 'HYBRID']) test(`${mode} role edits update visible accessories inside animated SVG groups`, async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: mode, exact: true }).click();
  const profession = page.getByPlaceholder('Profession or specialty').first();
  const bot = page.locator('.expert-seat').first().getByTestId('agent-bot');
  for (const [title, prop] of [['Doctor','stethoscope'],['Teacher','book'],['Personal Trainer','dumbbell'],['Software Engineer','laptop'],['Chef','spatula'],['Scientist','flask'],['Lawyer','briefcase'],['Economist','chart'],['Designer','pencil']]) {
    await profession.fill(title);
    const accessory = bot.getByTestId(`accessory-${prop}`);
    await expect(accessory).toBeVisible();
    expect(await accessory.evaluate(e => !!e.closest('[data-testid="animated-body"]'))).toBe(true);
    const bounds = await accessory.evaluate(e => { const b = (e as SVGGraphicsElement).getBBox(); return { w:b.width, h:b.height }; });
    expect(bounds.w).toBeGreaterThan(5); expect(bounds.h).toBeGreaterThan(5);
  }
  await profession.fill('Personal Trainer');
  await bot.getByTestId('animated-body').evaluate(e => {
    const animation = e.getAnimations()[0];
    if (!animation) throw new Error('Missing bounce animation');
    animation.pause(); animation.currentTime = 1652;
  });
  const propBox = await bot.getByTestId('accessory-dumbbell').boundingBox();
  const svgBox = await bot.locator('svg').boundingBox();
  expect(propBox!.x).toBeGreaterThanOrEqual(svgBox!.x);
  expect(propBox!.x + propBox!.width).toBeLessThanOrEqual(svgBox!.x + svgBox!.width);
  expect(propBox!.y).toBeGreaterThanOrEqual(svgBox!.y);
  expect(propBox!.y + propBox!.height).toBeLessThanOrEqual(svgBox!.y + svgBox!.height);
  await page.screenshot({ path: testInfo.outputPath('trainer-bounce.png') });
  await profession.fill('Construction Worker');
  await expect(bot.getByTestId('hat-helmet')).toBeVisible();
  await profession.fill('unknown');
  await expect(bot).toHaveAttribute('data-profession', 'general');
});
test('automatic role events use the same appearance mapping during processing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ai-court-settings-v1', JSON.stringify({roleGeneratorModelId:'openai:test',defaultExpertModelId:'openai:test',judgeModelId:'openai:test'})));
  await page.route('**/api/executions**', route => route.fulfill({ json: route.request().method() === 'POST' ? { id:'running' } : { id:'running',status:'running',stage:'JUDGING',events:[{ type:'ROLES_CREATED',roles,at:'2026-10-17',stage:'RUNNING_EXPERTS',sessionId:'running' }] } }));
  await page.setViewportSize({ width:1280,height:720 });
  await page.goto('/');
  await page.getByRole('textbox', { name:'YOUR QUESTION' }).fill('Test');
  await page.getByRole('button', { name:'Summon the council' }).click();
  for (const prop of ['stethoscope','book','dumbbell']) await expect(page.getByTestId(`accessory-${prop}`)).toBeVisible();
  await visibleDock(page);
});
test('speech text is clamped with an ellipsis and no scrollbars', async ({ page }) => {
  await page.route('**/api/history/fixture', route => route.fulfill({ json: { result: {
    ...result, experts: [{ expertIndex: 0, answer: { stance: 'A detailed expert explanation. '.repeat(20) } }],
  } } }));
  await page.goto('/history');
  await page.getByRole('button', { name: /Saved ruling/ }).click();
  const bubble = page.locator('.expert-seat .speech-bubble').first();
  expect((await bubble.boundingBox())!.height).toBeLessThanOrEqual(100);
  const content = bubble.locator('.speech-bubble-content');
  expect(await content.evaluate(e => {
    const style = getComputedStyle(e);
    return { overflow: style.overflow, clamp: style.webkitLineClamp, clipped: e.scrollHeight > e.clientHeight };
  })).toEqual({ overflow: 'hidden', clamp: '3', clipped: true });
  expect(await bubble.evaluate(e => getComputedStyle(e).overflow)).toBe('visible');
});

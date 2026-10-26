import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const root = resolve(process.cwd(), '..');
const output = resolve(root, 'docs', 'screenshots');
const candidates = [
  process.env.MEDAGENT_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

await mkdir(output, { recursive: true });
const browserPath = candidates.find((path) => path);
const browser = await chromium.launch({
  headless: true,
  ...(browserPath ? { executablePath: browserPath } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByLabel('Patient de démonstration').waitFor();
  await page.screenshot({ path: resolve(output, '01-dossier.png') });

  await page.getByRole('button', { name: /Lancer l’analyse/ }).click();
  await page.getByRole('heading', { name: 'Synthèse explicable' }).waitFor();
  await page.getByRole('heading', { name: 'Agents spécialisés' }).locator('..').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, '02-agents.png') });

  await page.getByRole('heading', { name: 'Synthèse explicable' }).locator('..').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, '03-synthese.png') });

  await page.getByRole('heading', { name: 'Éléments explicatifs' }).locator('..').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, '04-explication-decision.png') });

  await page.getByRole('button', { name: 'Quelles sont les constantes actuelles ?' }).click();
  await page.getByText('Réponse extractive locale', { exact: false }).waitFor();
  await page.getByRole('heading', { name: 'Assistant du dossier' }).locator('..').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, '05-chat-rag.png') });
  console.log(`Captures enregistrées dans ${output}`);
} finally {
  await browser.close();
}

#!/usr/bin/env node
/**
 * Renders the Life OS mark into the PWA / favicon PNGs with the locally
 * installed Chrome (Playwright). Re-run after changing the mark:
 *
 *   node scripts/generate-icons.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const BACKGROUND = "#0b0d12";
const LIME = "oklch(0.87 0.19 127)";

/** The rising-bars mark on the app background. `inset` = safe-zone margin. */
function svg(inset, radius) {
  const size = 512;
  const box = size - inset * 2;
  const unit = box / 16;
  const bar = (x, y, h, opacity) =>
    `<rect x="${inset + x * unit}" y="${inset + y * unit}" width="${3 * unit}" height="${h * unit}" rx="${unit}" fill="${LIME}" opacity="${opacity}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>
  ${bar(1, 9, 6, 0.45)}${bar(6.5, 5, 10, 0.7)}${bar(12, 1, 14, 1)}
</svg>`;
}

const outputs = [
  // [file, pixel size, svg]
  ["public/icons/icon-192.png", 192, svg(96, 96)],
  ["public/icons/icon-512.png", 512, svg(96, 96)],
  // Maskable: full-bleed background, mark inside the 80 % safe zone.
  ["public/icons/maskable-512.png", 512, svg(136, 0)],
  ["src/app/apple-icon.png", 180, svg(96, 0)],
  ["src/app/icon.png", 64, svg(64, 112)],
];

writeFileSync(path.join(root, "src/app/icon.svg"), svg(64, 112));

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const page = await browser.newPage();
for (const [file, px, markup] of outputs) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${px}" height="${px}" `)}</body></html>`,
  );
  await page.screenshot({
    path: path.join(root, file),
    omitBackground: true,
    clip: { x: 0, y: 0, width: px, height: px },
  });
  console.log(`✓ ${file}`);
}
await browser.close();

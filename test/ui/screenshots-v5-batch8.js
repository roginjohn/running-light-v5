// v5 batch 8 screenshots: betting, win, no-win, Double Run, gamble and the paytable at 1920x1080, 390x844, 360x640 and 768x1024,
// rendered from dist/ into docs/design-v5/batch-8/. Fails on page overflow, a clipped control or text, any audit finding, or
// a console error. Run: npm run screenshots:batch8
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { startServer, launch, openGame } from './harness.js';
import { SCENES, VIEWPORTS, audit, layoutCheck, pause } from './a11y-audit.js';

const OUT = path.resolve(new URL('../../docs/design-v5/batch-8/', import.meta.url).pathname);
const STATES = ['betting', 'win', 'no-win', 'double-run', 'gamble', 'paytable'];
const { server, url } = await startServer();
const browser = await launch();
mkdirSync(OUT, { recursive: true });
let n = 0;
try {
  for (const [w, h, touch] of VIEWPORTS) {
    for (const name of STATES) {
      const page = await openGame(browser, url, { seed: 1, timeScale: 8, width: w, height: h, touch });
      await SCENES[name](page);
      await pause();
      const c = await page.evaluate(layoutCheck);
      const a = await page.evaluate(audit, { touch });
      if (c.scrollW > c.w || c.scrollH > c.h || c.off.length || c.clipped.length) throw new Error(`layout check failed: ${name} at ${w}x${h}: ${JSON.stringify(c)}`);
      const bad = [...a.text, ...a.nonText, ...a.font, ...a.body, ...a.tap];
      if (bad.length) throw new Error(`audit failed: ${name} at ${w}x${h}:\n${bad.join('\n')}`);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) });
      if (page.__issues.length) throw new Error(page.__issues.join('\n'));
      await page.close();
      n++;
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`${n} screenshots written to ${OUT}`);

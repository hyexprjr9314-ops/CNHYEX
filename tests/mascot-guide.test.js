import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.html', import.meta.url);
const hanyangMascotUrl = new URL('../assets/mascot-hanyang-transparent.png', import.meta.url);
const chungnamMascotUrl = new URL('../assets/mascot-chungnam-transparent.png', import.meta.url);
const hanyangSpriteUrl = new URL('../assets/mascot-hanyang-sprite.png', import.meta.url);
const chungnamSpriteUrl = new URL('../assets/mascot-chungnam-sprite.png', import.meta.url);

test('contextual mascot guide remains optional, accessible, and isolated from evaluation submission', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /id="mascot-guide"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(html, /assets\/mascot-hanyang-transparent\.png/);
  assert.match(html, /assets\/mascot-chungnam-transparent\.png/);
  assert.match(html, /assets\/mascot-hanyang-sprite\.png/);
  assert.match(html, /assets\/mascot-chungnam-sprite\.png/);
  assert.match(html, /id="mascot-guide-action"[\s\S]*runMascotGuideAction/);
  assert.doesNotMatch(html, /mascot-guide-bubble[\s\S]*mix-blend-mode:\s*multiply/);
  assert.match(html, /mascot-guide-image[\s\S]*position:\s*absolute[\s\S]*background-size:\s*400% 200%/);
  assert.match(html, /function startMascotAnimation\([\s\S]*mascotAnimationFrame = \(mascotAnimationFrame \+ 1\) % 8/);
  assert.match(html, /function initializeMascotDragging\([\s\S]*pointerdown[\s\S]*cnhy_mascot_position/);
  assert.match(html, /id="mascot-target-cue"[\s\S]*여기를 클릭하세요!/);
  assert.doesNotMatch(html, /setTimeout\(hideMascotGuide/);
  assert.match(html, /prefers-reduced-motion[\s\S]*#mascot-guide\.is-visible/);
  assert.match(html, /function showMascotGuide\([\s\S]*checkUserRole\(currentLoggedInUser\)\.isPrivileged\) return/);
  assert.match(html, /submit_evaluation_central[\s\S]*if \(submitError\)[\s\S]*showMascotGuide\(/);
  assert.doesNotMatch(html, /mascot-guide[\s\S]{0,500}z-index:\s*9999/);
});

test('mascot assets use real alpha transparency', async () => {
  for (const assetUrl of [hanyangMascotUrl, chungnamMascotUrl, hanyangSpriteUrl, chungnamSpriteUrl]) {
    const png = await readFile(assetUrl);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, `${assetUrl.pathname} must be an RGBA PNG`);
  }
});

test('mascot guidance is limited to regular users and absent from administrator and executive views', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.doesNotMatch(html, /showAdminMascotGuide|showExecutiveMascotGuide|showPrivilegedHomeGuide/);
  assert.doesNotMatch(html, /adminMascotFlow|cnhy_mascot_admin|cnhy_mascot_executive|cnhy_mascot_home/);
  assert.match(html, /function showPendingEvaluationGuide\(assignments\)[\s\S]*checkUserRole\(currentLoggedInUser\)\.isPrivileged\) return/);
  assert.match(html, /function showNoActiveEvaluationGuide\(\)[\s\S]*roleInfo\.isPrivileged[\s\S]*현재 시작된 평가가 없습니다/);
});

test('inactive-cycle mascot guide remains scoped to regular users', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /function showNoActiveEvaluationGuide\(\)[\s\S]*roleInfo\.isPrivileged[\s\S]*현재 시작된 평가가 없습니다/);
  assert.match(html, /renderLoggedInWelcome\(totalAssignmentCount\);[\s\S]*showNoActiveEvaluationGuide\(\);/);
});

test('mobile UI hides the mascot guide and its target cue', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /@media \(max-width: 640px\)[\s\S]*#mascot-guide,[\s\S]*#mascot-target-cue[\s\S]*display: none !important/);
});

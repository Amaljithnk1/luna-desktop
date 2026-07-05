import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok, detail });
const exists = p => fs.existsSync(path.join(root, p));
const size = p => exists(p) ? fs.statSync(path.join(root, p)).size : 0;

add('package.json exists', exists('package.json'));
add('Electron main exists', exists('src/electron/main.ts'));
add('React renderer exists', exists('src/renderer/main.tsx'));
add('Luna icon exists', exists('assets/icon.ico') && exists('assets/icon.png'), `ico=${size('assets/icon.ico')} png=${size('assets/icon.png')}`);
add('Demo assets exist', exists('demo-assets/demo_user_resume.docx') && exists('demo-assets/local_ai_research.pdf') && exists('demo-assets/luna_ocr_demo.png'));
add('Docs exist', exists('docs/DEMO_SCRIPT.md') && exists('docs/INSTALL_GUIDE.md') && exists('docs/LUNA_PITCH_DECK.pptx'));
add('Submission docs exist', exists('submission/SUBMISSION_CHECKLIST.md') && exists('submission/TELEGRAM_MESSAGE.md'));

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  add('Build scripts exist', !!pkg.scripts?.build && !!pkg.scripts?.['dist:win-dir'] && !!pkg.scripts?.dist);
  add('Windows icon configured', pkg.build?.win?.icon === 'assets/icon.ico');
  const resources = JSON.stringify(pkg.build?.extraResources || []);
  add('Demo assets packaged', resources.includes('demo-assets'));
  add('Icon packaged', resources.includes('assets/icon.png'));
} catch (e) {
  add('package.json parse', false, e.message);
}

try {
  execSync('npm run build', { stdio: 'pipe' });
  add('npm run build', true);
} catch (e) {
  add('npm run build', false, e.stdout?.toString() || e.message);
}

if (exists('release/win-unpacked/Luna.exe')) add('Windows unpacked build exists', true, 'release/win-unpacked/Luna.exe');
else if (exists('release/win-unpacked')) add('Windows unpacked directory exists', true, 'release/win-unpacked');
else add('Windows unpacked build exists', false, 'Run npm run dist:win-dir');

const passed = checks.filter(c => c.ok).length;
const failed = checks.length - passed;
console.log('\nLuna Preflight Report');
console.log('='.repeat(70));
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log('='.repeat(70));
console.log(`Passed: ${passed}/${checks.length}`);
if (failed) {
  console.log(`Failed: ${failed}`);
  process.exitCode = 1;
} else {
  console.log('All preflight checks passed.');
}

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const outDir = 'submission-bundle';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, 'luna_submission_support.zip');
const zip = new AdmZip();

const addIfExists = (p, dest = p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) zip.addLocalFolder(p, dest);
  else zip.addLocalFile(p, path.dirname(dest), path.basename(dest));
};

[
  'README.md',
  'package.json',
  'docs',
  'submission',
  'demo-assets',
  'assets',
  'scripts/build-windows-release.ps1',
  'scripts/build-windows-release.bat',
  'scripts/preflight.mjs',
  'scripts/ipc-check.mjs'
].forEach(p => addIfExists(p));

zip.writeZip(zipPath);
console.log(`Created ${zipPath} (${fs.statSync(zipPath).size} bytes)`);

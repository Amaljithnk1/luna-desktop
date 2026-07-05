import fs from 'node:fs';

const preload = fs.readFileSync('src/electron/preload.ts', 'utf8');
const main = fs.readFileSync('src/electron/main.ts', 'utf8');
const invokes = [...preload.matchAll(/ipcRenderer\.invoke\(['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
const handles = [...main.matchAll(/ipcMain\.handle\(['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
const invokeSet = new Set(invokes);
const handleSet = new Set(handles);
const missing = [...invokeSet].filter(ch => !handleSet.has(ch));
const unused = [...handleSet].filter(ch => !invokeSet.has(ch));
console.log('Luna IPC Check');
console.log('='.repeat(60));
console.log(`Renderer invoke channels: ${invokeSet.size}`);
console.log(`Main handle channels:      ${handleSet.size}`);
if (missing.length) {
  console.log('\nMissing handlers:');
  for (const ch of missing) console.log(`❌ ${ch}`);
}
if (unused.length) {
  console.log('\nHandlers not exposed in preload:');
  for (const ch of unused) console.log(`⚠️  ${ch}`);
}
if (!missing.length) console.log('\n✅ All exposed invoke channels have main handlers.');
if (missing.length) process.exitCode = 1;

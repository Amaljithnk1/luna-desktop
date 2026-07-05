// Run with: node test-ollama.mjs
// This isolates the exact call Luna makes, so we can see the real error.

const urls = [
  'http://127.0.0.1:11434/api/tags',
  'http://localhost:11434/api/tags',
];

for (const url of urls) {
  console.log(`\n--- Testing ${url} ---`);
  try {
    const res = await fetch(url);
    console.log('Status:', res.status, res.statusText);
    const json = await res.json();
    console.log('Models found:', (json.models || []).map(m => m.name));
  } catch (e) {
    console.log('FAILED:', e.message);
    console.log('Full error:', e);
  }
}

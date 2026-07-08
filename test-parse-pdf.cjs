const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function test() {
  const filePath = path.join(__dirname, 'demo-assets', 'local_ai_research.pdf');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  await parser.destroy();
  console.log('Successfully parsed PDF!');
  console.log('Result text length:', result.text.length);
  console.log('First 500 characters:');
  console.log(result.text.slice(0, 500));
}

test().catch(e => {
  console.error('Parsing failed:', e);
});

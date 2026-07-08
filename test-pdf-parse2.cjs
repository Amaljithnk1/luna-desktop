const pdfParse = require('pdf-parse');
console.log('pdfParse.PDFParse type:', typeof pdfParse.PDFParse);
console.log('pdfParse.PDFParse keys:', Object.keys(pdfParse.PDFParse));
console.log('pdfParse.PDFParse prototype:', Object.getOwnPropertyNames(pdfParse.PDFParse.prototype || {}));

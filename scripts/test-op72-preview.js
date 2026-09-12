const fs = require('fs');

const html = fs.readFileSync('op-72.html', 'utf8');
const js = fs.readFileSync('op-72.js', 'utf8');
const css = fs.readFileSync('app.css', 'utf8');

console.log('--- Checking op-72.html ---');
const requiredHtml = [
  'jspdf.umd.min.js',
  'html2canvas.min.js',
  'id="op72PageSize"',
  'id="op72PrintBtn"',
  'id="op72PrintArea"',
  'id="op72PrintHeader"',
  'id="op72PrintGroup"',
  'id="op72PrintMonth"'
];
let allHtmlOk = true;
requiredHtml.forEach(r => {
  const found = html.includes(r);
  console.log(r + ': ' + (found ? 'OK' : 'MISSING'));
  if (!found) allHtmlOk = false;
});

console.log('\n--- Checking op-72.js syntax ---');
try {
  new Function(js);
  console.log('Syntax: OK (no syntax errors)');
} catch (e) {
  console.error('Syntax error:', e.message);
}

console.log('\n--- Checking app.css print rules ---');
const requiredCss = [
  'op72-print-legal',
  'op72-print-a3',
  'op72-print-a4',
  '#op72PrintArea',
  '.op72-print-header',
  '#op72Table'
];
let allCssOk = true;
requiredCss.forEach(c => {
  const found = css.includes(c);
  console.log(c + ': ' + (found ? 'OK' : 'MISSING'));
  if (!found) allCssOk = false;
});

if (allHtmlOk && allCssOk) {
  console.log('\nALL CHECKS PASSED SUCCESSFULLY!');
} else {
  console.error('\nSOME CHECKS FAILED!');
  process.exit(1);
}

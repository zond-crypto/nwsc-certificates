const fs = require('fs');
const t = fs.readFileSync('src/components/CertificateEditor.tsx', 'utf8');
const stack = [];
const pairs = { '(': ')', '{': '}', '[': ']' };
for (let i = 0; i < t.length; i++) {
  const ch = t[i];
  if (pairs[ch]) stack.push([ch, i]);
  else if (Object.values(pairs).includes(ch)) {
    if (!stack) {
      console.log('Extra close', ch, i);
      process.exit(0);
    }
    const [op] = stack.pop();
    if (pairs[op] !== ch) {
      console.log('Mismatch', i, 'expected', pairs[op], 'got', ch);
      process.exit(0);
    }
  }
}
if (stack.length) console.log('Unclosed', stack[stack.length - 1]); else console.log('Balanced');

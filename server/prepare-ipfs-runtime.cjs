const fs = require('node:fs');
const path = require('node:path');

// Vercel's dependency compiler cannot expose the named Crypto export from this
// package's transformed ESM build. Its original CJS build exports the same API.
const file = path.join(__dirname, '../node_modules/@peculiar/webcrypto/package.json');
const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
if (metadata.version !== '1.7.1' || metadata.main !== 'build/webcrypto.js') {
  throw new Error('Review the IPFS WebCrypto compatibility adapter for this package version.');
}
if (metadata.exports['.'].import !== './build/webcrypto.js') {
  metadata.exports['.'].import = './build/webcrypto.js';
  fs.writeFileSync(file, JSON.stringify(metadata, null, 2) + '\n');
}

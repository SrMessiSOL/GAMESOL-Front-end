const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const integer = require('bigint-buffer');

test('native-free bigint adapter preserves unsigned values and byte order for Solana widths', () => {
  for (let width = 0; width <= 64; width++) {
    for (let run = 0; run < 32; run++) {
      const bytes = randomBytes(width);
      const original = Buffer.from(bytes);
      const expectedBE = bytes.length ? BigInt('0x' + bytes.toString('hex')) : 0n;
      const expectedLE = bytes.length ? BigInt('0x' + Buffer.from(bytes).reverse().toString('hex')) : 0n;
      assert.equal(integer.toBigIntBE(bytes), expectedBE);
      assert.equal(integer.toBigIntLE(bytes), expectedLE);
      assert.deepEqual(integer.toBufferBE(expectedBE, width), bytes);
      assert.deepEqual(integer.toBufferLE(expectedLE, width), bytes);
      assert.deepEqual(bytes, original);
    }
  }
  for (const value of [0n, 1n, 255n, 256n, (1n << 64n) - 1n]) {
    const expected = Buffer.alloc(8);
    expected.writeBigUInt64LE(value);
    assert.deepEqual(integer.toBufferLE(value, 8), expected);
  }
});

test('native-free bigint rejects malformed values, overflow and unbounded allocation', () => {
  for (const value of [null, undefined, {}, [], 'ff', new Uint8Array(8)]) {
    assert.throws(() => integer.toBigIntLE(value), TypeError);
    assert.throws(() => integer.toBigIntBE(value), TypeError);
  }
  for (const width of [-1, 1.5, NaN, Infinity, 4097]) {
    assert.throws(() => integer.toBufferLE(1n, width), RangeError);
  }
  assert.throws(() => integer.toBufferBE(-1n, 8), RangeError);
  assert.throws(() => integer.toBufferLE(256n, 1), RangeError);
  assert.throws(() => integer.toBufferLE(1, 8), TypeError);
  assert.throws(() => integer.toBufferLE(1n, 0), RangeError);
  assert.throws(() => integer.toBigIntLE(Buffer.alloc(4097)), RangeError);
});

test('SPL Token account layout preserves u64 amounts after native dependency removal', () => {
  const { AccountLayout, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
  const { PublicKey } = require('@solana/web3.js');
  for (const amount of [0n, 1n, 1_000_000n, (1n << 64n) - 1n]) {
    const bytes = Buffer.alloc(AccountLayout.span);
    const mint = TOKEN_PROGRAM_ID;
    const owner = new PublicKey('11111111111111111111111111111111');
    AccountLayout.encode({ mint, owner, amount, delegateOption: 0, delegate: owner,
      state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
      closeAuthorityOption: 0, closeAuthority: owner }, bytes);
    assert.equal(bytes.readBigUInt64LE(64), amount);
    const decoded = AccountLayout.decode(bytes);
    assert.equal(decoded.amount, amount);
    assert.ok(decoded.mint.equals(mint));
    assert.ok(decoded.owner.equals(owner));
  }
});

test('all installed legacy layout consumers resolve the native-free implementation', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json'), 'utf8'));
  const entries = Object.entries(lock.packages).filter(([name]) => /(^|\/)node_modules\/bigint-buffer$/.test(name));
  assert.ok(entries.length);
  for (const [, pkg] of entries) assert.equal(pkg.resolved, 'vendor/bigint-buffer-js');
  const implementation = fs.readFileSync(require.resolve('bigint-buffer'), 'utf8');
  assert.doesNotMatch(implementation, /require\(['"](?:bindings|node-gyp-build)['"]\)|\.node['"]/);
});

test('legacy layout u64 through u256 values preserve bytes at nonzero offsets', () => {
  const layouts = require('@solana/buffer-layout-utils');
  for (const bits of [64, 128, 192, 256]) {
    for (const suffix of ['', 'be']) {
      const littleEndian = suffix === '';
      const layout = layouts[`u${bits}${suffix}`]();
      const value = (1n << BigInt(bits)) - 37n;
      const bytes = Buffer.alloc(bits / 8 + 4, 0xab);
      layout.encode(value, bytes, 2);
      assert.equal(layout.decode(bytes, 2), value);
      assert.deepEqual(bytes.subarray(0, 2), Buffer.from([0xab, 0xab]));
      assert.deepEqual(bytes.subarray(-2), Buffer.from([0xab, 0xab]));
      const expected = Buffer.from(value.toString(16), 'hex');
      if (littleEndian) expected.reverse();
      assert.deepEqual(bytes.subarray(2, -2), expected);
    }
  }
});

test('patched TOML parses Anchor workspace config and rejects hostile nesting safely', () => {
  const toml = require('toml');
  const result = toml.parse('[programs.devnet]\ngame_state = "J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq"\n[provider]\ncluster = "devnet"\n');
  assert.equal(result.provider.cluster, 'devnet');
  assert.equal(result.programs.devnet.game_state, 'J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
  assert.throws(() => toml.parse('value=' + '['.repeat(3000) + '1' + ']'.repeat(3000)),
    error => !(error instanceof RangeError));
  try { toml.parse('__proto__.gamesolPolluted = true'); } catch {}
  assert.equal({}.gamesolPolluted, undefined);
});

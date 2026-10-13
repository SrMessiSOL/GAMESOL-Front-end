const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {PublicKey} = require('@solana/web3.js');
const {instructions, validateMultisig} = require('./prepare-ufo-squads-upgrade.cjs');

test('upgrade preserves existing program authority and routes surplus to its vault', () => {
  const [upgrade, activate] = instructions('11111111111111111111111111111111');
  assert.equal(upgrade.data.readUInt32LE(), 3);
  assert.equal(upgrade.keys.length, 7);
  assert(upgrade.keys[3].pubkey.equals(upgrade.keys[6].pubkey));
  assert(upgrade.keys[6].isSigner);
  assert.equal(activate.data.length, 41);
  assert.equal(activate.data[40], 1);
  assert(activate.keys[0].pubkey.equals(upgrade.keys[6].pubkey));
});

test('member validation rejects authority drift', () => {
  const d = Buffer.alloc(90);
  crypto.createHash('sha256').update('account:Ms').digest().copy(d, 0, 0, 8);
  d.writeUInt16LE(1, 8); d.writeUInt32LE(1, 54);
  new PublicKey('5LdLeYrc5zMsPV2sn7amFQwDbYSmvakxZPDmm5YZmPvR').toBuffer().copy(d, 58);
  const a = {owner: new PublicKey('SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu'), data: d};
  assert.equal(validateMultisig(a), 0);
  d.writeUInt16LE(2, 8);
  assert.throws(() => validateMultisig(a), /membership changed/);
});

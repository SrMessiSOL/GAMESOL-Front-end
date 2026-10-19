const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PublicKey, TransactionInstruction, ComputeBudgetProgram, TransactionMessage, VersionedTransaction} = require('@solana/web3.js');
const {colonyComputeBudget} = require('./frontend-ts-loader.cjs').frontendLoader()('colony-compute-budget.ts');
const game = new PublicKey('J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
const lazor = new PublicKey('4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS');
const colony = new TransactionInstruction({programId:game, keys:[], data:Buffer.from([91,184,105,243,90,175,137,217])});
const wrapper = new TransactionInstruction({programId:lazor, keys:[], data:Buffer.alloc(32)});

test('colony resolution gives the outer Lazor transaction 400k units', () => {
  const result = colonyComputeBudget([colony], [wrapper]);
  assert.equal(result.length, 2);
  assert.equal(ComputeBudgetProgram.programId.equals(result[0].programId), true);
  assert.equal(result[0].data.readUInt32LE(1), 400000);
  assert.equal(result[1], wrapper);
  const tx = new VersionedTransaction(new TransactionMessage({payerKey:game, recentBlockhash:game.toBase58(), instructions:result}).compileToV0Message());
  assert.ok(tx.serialize().length < 1232);
});

test('only colony commands change; wrong program and other commands remain untouched', () => {
  const wrapped = [wrapper];
  assert.equal(colonyComputeBudget([], wrapped), wrapped);
  assert.equal(colonyComputeBudget([wrapper], wrapped), wrapped);
  assert.equal(colonyComputeBudget([new TransactionInstruction({...colony, programId:lazor})], wrapped), wrapped);
});

test('replaces a limit without duplicating it or removing priority price', () => {
  const price = ComputeBudgetProgram.setComputeUnitPrice({microLamports:1});
  const result = colonyComputeBudget([colony], [ComputeBudgetProgram.setComputeUnitLimit({units:200000}), price, wrapper]);
  assert.equal(result.length, 3);
  assert.equal(result[1], price);
  assert.equal(result[2], wrapper);
});

test('session preflight and submission share the budget; passkey submission also uses it', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/player-funded-session.ts'), 'utf8');
  assert.match(source, /const submission = colonyComputeBudget\(instructions, \[\.\.\.precompiles, \.\.\.wrapped\]\)/);
  assert.match(source, /preflightCommand\(rpc, sponsorPayer, submission,/);
  assert.match(source, /sendSponsored\(rpc, submission, \[sessionKeypair\], latest\)/);
  assert.match(source, /sendSponsored\(rpc, colonyComputeBudget\(instructions, \[\.\.\.precompiles, \.\.\.wrapped\]\)/);
});

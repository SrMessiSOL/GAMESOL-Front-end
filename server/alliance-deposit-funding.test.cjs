const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { PublicKey, Keypair, TransactionInstruction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const source = ts.createSourceFile('game-state.ts', fs.readFileSync(require.resolve('../src/game-state.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'GameClient');
const method = cls.members.find(n => n.name?.getText(source) === 'depositAllianceResources');
const key = () => Keypair.generate().publicKey;
const moduleTarget = { exports: {} };
class Writer { writeU8() {} writeU64() {} toBuffer() { return Buffer.alloc(34); } }
vm.runInNewContext(ts.transpileModule('class Subject {' + method.getText(source) + '}\nmodule.exports=Subject;', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleTarget, PublicKey, TransactionInstruction, BorshWriter: Writer,
  VAULT_MIN_BALANCE_LAMPORTS: 50000000, GAME_STATE_PROGRAM_ID: key(), TOKEN_PROGRAM_ID,
  deriveAssociatedTokenAccount: key, deriveAuthorizedVaultPda: key,
  deriveAllianceMembershipPda: key, deriveAllianceTreasuryPda: key,
  deriveGameConfigPda: key, deriveStoreConfigPda: key,
  IX: { depositAllianceResources: Buffer.alloc(8), depositAllianceResourcesVault: Buffer.alloc(8) },
  encodeInstruction: (discriminator, data) => Buffer.concat([discriminator, data]), Buffer,
});

async function run({ sponsored = true, vault = true, antimatter = 0n, authorized = true } = {}) {
  const subject = new moduleTarget.exports(), owner = key(), mint = key();
  let balanceChecks = 0, signed = '';
  Object.assign(subject, {
    provider: { wallet: { publicKey: owner } }, preferVaultSigning: vault,
    gameplayVaultExecutor: sponsored ? { vaultPublicKey: owner } : null,
    getAllianceMembership: async () => ({ alliance: key().toBase58() }),
    getGameConfig: async () => ({ antimatterMint: mint.toBase58() }),
    getStoreConfig: async () => ({ admin: key().toBase58() }),
    getAllianceTreasury: async () => ({}),
    prepareVaultSigningForAuthority: async () => { if (!authorized) throw Error('Unauthorized'); return owner; },
    ensureVaultLamports: async () => { balanceChecks++; },
    getOrCreateVaultTokenAccountInstructions: async () => ({ tokenAccount: key(), setupInstructions: [] }),
    findUserTokenAccountForMint: async () => key(),
    sendVaultInstruction: async () => { signed = 'vault'; return 'signature'; },
    sendInstruction: async () => { signed = 'passkey'; return 'signature'; },
  });
  await subject.depositAllianceResources(key(), 1, 2, { deuterium: 500n, antimatter });
  return { balanceChecks, signed };
}

test('sponsored resource-only deposits do not demand a player SOL reserve', async () => {
  assert.deepEqual(await run(), { balanceChecks: 0, signed: 'vault' });
});
test('self-funded legacy vault retains its SOL balance check', async () => {
  assert.deepEqual(await run({ sponsored: false }), { balanceChecks: 1, signed: 'vault' });
});
test('ANTIMATTER deposits remain passkey-authorized rather than delegated', async () => {
  assert.deepEqual(await run({ antimatter: 100000000n }), { balanceChecks: 0, signed: 'passkey' });
});
test('sponsored resource deposits still require valid vault authorization', async () => {
  await assert.rejects(run({ authorized: false }), /Unauthorized/);
});

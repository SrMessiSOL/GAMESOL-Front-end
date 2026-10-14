const { PublicKey } = require('@solana/web3.js');
const { getMint, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { devnetConnection } = require('./ufo-devnet-rpc.cjs');
const { decoder } = require('./read-devnet-game-checkpoint.cjs');

async function main() {
  const { connection } = await devnetConnection();
  const { program, deriveStoreConfigPda, deserializeStoreConfig } = decoder();
  const address = deriveStoreConfigPda();
  const account = await connection.getAccountInfo(address, 'confirmed');
  if (!account) {
    console.log(JSON.stringify({ network: 'devnet', store: address.toBase58(), initialized: false }));
    return;
  }
  if (!account.owner.equals(program)) throw new Error('Store owner mismatch');
  const config = deserializeStoreConfig(Buffer.from(account.data));
  const mint = new PublicKey(config.usdcMint);
  const info = await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
  const owner = new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');
  const balance = accounts.value.reduce((sum, row) => sum + BigInt(row.account.data.parsed.info.tokenAmount.amount), 0n);
  console.log(JSON.stringify({
    network: 'devnet', store: address.toBase58(), initialized: true, ...config,
    decimals: info.decimals, mintAuthority: info.mintAuthority?.toBase58() ?? null,
    freezeAuthority: info.freezeAuthority?.toBase58() ?? null,
    gameAccountTokenBalance: balance.toString(),
  }, null, 2));
}

if (require.main === module) main().catch(() => {
  console.error('Devnet store read failed; no transaction was sent.');
  process.exitCode = 1;
});

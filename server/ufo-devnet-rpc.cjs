const fs = require('node:fs');
const path = require('node:path');
const {Connection} = require('@solana/web3.js');
const {DEVNET_GENESIS} = require('./ufo-attestations.cjs');

async function devnetConnection() {
  const env = require('node:util').parseEnv(fs.readFileSync(path.join(__dirname, '../.env.nft.server.local'), 'utf8'));
  let url = env.SOLANA_RPC_URL;
  if (!url) {
    const mainnet = new URL(env.GAMESOL_MAINNET_DAS_RPC_URL);
    if (mainnet.hostname !== 'mainnet.helius-rpc.com' || mainnet.protocol !== 'https:') throw Error('No recognized Helius configuration.');
    mainnet.hostname = 'devnet.helius-rpc.com';
    url = mainnet.toString();
  }
  const connection = new Connection(url, {commitment: 'confirmed', disableRetryOnRateLimit: true});
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw Error('Devnet genesis verification failed.');
  return {connection, url};
}
module.exports = {devnetConnection};

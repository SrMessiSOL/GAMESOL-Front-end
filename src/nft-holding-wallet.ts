import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { StandardConnectFeature, StandardEventsFeature } from '@wallet-standard/features';

export type HoldingWallet = Wallet & { features: StandardConnectFeature & Partial<StandardEventsFeature> };

export function holdingAccount(accounts: readonly WalletAccount[]) {
  return accounts.find((account) => account.chains.includes('solana:mainnet')) ?? null;
}

export async function connectHoldingWallet(wallet: HoldingWallet, silent = false) {
  const { accounts } = await wallet.features['standard:connect'].connect({ silent });
  const account = holdingAccount(accounts);
  if (!account) throw new Error('No mainnet Solana account is connected in this holding wallet.');
  return account;
}

import type { Wallet, WalletAccount } from '@wallet-standard/base';
import type { StandardConnectFeature, StandardEventsFeature } from '@wallet-standard/features';

export type HoldingWallet = Wallet & { features: StandardConnectFeature & Partial<StandardEventsFeature> };

export function holdingAccount(accounts: readonly WalletAccount[]) {
  return accounts.find((account) => account.chains.includes('solana:mainnet')) ?? null;
}

export async function connectHoldingWallet(wallet: HoldingWallet, silent = false, timeoutMs = 60_000): Promise<WalletAccount> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timer = setTimeout(() => finish(undefined, new Error(`${wallet.name} connection timed out. Close any wallet prompt, then retry.`)), timeoutMs);
    function finish(account?: WalletAccount, error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer); unsubscribe?.();
      if (error) reject(error); else resolve(account!);
    }
    try {
      // Some extensions publish approved accounts before settling connect().
      const remove = wallet.features['standard:events']?.on('change', changes => {
        const account = holdingAccount(changes.accounts ?? []);
        if (account) finish(account);
      });
      if (settled) remove?.(); else unsubscribe = remove;
      Promise.resolve(wallet.features['standard:connect'].connect({ silent })).then(({ accounts }) => {
        const account = holdingAccount(accounts);
        if (account) finish(account);
        else finish(undefined, new Error('No mainnet Solana account is connected in this holding wallet.'));
      }, error => finish(undefined, error));
    } catch (error) { finish(undefined, error); }
  });
}

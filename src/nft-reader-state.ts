export type NftOwnershipStatus = 'disconnected' | 'checking' | 'unavailable' | 'expired' | 'verified';

export function nftReaderView<T extends { id: string }>(
  link: { assets: T[]; selectedAsset: string | null; checkedAt: number } | null,
  busy: boolean, error: string, now = Date.now(),
) {
  const age = link ? now - link.checkedAt : Infinity;
  const ownershipReady = Boolean(link && !busy && !error && age >= 0 && age < 120000);
  const ownershipStatus: NftOwnershipStatus = busy ? 'checking' : error ? 'unavailable'
    : !link ? 'disconnected' : !ownershipReady ? 'expired' : 'verified';
  // Keep cosmetic identity during a same-wallet read; eligibility is separate.
  const flagship = link?.assets.find(asset => asset.id === link.selectedAsset) ?? null;
  return { flagship, ownershipReady, ownershipStatus };
}

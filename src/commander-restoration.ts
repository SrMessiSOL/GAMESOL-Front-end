export function restoredCommanderAsset(
  assets: { id: string }[], owner: string, selected: string | null,
  saved: { commander: string; record: { owner: string; asset: string; verifiedAt: bigint } | null } | null,
  commander: string,
) {
  const record = saved?.commander === commander ? saved.record : null;
  const candidate = record
    ? record.owner === owner && record.verifiedAt > 0n ? record.asset : null
    : selected;
  return assets.some(asset => asset.id === candidate) ? candidate : null;
}

export function shortPlanetOwner(address: string): string {
  if (!address) return 'Unknown owner';
  return address.length > 12 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
}

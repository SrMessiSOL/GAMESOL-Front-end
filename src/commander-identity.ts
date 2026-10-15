import { PublicKey } from '@solana/web3.js';
import type { GameClient } from './game-state';
import { commanderIdentityInstructions, fetchCommanderIdentity, type UfoAttestation } from './ufo-onchain';

export async function saveCommanderSelection(game: GameClient, commander: string, asset: string | null,
  attest: () => Promise<UfoAttestation>, assertCurrent: () => void) {
  const connection = game.getConnection();
  if (await connection.getGenesisHash() !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') {
    throw new Error('Commander saving is currently available on devnet only.');
  }
  const before = await fetchCommanderIdentity(connection, commander);
  assertCurrent();
  if (!asset && (!before || before.asset === PublicKey.default.toBase58())) return before;
  const proof = asset ? await attest() : undefined;
  assertCurrent();
  if (proof && (proof.proof.asset !== asset || BigInt(proof.proof.nonce) !== (before?.nonce ?? 0n))) {
    throw new Error('Commander selection changed. Refresh and retry.');
  }
  const instructions = await commanderIdentityInstructions(commander, asset ? 'set' : 'clear', proof);
  if (asset) {
    const rent = await game.buildSponsoredProgramRentInstruction(new PublicKey(commander), [
      { pubkey: instructions[instructions.length - 1].keys[3].pubkey, space: 120 },
    ]);
    if (rent) instructions.splice(instructions.length - 1, 0, rent);
  }
  assertCurrent();
  await game.sendUfoInstructions(new PublicKey(commander), instructions);
  let saved;
  try { saved = await fetchCommanderIdentity(connection, commander); }
  catch { throw new Error('Your save was submitted, but its status is unavailable. Refresh before retrying.'); }
  assertCurrent();
  if (!saved || saved.asset !== (asset ?? PublicKey.default.toBase58()) || saved.nonce <= (before?.nonce ?? 0n)) {
    throw new Error('Your save was submitted, but confirmation is still pending. Refresh before retrying.');
  }
  return saved;
}

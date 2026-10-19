import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction,
  type AddressLookupTableAccount, type Connection, type PublicKey, type TransactionInstruction } from '@solana/web3.js';

const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const networks = new WeakMap<Connection, Promise<void>>();
const NOT_SENT = ' Nothing was submitted.';

const RULES: Array<[RegExp, string]> = [
  [/ResourceCapExceeded/, 'The delivery exceeds this planet\'s storage. Upgrade storage or choose a smaller delivery.'],
  [/InsufficientMetal/, 'There is not enough metal for this action.'],
  [/InsufficientCrystal/, 'There is not enough crystal for this action.'],
  [/InsufficientDeuterium/, 'There is not enough deuterium for this action.'],
  [/InsufficientAntimatter/, 'There is not enough ANTIMATTER for this action.'],
  [/InsufficientUsdc/, 'There is not enough USDC for this action.'],
  [/AllianceTreasuryNotEnoughResources/, 'The alliance treasury needs more resources for this upgrade.'],
  [/AllianceUpgradeLevelChanged/, 'This alliance building has changed level. Refresh and review its next upgrade.'],
  [/AllianceUpgradePriceExceeded/, 'This alliance upgrade exceeds the price you approved. Refresh and review its cost.'],
  [/InsufficientResources/, 'There are not enough resources for this action.'],
  [/insufficient lamports|insufficient funds/i, 'There are not enough funds for this action or its account rent.'],
  [/ResearchQueueBusy/, 'Finish the current research before starting another project.'],
  [/ShipyardQueueBusy/, 'Finish the current ship or defense build before starting another.'],
  [/QueueBusy/, 'Finish the current construction before starting another building.'],
  [/NoFields/, 'There are no free building fields on this planet.'],
  [/LabTooLow|ShipyardTooLow|TechLocked/, 'Complete the listed building and research requirements first.'],
  [/BuildNotFinished|ResearchNotFinished|ShipBuildNotFinished|DefenseBuildNotFinished/, 'This work is still in progress. Wait for its timer to finish.'],
  [/NoBuild|NoResearch|NoShipBuild|NoDefenseBuild/, 'There is no queued work to finish. Refresh the planet.'],
  [/MissionInFlight|ReturnInFlight/, 'This fleet has not arrived yet. Wait for its timer to finish.'],
  [/AlreadyResolved/, 'This mission is already resolved. Refresh your fleet.'],
  [/EmptyFleet/, 'Select at least one ship before launching.'],
  [/NoMissionSlot/, 'No mission slot is available. Resolve an existing mission first.'],
  [/InsufficientShips/, 'The selected ships are no longer available. Refresh your fleet.'],
  [/ExceedsCargo/, 'The selected cargo exceeds this fleet\'s capacity.'],
  [/MissingColonyShip/, 'Include a Colony Ship in the colonization fleet.'],
  [/CannotAttackOwnPlanet/, 'Choose a planet belonging to another commander.'],
  [/NewPlayerProtected/, 'The target is protected by a beginner shield or defense shield.'],
  [/GameplayLocked/, 'This action is not unlocked yet. Wait for its timer.'],
  [/AttackCooldown|TargetCooldown/, 'An attack cooldown is still active. Wait before launching.'],
  [/AttackPowerTooLow/, 'Send at least 1,000 combat points for an attack.'],
  [/InvalidDestination|InvalidCoordinates|TransferTargetNotInitialized/, 'Choose a valid, initialized destination for this mission.'],
  [/QuestAlreadyClaimed|DailyCheckInAlreadyClaimed|AllianceMissionAlreadyClaimed|StorePackAlreadyPurchased/, 'This reward or pack has already been claimed for the current period.'],
  [/QuestRequirementsNotMet|AllianceMissionRequirementsNotMet/, 'Complete the remaining requirements before claiming this reward.'],
  [/WrongQuestRewardPlanet/, 'Claim this reward on the planet that completed its progress.'],
  [/StoreDisabled/, 'The store is currently unavailable.'],
  [/NoAccelerationNeeded/, 'This work no longer needs acceleration. Refresh its timer.'],
  [/AllianceFull/, 'This alliance has no free member slots.'],
  [/AlreadyInAlliance/, 'Leave your current alliance before applying to another.'],
  [/NotInAlliance/, 'Join an alliance before using this action.'],
  [/AllianceFounderCannotLeave|CannotExpelAllianceLeader/, 'Transfer alliance leadership before leaving or removing the leader.'],
  [/AllianceJoinRequestExists/, 'A membership request is already pending.'],
  [/AllianceJoinRequestNotFound/, 'This membership request is no longer pending. Refresh the alliance.'],
  [/AllianceLeaderRequired/, 'Only the current alliance leader can use this action.'],
  [/HomeworldNotSellable/, 'Your initial homeworld cannot be sold.'],
  [/PlanetHasActiveMissions/, 'Resolve this planet\'s active missions before selling or transferring it.'],
  [/PlanetHasActiveMarketOffers/, 'Cancel this planet\'s resource offers before selling or transferring it.'],
  [/PlanetAlreadyListed|PlanetListedForSale/, 'This planet is already listed for sale. Refresh or cancel its listing first.'],
  [/AlreadyFilled|AccountNotInitialized/, 'This order or required account is no longer available. Refresh before continuing.'],
  [/AmountTooSmall|PriceTooLow/, 'Check the minimum order amount and ANTIMATTER price.'],
  [/TooManyOffers/, 'Cancel an existing offer before creating another.'],
  [/VaultAuthorizationExpired|VaultAuthorizationRevoked|SessionExpired/, 'Game authorization has expired or been revoked. Check Quick Play in your account menu.'],
  [/Unauthorized|InvalidSeller|InvalidAllianceMember|InvalidVaultAuthorization/, 'Your current account cannot perform this action. Refresh account and ownership status.'],
  [/GovernanceDisabled|GovernanceOutOfSync|InvalidGovernance|InvalidAllianceDecision|AllianceDecision/, 'This governance action is unavailable or its configuration has changed.'],
  [/InvalidStorePack|InvalidQuest|InvalidArgs|InvalidTech|InvalidShipType|InvalidDefenseType|InvalidMission/, 'The selected action is invalid. Refresh and check its requirements.'],
];

export function commandPreflightMessage(logs: readonly string[] = []): string {
  const code = logs.map(line => line.match(/Error Code: ([A-Za-z0-9_]+)\./)?.[1]).find(Boolean);
  // The deployed byte-based ship handler logs ProgramError::Custom rather than
  // Anchor's named error. These IDs are game-only (market errors end at 6014).
  const custom = logs.join('\n').match(/Error Code: Custom\((6019|6020|6021)\)/)?.[1];
  const details = code ?? (({6019:'TechLocked',6020:'ShipyardTooLow',6021:'ShipyardQueueBusy'} as Record<number,string>)[Number(custom)] ?? logs.join('\n'));
  return (RULES.find(([pattern]) => pattern.test(details))?.[1]
    ?? 'The current game state does not allow this action. Refresh and check its requirements.') + NOT_SENT;
}

export class CommandPreflightError extends Error {
  constructor(message: string, readonly logs: readonly string[] = []) {
    super(message);
    this.name = 'CommandPreflightError';
  }
}

export async function preflightCommand(
  rpc: Connection, payer: PublicKey, instructions: readonly TransactionInstruction[],
  loadTables?: () => Promise<AddressLookupTableAccount[]>,
): Promise<void> {
  if (!instructions.length) throw new CommandPreflightError('No game action was prepared.' + NOT_SENT);
  try {
    let network = networks.get(rpc);
    if (!network) {
      network = rpc.getGenesisHash().then(genesis => {
        if (genesis !== DEVNET_GENESIS) throw new Error('Unexpected network');
      });
      networks.set(rpc, network);
      network.catch(() => networks.delete(rpc));
    }
    await network;
    const latest = await rpc.getLatestBlockhash('confirmed');
    // Append, rather than prepend, so instruction-indexed ownership proofs keep
    // their original positions. This checks eligibility, not final wrapped CU use.
    const checked = instructions.some(ix => ix.programId.equals(ComputeBudgetProgram.programId)) ? [...instructions]
      : [...instructions, ComputeBudgetProgram.setComputeUnitLimit({units: 1_400_000})];
    const message = new TransactionMessage({payerKey: payer, recentBlockhash: latest.blockhash, instructions: checked});
    let transaction = new VersionedTransaction(message.compileToV0Message());
    const fits = () => { try { return transaction.serialize().length <= 1232; } catch { return false; } };
    if (!fits() && loadTables) transaction = new VersionedTransaction(message.compileToV0Message(await loadTables()));
    if (!fits()) throw new CommandPreflightError('This action is too large to check safely. Nothing was submitted.');
    // No signatures or state writes. Raw passkey instructions check game rules,
    // not wallet authentication. Real signed/wrapped send preflight stays enabled.
    const result = await rpc.simulateTransaction(transaction, {sigVerify: false, commitment: 'confirmed'});
    if (result.value.err) throw new CommandPreflightError(commandPreflightMessage(result.value.logs ?? []), result.value.logs ?? []);
  } catch (error) {
    if (error instanceof CommandPreflightError) throw error;
    throw new CommandPreflightError('The devnet check could not be completed. Check the connection and try again. Nothing was submitted.');
  }
}

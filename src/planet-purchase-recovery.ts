export type PendingPlanetPurchase = {
  version: 1;
  wallet: string;
  intent: string;
  payload: string;
  createdAt: number;
  approvalSignature?: string;
  executionSignature?: string;
};

type SignatureState = 'confirmed' | 'failed' | 'pending';
type PurchaseCallbacks = {
  load(): PendingPlanetPurchase | null;
  save(record: PendingPlanetPurchase | null): void;
  prepare(): Promise<PendingPlanetPurchase>;
  authorize(record: PendingPlanetPurchase, submitted: (signature: string) => void): Promise<void>;
  execute(record: PendingPlanetPurchase, submitted: (signature: string) => void): Promise<string>;
  exists(record: PendingPlanetPurchase): Promise<boolean>;
  status(signature: string): Promise<SignatureState>;
  reclaim(record: PendingPlanetPurchase): Promise<void>;
};

// Retain the exact approved command across errors; never replace it with a new purchase on retry.
export async function runPlanetPurchase(wallet: string, intent: string, callbacks: PurchaseCallbacks, now = Date.now()): Promise<string> {
  let record = callbacks.load();
  if (record && (record.version !== 1 || record.wallet !== wallet)) {
    throw new Error('Another planet purchase needs review before starting this one. No new purchase was submitted.');
  }
  if (record?.executionSignature) {
    const status = await callbacks.status(record.executionSignature);
    if (status === 'confirmed') {
      callbacks.save(null);
      if (record.intent === intent) return record.executionSignature;
      record = null;
    }
    if (status === 'pending') throw new Error('Your purchase is awaiting confirmation. No second purchase was submitted.');
    if (record) {
      delete record.executionSignature;
      callbacks.save(record);
    }
  }
  if (record && record.intent !== intent) {
    throw new Error('Another planet purchase needs review before starting this one. No new purchase was submitted.');
  }
  if (record) {
    const exists = await callbacks.exists(record);
    if (!exists) {
      if (record.approvalSignature && await callbacks.status(record.approvalSignature) === 'failed') callbacks.save(null);
      // A missing record can mean either unconfirmed authorization or already-consumed execution.
      // Keep the intent locked until its signatures or chain state have been reconciled.
      throw new Error('Your previous purchase needs a confirmation check. No new approval or payment was submitted.');
    }
    if (now - record.createdAt > 180_000) {
      await callbacks.reclaim(record);
      callbacks.save(null);
      throw new Error('The previous purchase approval expired. Its temporary rent was returned; you can try again.');
    }
  } else {
    record = await callbacks.prepare();
    if (record.version !== 1 || record.wallet !== wallet || record.intent !== intent) throw new Error('Purchase account changed before authorization.');
    callbacks.save(record);
    try {
      await callbacks.authorize(record, signature => {
        record!.approvalSignature = signature;
        callbacks.save(record);
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'purchaseNotSubmitted' in error && error.purchaseNotSubmitted === true) callbacks.save(null);
      throw error;
    }
  }
  const signature = await callbacks.execute(record, signature => {
    record!.executionSignature = signature;
    callbacks.save(record);
  });
  callbacks.save(null);
  return signature;
}

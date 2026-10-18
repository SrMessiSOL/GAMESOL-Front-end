// Leave submission headroom inside Lazor's 150-slot proof-age limit.
export function assertFreshPasskeyApproval(issued: bigint, current: bigint): void {
  if (current < issued || current - issued > 130n) {
    throw Object.assign(new Error('Purchase approval expired before submission. No payment was sent. Review the purchase again when ready.'),
      {purchaseNotSubmitted: true});
  }
}

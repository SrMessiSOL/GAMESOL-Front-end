const assert = require("node:assert/strict");
const test = require("node:test");
const { allowedDaoAddresses, errorDetails, proposalSummary, stateName } = require("./futarchy-keeper.cjs");

const DAO = "DAU9JQSN6kVffGBUnMyDXv1AfQWoCUfdWAxPuE8BH9un";
const PROPOSAL = "Bmq1wRF5DCZyFp3E3ZfeUg1sFWxhTN3xkvgeXPcp7Dsm";

test("proposalSummary marks only closed pending proposals eligible", () => {
  const account = {
    dao: DAO,
    state: { pending: {} },
    timestampEnqueued: { toString: () => "100" },
    durationInSeconds: 50,
  };
  assert.deepEqual(proposalSummary(PROPOSAL, account, 150), {
    proposal: PROPOSAL,
    dao: DAO,
    state: "pending",
    closesAt: 150,
    eligible: true,
  });
  assert.equal(proposalSummary(PROPOSAL, account, 149).eligible, false);
  assert.equal(proposalSummary(PROPOSAL, { ...account, state: { passed: {} } }, 200).eligible, false);
});

test("DAO allowlist accepts comma-separated public keys and rejects missing configuration", () => {
  assert.deepEqual([...allowedDaoAddresses({ FUTARCHY_DAO_ADDRESSES: DAO })], [DAO]);
  assert.throws(() => allowedDaoAddresses({}), /not configured/i);
});

test("retryable TWAP errors and finalized races are classified safely", () => {
  assert.equal(errorDetails(new Error("Markets too young for proposal to be finalized. TWAP might need to be cranked")).code, "TWAP_NOT_READY");
  assert.equal(errorDetails(new Error("This proposal has already been finalized")).code, "ALREADY_FINALIZED");
  assert.equal(errorDetails(new Error("RPC unavailable")).retryable, true);
});

test("Anchor enum objects normalize to stable state names", () => {
  assert.equal(stateName({ pending: {} }), "pending");
  assert.equal(stateName({ failed: {} }), "failed");
  assert.equal(stateName(null), "unknown");
});

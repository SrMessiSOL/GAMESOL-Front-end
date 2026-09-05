import { randomBytes } from "node:crypto";
import { Connection, LazorKitClient, PublicKey, Transaction } from "@lazorkit/wallet";

const rpcUrl = "https://api.devnet.solana.com";
const paymasterUrl = "https://kora.devnet.lazorkit.com";
const programIds = [
  "4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS",
  "FLb7fyAtkfA4TSa2uYcAT8QKHd2pkoMHgmqfnXFXo7ao",
];

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}

const payerResponse = await fetch(paymasterUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getPayerSigner", params: [] }),
});
const payerPayload = await payerResponse.json();
const payer = new PublicKey(payerPayload.result.signer_address);
const { value: { blockhash } } = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
const connection = new Connection(rpcUrl, "confirmed");

for (const programId of programIds) {
  const client = new LazorKitClient(connection, new PublicKey(programId));
  const compressedPubkey = new Uint8Array(33);
  compressedPubkey[0] = 2;
  compressedPubkey.set(randomBytes(32), 1);
  const { instructions } = await client.createWallet({
    payer,
    userSeed: randomBytes(32),
    owner: {
      type: "secp256r1",
      credentialIdHash: randomBytes(32),
      compressedPubkey,
      rpId: "portal.lazor.sh",
    },
  });
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: blockhash });
  transaction.add(...instructions);
  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const simulation = await rpc("simulateTransaction", [serialized.toString("base64"), {
    encoding: "base64",
    sigVerify: false,
    commitment: "confirmed",
  }]);
  console.log(JSON.stringify({ programId, error: simulation.value.err, logs: simulation.value.logs }, null, 2));
}

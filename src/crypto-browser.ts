import { Buffer } from "buffer";
import { sha256 } from "js-sha256";

type HashInput = string | ArrayBuffer | ArrayBufferView;
type DigestEncoding = "hex" | "base64" | "base64url";

function inputBytes(value: HashInput, encoding?: string): Uint8Array {
  if (typeof value === "string") {
    return new Uint8Array(Buffer.from(value, encoding as BufferEncoding | undefined));
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

/**
 * Minimal browser-compatible subset of Node's createHash used by LazorKit.
 * Lazor only requests SHA-256 and consumes either a Buffer or encoded digest.
 */
export function createHash(algorithm: string) {
  if (algorithm.toLowerCase().replace(/-/g, "") !== "sha256") {
    throw new Error(`Unsupported browser hash algorithm: ${algorithm}`);
  }

  const hash = sha256.create();
  let finalized = false;

  return {
    update(value: HashInput, encoding?: string) {
      if (finalized) throw new Error("Hash has already been finalized.");
      hash.update(inputBytes(value, encoding));
      return this;
    },
    digest(encoding?: DigestEncoding) {
      if (finalized) throw new Error("Hash has already been finalized.");
      finalized = true;
      const output = Buffer.from(hash.array());
      return encoding ? output.toString(encoding) : output;
    },
  };
}


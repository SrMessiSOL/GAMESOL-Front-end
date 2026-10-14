'use strict';

const { Buffer } = require('buffer');
// Legacy Solana layouts use at most 32 bytes; bound the generic API as well.
const MAX_BYTES = 4096;

function decode(bytes, littleEndian) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('Expected a Buffer.');
  if (bytes.length > MAX_BYTES) throw new RangeError('Integer buffer exceeds the size limit.');
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    const index = littleEndian ? bytes.length - 1 - i : i;
    value = (value << 8n) | BigInt(bytes[index]);
  }
  return value;
}

function encode(value, width, littleEndian) {
  if (typeof value !== 'bigint') throw new TypeError('Expected a bigint.');
  if (!Number.isSafeInteger(width) || width < 0 || width > MAX_BYTES) {
    throw new RangeError('Invalid integer buffer width.');
  }
  if (value < 0n || value.toString(16).length > width * 2 && value !== 0n) {
    throw new RangeError('Unsigned integer does not fit the buffer width.');
  }
  const bytes = Buffer.alloc(width);
  let remaining = value;
  for (let i = 0; i < width; i++) {
    bytes[littleEndian ? i : width - 1 - i] = Number(remaining & 255n);
    remaining >>= 8n;
  }
  return bytes;
}

module.exports = {
  toBigIntLE: bytes => decode(bytes, true),
  toBigIntBE: bytes => decode(bytes, false),
  toBufferLE: (value, width) => encode(value, width, true),
  toBufferBE: (value, width) => encode(value, width, false),
};

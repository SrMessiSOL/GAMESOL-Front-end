# Native-free legacy Solana integer adapter

This first-party package replaces `bigint-buffer` for the existing SPL Token,
Squads, and MetaDAO dependency graph. The original native C++ addon is affected
by GHSA-3gc7-fjrx-p6mg and has no patched upstream release in the installed line.
This package contains no native code, binding loader, install script, or runtime
dependency other than the existing `buffer` polyfill supplied by the application.
It does not implement cryptography or alter transaction formats.

The four legacy conversion functions support unsigned bigint values and Buffer
inputs. Endianness, zero padding, and all in-range Solana integer widths are
covered by regression tests, including actual SPL Token account serialization.
Unlike the old JavaScript fallback, invalid types, negative values, overflow,
and allocation widths over 4096 bytes are rejected rather than truncated or
coerced. Legacy Solana integer layouts use at most 32 bytes.

The package is deliberately named `@gamesol/bigint-buffer-js` and installed at
the legacy import name through an explicit local dependency and npm override.
This is a visible source replacement, not an advisory ignore or an upstream
version bump. Audit tools do not independently audit first-party source.
Tests live in `server/dependency-security.test.cjs`.

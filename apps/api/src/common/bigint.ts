// Money is stored as BIGINT paisa but always fits in a JS safe integer (see MAX_AMOUNT), so APIs return plain numbers.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function (this: bigint) {
  return Number(this);
};
export {};

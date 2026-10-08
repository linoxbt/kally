import test from "node:test";
import assert from "node:assert/strict";
import { parseGen, formatGen } from "../lib/amount.ts";

test("parses the smallest supported GEN unit without rounding", () => {
  assert.equal(parseGen("0.000000000000000001"), 1n);
  assert.equal(parseGen("1000000.123456789012345678"), 1000000123456789012345678n);
});

test("rejects malformed and unrepresentable amounts", () => {
  for (const input of ["0", "-1", "1e3", "0.0000000000000000001", "Infinity", "01", "1."]) {
    assert.throws(() => parseGen(input));
  }
});

test("formats large wei values without floating point loss", () => {
  assert.equal(formatGen(1000000123456789012345678n), "1,000,000.1234");
});

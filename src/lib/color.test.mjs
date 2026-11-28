import { test } from "node:test";
import assert from "node:assert/strict";
import { hsvToHex, hexToHsv, parseHex, pushRecent } from "./color.js";

test("hsv <-> hex", () => {
  assert.equal(hsvToHex(0, 1, 1), "#ff0000");
  assert.equal(hsvToHex(120, 1, 1), "#00ff00");
  assert.equal(hsvToHex(240, 1, 0.5), "#000080");
  assert.equal(hsvToHex(0, 0, 1), "#ffffff");
  assert.equal(hsvToHex(0, 0, 0), "#000000");
  for (const hex of ["#4cc3ff", "#c77dff", "#123456", "#ffd84c"]) {
    const { h, s, v } = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
});

test("typed colours", () => {
  assert.equal(parseHex("F00"), "#ff0000");
  assert.equal(parseHex("#AbCdEf"), "#abcdef");
  assert.equal(parseHex(" 123456 "), "#123456");
  assert.equal(parseHex("red"), null);
  assert.equal(parseHex("#12345"), null);
  assert.equal(parseHex("#123456;x"), null);
});

test("recent colours: newest first, no repeats, capped", () => {
  assert.deepEqual(pushRecent(["#111111", "#222222"], "#222222"), ["#222222", "#111111"]);
  assert.equal(pushRecent(Array.from({ length: 12 }, (_, i) => `#00000${i % 10}`), "#ffffff").length, 12);
});

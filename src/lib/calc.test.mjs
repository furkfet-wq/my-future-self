import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, formatNumber, tokenize } from "./calc.js";

test("× and ÷ go before + and −", () => {
  assert.equal(evaluate("12+3×4"), 24);
  assert.equal(evaluate("10−6÷2"), 7);
  assert.equal(evaluate("2×3+4×5"), 26);
});

test("minus in front of a number, decimals, percent", () => {
  assert.equal(evaluate("−5+2"), -3);
  assert.equal(evaluate("3×−2"), -6);
  assert.equal(evaluate(".5+1."), 1.5);
  assert.equal(evaluate("50%"), 0.5);
  assert.equal(evaluate("200×10%"), 20);
});

test("a trailing operator is ignored", () => {
  assert.equal(evaluate("7+"), 7);
});

test("bad input and division by 0 give null", () => {
  assert.equal(evaluate(""), null);
  assert.equal(evaluate("5÷0"), null);
  assert.equal(evaluate("1++2"), null);
  assert.equal(evaluate("abc"), null);
  assert.equal(tokenize("1×x"), null);
});

test("results are shown without float noise", () => {
  assert.equal(formatNumber(evaluate("0.1+0.2")), "0.3");
  assert.equal(formatNumber(-4), "−4");
  assert.equal(formatNumber(-0), "0");
  assert.equal(formatNumber(1 / 3), "0.333333333333");
});

import { press } from "./calc.js";
const typeKeys = (keys) => keys.reduce((s, k) => press(s, k), { expr: "", done: false, prev: "", err: "" });

test("key presses build the sum and = shows the answer", () => {
  const s = typeKeys(["1", "2", "+", "3", "×", "4", "="]);
  assert.equal(s.expr, "24");
  assert.equal(s.prev, "12+3×4 =");
  assert.equal(typeKeys(["1", "2", "+", "3", "×", "4", "=", "5"]).expr, "5"); // a digit after = starts again
  assert.equal(typeKeys(["8", "=", "+", "2", "="]).expr, "10"); // an operator after = carries on
});

test("operators replace each other, ± flips the last number, one point per number", () => {
  assert.equal(typeKeys(["5", "+", "×", "2"]).expr, "5×2");
  assert.equal(typeKeys(["5", "×", "−", "2", "="]).expr, "−10");
  assert.equal(typeKeys(["1", "2", "−", "5", "±", "="]).expr, "17");
  assert.equal(typeKeys(["5", "±", "±"]).expr, "5");
  assert.equal(typeKeys(["1", ".", "5", ".", "2"]).expr, "1.52");
  assert.equal(typeKeys([".", "5"]).expr, "0.5");
  assert.equal(typeKeys(["0", "0", "7"]).expr, "7");
});

test("errors are shown, not crashed", () => {
  assert.equal(typeKeys(["5", "÷", "0", "="]).err, "Can't divide by 0");
  assert.equal(typeKeys(["9", "9", "9", "9", "9", "9", "9", "9", "×", "9", "9", "9", "9", "9", "9", "9", "9", "="]).err, "Too big");
  assert.equal(typeKeys(["5", "÷", "0", "=", "C"]).expr, "");
});

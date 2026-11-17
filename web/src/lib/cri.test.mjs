// Run: npm test  (Node ≥ 22.18 strips the TypeScript types in cri.ts natively)
// Checks the browser instrument against the figures published in the paper (framework version 1.0).
import assert from "node:assert/strict";
import { test } from "node:test";

import { FACTOR_IDS, SIGNALS, applied, decodeState, encodeState, gap, levelOf, warranted } from "./cri.ts";

/** Every one of the 2⁹ = 512 task descriptors, as sets of "yes" factor ids. */
function* allDescriptors() {
  for (let mask = 0; mask < 512; mask++) yield new Set(FACTOR_IDS.filter((_, i) => mask & (1 << i)));
}

/** Independent oracle written from the paper's arithmetic, not from cri.ts: per-dimension factor counts, equal weights. */
const DIM_SIZES = [2, 2, 1, 2, 2];
function oracle(high) {
  let i = 0;
  let total = 0;
  for (const size of DIM_SIZES) {
    let yes = 0;
    for (let k = 0; k < size; k++) if (high.has(FACTOR_IDS[i + k])) yes++;
    total += 0.2 * (yes / size);
    i += size;
  }
  const s = Number(total.toFixed(10));
  return { score: s, level: s >= 0.8 ? 4 : s >= 0.6 ? 3 : s >= 0.4 ? 2 : s >= 0.2 ? 1 : 0 };
}

test("all 512 descriptors match the oracle", () => {
  for (const d of allDescriptors()) {
    const w = warranted(d);
    const o = oracle(d);
    assert.equal(w.level, o.level, [...d].join(","));
    assert.ok(Math.abs(w.score - o.score) < 1e-9);
  }
});

test("level distribution is 9 / 93 / 210 / 162 / 38, as published", () => {
  const counts = [0, 0, 0, 0, 0];
  for (const d of allDescriptors()) counts[warranted(d).level]++;
  assert.deepEqual(counts, [9, 93, 210, 162, 38]);
});

test("no single-factor increase lowers the score (2,304 transitions)", () => {
  let transitions = 0;
  for (const d of allDescriptors()) {
    for (const id of FACTOR_IDS) {
      if (d.has(id)) continue;
      transitions++;
      assert.ok(warranted(new Set([...d, id])).score >= warranted(d).score);
    }
  }
  assert.equal(transitions, 2304);
});

test("band edges are half-open and survive floating-point sums", () => {
  for (const [edge, level] of [[0.2, 1], [0.4, 2], [0.6, 3], [0.8, 4]]) {
    assert.equal(levelOf(edge - 1e-6), level - 1);
    assert.equal(levelOf(edge), level);
    assert.equal(levelOf(edge + 1e-6), level);
  }
  assert.equal(levelOf(0.1 + 0.2 + 0.3), 3); // 0.6000000000000001
  assert.equal(levelOf(0.2 * 3), 3); // 0.6000000000000001
  assert.equal(levelOf(1), 4);
});

test("a single severe consequence stays in L0; model evidence alone reaches L1", () => {
  assert.deepEqual([warranted(new Set(["severity"])).score, warranted(new Set(["severity"])).level], [0.1, 0]);
  assert.deepEqual([warranted(new Set(["model_performance"])).score, warranted(new Set(["model_performance"])).level], [0.2, 1]);
});

test("applied oversight normalises over observable signals and reports coverage", () => {
  const none = Object.fromEntries(SIGNALS.map((s) => [s.id, "not_done"]));
  assert.deepEqual(applied(none), { score: 0, level: 0, coverage: 1 });
  assert.deepEqual(applied({ ...none, verification: "done" }), { score: 0.4, level: 2, coverage: 1 });
  // Without the verification signal, coverage falls to 0.60 and the rest is renormalised.
  const noVerify = applied({ ...none, verification: "unavailable", edited: "done", deliberation: "done" });
  assert.equal(noVerify.coverage, 0.6);
  assert.equal(noVerify.score, Number((0.35 / 0.6).toFixed(10)));
  // Nothing observable: undefined, not zero.
  const nothing = applied(Object.fromEntries(SIGNALS.map((s) => [s.id, "unavailable"])));
  assert.deepEqual(nothing, { score: null, level: null, coverage: 0 });
  assert.equal(gap(warranted(new Set()), nothing), null);
});

test("gap is L(W) − L(A)", () => {
  const all = new Set(FACTOR_IDS);
  const none = Object.fromEntries(SIGNALS.map((s) => [s.id, "not_done"]));
  assert.equal(gap(warranted(all), applied(none)), 4);
  assert.equal(gap(warranted(new Set()), applied(Object.fromEntries(SIGNALS.map((s) => [s.id, "done"])))), -4);
});

test("share-link state round-trips and rejects junk", () => {
  const high = new Set(["severity", "exposure"]);
  const states = { verification: "done", edited: "not_done", deliberation: "unavailable", override: "not_done", reasoning: "done" };
  const decoded = decodeState(encodeState(high, states));
  assert.deepEqual([...decoded.high].sort(), [...high].sort());
  assert.deepEqual(decoded.states, states);
  for (const junk of [null, "", "1.d", "1000000002.ddddd", "100000000.ddddx", "100000000.dddddd", "<script>"]) assert.equal(decodeState(junk), null);
});

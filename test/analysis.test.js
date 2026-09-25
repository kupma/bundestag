import test from "node:test";
import assert from "node:assert/strict";
import { computeDivergence } from "../src/analysis.js";

test("computeDivergence returns low divergence for matching topics", () => {
  const decisions = [
    { id: "1", topic: "Rent policy", summary: "Rent stabilization for tenants" },
  ];

  const topics = [
    { party: "X", topic: "Housing", position: "Rent stabilization for tenants" },
  ];

  const result = computeDivergence(decisions, topics);
  assert.equal(result[0].closestBrochureTopic, "Housing");
  assert.equal(result[0].divergence, 0.2);
});

test("computeDivergence handles empty brochure topics", () => {
  const decisions = [{ id: "1", topic: "Topic", summary: "Summary" }];
  const result = computeDivergence(decisions, []);
  assert.equal(result[0].closestBrochureTopic, "No related topic");
  assert.equal(result[0].divergence, 1);
});

test("computeDivergence still returns a closest topic when overlap is zero", () => {
  const decisions = [{ id: "1", topic: "Tax", summary: "Corporate deduction changes" }];
  const topics = [
    { party: "X", topic: "Transport", position: "Rail infrastructure financing" },
    { party: "Y", topic: "Education", position: "School staffing targets" },
  ];

  const result = computeDivergence(decisions, topics);
  assert.equal(result[0].closestBrochureTopic, "Transport");
  assert.equal(result[0].divergence, 1);
});

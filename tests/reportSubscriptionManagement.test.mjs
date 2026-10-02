import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSubscription,
  subscriptionConditionMatches,
} from "../server/services/analyticsManagement.js";

test("subscription normalizes running user, principals and attachment intent", () => {
  const subscription = normalizeSubscription({
    cadence: "weekly",
    weekday: 2,
    hour: 9,
    minute: 15,
    timezone: "Europe/London",
    delivery: ["EMAIL"],
    runAsUserId: "11111111-1111-4111-8111-111111111111",
    recipientPrincipals: [
      { principalType: "USER", principalId: "22222222-2222-4222-8222-222222222222" },
      { principalType: "ROLE", principalId: "33333333-3333-4333-8333-333333333333" },
    ],
    conditions: [
      { type: "ROW_COUNT_GT", value: 5 },
      { type: "VALUE_GTE", field: "total", value: 100 },
    ],
    attachment: { enabled: true, view: "DETAILS" },
  });

  assert.equal(subscription.cadence, "WEEKLY");
  assert.equal(subscription.runAsUserId, "11111111-1111-4111-8111-111111111111");
  assert.equal(subscription.recipientPrincipals.length, 2);
  assert.equal(subscription.conditions.length, 2);
  assert.deepEqual(subscription.attachment, { enabled:true, view:"DETAILS", format:"CSV" });
});

test("subscription conditions are ANDed", () => {
  const subscription = normalizeSubscription({
    conditions: [
      { type: "ROW_COUNT_GT", value: 1 },
      { type: "VALUE_GTE", field: "sales", value: 100 },
    ],
  });
  assert.equal(subscriptionConditionMatches(subscription, {
    rows: [{ sales: 120 }, { sales: 80 }],
    totals: { sales: 120 },
  }), true);
  assert.equal(subscriptionConditionMatches(subscription, {
    rows: [{ sales: 120 }],
    totals: { sales: 120 },
  }), false);
});

test("subscription rejects Always combined with other conditions", () => {
  assert.throws(
    () => normalizeSubscription({
      conditions: [
        { type: "ALWAYS" },
        { type: "ROW_COUNT_GT", value: 0 },
      ],
    }),
    /Always cannot be combined/,
  );
});

test("subscription accepts at most five conditions", () => {
  const conditions = Array.from({ length: 7 }, (_, index) => ({
    type: "ROW_COUNT_GT",
    value: index,
  }));
  const subscription = normalizeSubscription({ conditions });
  assert.equal(subscription.conditions.length, 5);
});

import assert from "node:assert/strict";
import test from "node:test";
import { detectLoginBrowser } from "../services/identitySecurity.js";

test("login browser detection handles common user-agent tokens without regex escaping", () => {
  assert.equal(detectLoginBrowser("Mozilla/5.0 Edg/141.0 Chrome/141.0"), "Edge");
  assert.equal(detectLoginBrowser("Mozilla/5.0 Chrome/141.0 Safari/537.36"), "Chrome");
  assert.equal(detectLoginBrowser("Mozilla/5.0 Firefox/143.0"), "Firefox");
  assert.equal(detectLoginBrowser("Mozilla/5.0 Version/18.0 Safari/605.1"), "Safari");
  assert.equal(detectLoginBrowser("unknown client"), "Other");
  assert.equal(detectLoginBrowser(""), null);
});

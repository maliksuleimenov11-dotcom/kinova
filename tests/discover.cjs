"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const path = require("node:path");

module.exports = async function testDiscovery() {
  let calls = 0;
  let timer;
  let timeoutMs;
  let apiReply = async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) });
  const env = {};
  const context = vm.createContext({
    module: { exports: {} }, process: { env }, URL, AbortController,
    Date: class extends Date { static now() { return Date.parse("2026-12-31T19:00:00Z"); } },
    setTimeout(callback, ms) { timer = callback; timeoutMs = ms; return 1; }, clearTimeout() {},
    fetch: async (url, options) => {
      calls++;
      assert.equal(url.origin, "https://kinopoiskapiunofficial.tech");
      assert.equal(options.headers["X-API-KEY"], env.KINOPOISK_API_KEY);
      assert.equal(options.redirect, "error");
      return apiReply(url, options);
    },
  });
  vm.runInContext(readFileSync(path.join(__dirname, "../api/search-discover.js"), "utf8"), context);
  const request = async (query, method = "GET") => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
    await context.module.exports({ method, url: `/api/search-discover?${query}` }, res);
    assert(!JSON.stringify(res).includes(env.KINOPOISK_API_KEY || "never-a-real-key"));
    if (res.statusCode !== 200) {
      assert.equal(res.headers["Cache-Control"], "no-store");
      assert.equal(res.headers["Vercel-CDN-Cache-Control"], "no-store");
    }
    return res;
  };
  assert.equal((await request("kind=popular")).statusCode, 503);
  assert.equal((await request("kind=popular", "POST")).statusCode, 405);
  for (const bad of ["", "kind=other", "kind=popular&x=1", "kind=popular&month=2027-01", "kind=popular&kind=popular", "kind=premieres", "kind=premieres&month=2026-11", "kind=premieres&month=2027-02", "kind=premieres&month=2027-01&month=2027-01", "kind=premieres&x=2027-01"]) assert.equal((await request(bad)).statusCode, 400);
  assert.equal(calls, 0);
  env.KINOPOISK_API_KEY = "local-test-placeholder";
  apiReply = async (url) => {
    assert.equal(url.pathname, "/api/v2.2/films/collections");
    assert.equal(url.searchParams.get("type"), "TOP_POPULAR_MOVIES");
    assert.equal(url.searchParams.get("page"), "1");
    return { ok: true, status: 200, json: async () => ({ items: [
      { kinopoiskId: 1, nameRu: " Первый ", year: 2020, ratingKinopoisk: 8.5, posterUrlPreview: "https://example.org/a.jpg", privateField: "discard" },
      { kinopoiskId: 1, nameRu: "Повтор" }, null, { kinopoiskId: -1 },
      ...Array.from({ length: 24 }, (_, i) => ({ kinopoiskId: i + 2, nameEn: "Original", posterUrl: "javascript:alert(1)" })),
    ] }) };
  };
  const successful = await request("kind=popular");
  assert.equal(successful.statusCode, 200);
  assert.equal(successful.headers["Vercel-CDN-Cache-Control"], "public, s-maxage=3600");
  assert.equal(successful.body.films.length, 20);
  assert.equal(successful.body.films[0].nameRu, "Первый");
  assert.equal(successful.body.films[1].poster, null);
  assert.equal(successful.body.films[1].nameOriginal, "Original");
  assert(!("privateField" in successful.body.films[0]));
  assert.equal(calls, 1);
  for (const [month, year, apiMonth] of [["2027-01", "2027", "JANUARY"], ["2026-12", "2026", "DECEMBER"]]) {
    apiReply = async (url) => {
      assert.equal(url.pathname, "/api/v2.2/films/premieres");
      assert.equal(url.searchParams.get("year"), year);
      assert.equal(url.searchParams.get("month"), apiMonth);
      return { ok: true, status: 200, json: async () => ({ items: [{ kinopoiskId: 50, premiereRu: "2027-01-12", ratingKinopoisk: 9 }, { kinopoiskId: 51, premiereRu: "2027-02-30" }] }) };
    };
    const res = await request(`kind=premieres&month=${month}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.films[0].rating, null);
    assert.equal(res.body.films[0].premiereRu, "2027-01-12");
    assert.equal(res.body.films[1].premiereRu, null);
  }
  for (const [status, expected] of [[401, 503], [403, 503], [402, 429], [429, 429], [500, 502]]) {
    apiReply = async () => ({ ok: false, status });
    const before = calls;
    assert.equal((await request("kind=popular")).statusCode, expected);
    assert.equal(calls, before + 1);
  }
  for (const reply of [async () => ({ ok: true, json: async () => ({ wrong: true }) }), async () => { throw new Error("network"); }]) {
    apiReply = reply;
    assert.equal((await request("kind=popular")).statusCode, 502);
  }
  apiReply = async () => ({ ok: true, json: async () => ({ items: [] }) });
  assert.equal((await request("kind=popular")).statusCode, 200);
  apiReply = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    timer();
  });
  assert.equal((await request("kind=popular")).statusCode, 502);
  assert.equal(timeoutMs, 8000);
};

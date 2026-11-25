"use strict";

// Воспроизводимые проверки без настоящего ключа и без запросов к API.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (name) => readFileSync(path.join(__dirname, "..", name), "utf8");

function element() {
  return {
    value: "", textContent: "", children: [], dataset: {}, attrs: {}, listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    focus() { this.focused = true; },
  };
}

async function run() {
  const nodes = Object.fromEntries(["search-form", "query", "input-error", "search-status", "results", "result-count", "watchlist", "watchlist-count", "watchlist-empty", "watched", "watched-count", "watched-empty", "catalog-status"].map((id) => [id, element()]));
  const button = element();
  nodes["search-form"].querySelector = () => button;
  let requests = 0;
  let reply = async () => ({ ok: true, json: async () => ({ films: [] }) });
  let clientTimeout;
  const client = vm.createContext({
    document: { querySelector: (selector) => nodes[selector.slice(1)], createElement: element },
    location: { protocol: "http:" },
    AbortSignal: { timeout(ms) { clientTimeout = ms; return new AbortController().signal; } },
    fetch: async (url, options) => { requests++; assert.equal(new URL(url, "http://localhost").pathname, "/api/search"); assert(options.signal); return reply(); },
  });
  vm.runInContext(read("script.js"), client);
  const submit = () => nodes["search-form"].listeners.submit({ preventDefault() {} });
  const ready = () => { assert.equal(button.disabled, false); assert.equal(nodes.results.attrs["aria-busy"], "false"); };
  const message = () => nodes["search-status"].textContent;
  nodes.query.value = "   ";
  await submit();
  assert.equal(requests, 0);
  assert.equal(nodes["input-error"].textContent, "Введите название фильма");
  nodes.query.value = "я".repeat(201);
  await submit();
  assert.equal(requests, 0);
  nodes.query.value = " Матрица ";
  nodes.query.listeners.input();
  assert.equal(requests, 0);
  let resolve;
  reply = () => new Promise((done) => { resolve = done; });
  const pending = submit();
  assert.equal(button.disabled, true);
  assert.equal(message(), "Ищем фильмы…");
  await submit();
  assert.equal(requests, 1);
  resolve({ ok: true, json: async () => ({ films: [{ id: 1, nameOriginal: "Original", poster: "https://example.org/poster.jpg" }, { id: 2 }] }) });
  await pending;
  ready();
  assert.equal(clientTimeout, 12000);
  assert.equal(nodes.results.children.length, 2);
  const card = nodes.results.children[0];
  assert.equal(card.children[1].textContent, "Original");
  assert.equal(card.children[2].children[0].textContent, "Год не указан");
  assert.equal(card.children[2].children[1].textContent, "Нет рейтинга");
  card.children[0].children[0].listeners.error();
  assert.equal(card.children[0].textContent, "Нет постера");
  assert.equal(nodes.results.children[1].children[1].textContent, "Без названия");
  const beforeAdd = requests;
  const addFirst = card.children[3].listeners.click;
  addFirst();
  addFirst();
  assert.equal(nodes.watchlist.children.length, 1);
  assert.equal(nodes["watchlist-count"].textContent, "1");
  assert.equal(nodes["watchlist-empty"].hidden, true);
  assert.equal(requests, beforeAdd);
  assert.equal(nodes.results.children[0].children[3].textContent, "В списке „Хочу посмотреть“");
  reply = async () => ({ ok: true, json: async () => ({ films: [{ id: 1, nameRu: "Другое название" }, { id: 4, nameOriginal: "Original" }] }) });
  await submit();
  assert.equal(nodes.results.children[0].children[3].textContent, "В списке „Хочу посмотреть“");
  nodes.results.children[1].children[3].listeners.click();
  assert.equal(nodes.watchlist.children.length, 2);
  assert.equal(nodes.watchlist.children[0].dataset.filmId, 4);
  assert.equal(nodes.watchlist.children[1].dataset.filmId, 1);
  const beforeMove = requests;
  const moveFirst = nodes.watchlist.children[0].children[3].listeners.click;
  moveFirst();
  moveFirst();
  assert.equal(nodes.watchlist.children.length, 1);
  assert.equal(nodes.watched.children.length, 1);
  assert.equal(nodes["watched-count"].textContent, "1");
  assert.equal(nodes["watchlist-count"].textContent, "1");
  assert.equal(nodes.results.children[1].children[3].textContent, "В списке „Просмотрено“");
  assert.equal(nodes.watched.children[0].children[3].focused, true);
  nodes.watched.children[0].children[3].listeners.click();
  assert.equal(nodes.watchlist.children.length, 2);
  assert.equal(nodes.watched.children.length, 0);
  assert.equal(nodes["watched-empty"].hidden, false);
  assert.equal(nodes.watchlist.children[0].dataset.filmId, 4);
  assert.equal(requests, beforeMove);
  reply = async () => ({ ok: true, json: async () => ({ films: [] }) });
  await submit();
  assert.equal(nodes.results.children.length, 0);
  assert(message().startsWith("Ничего не найдено"));
  assert.equal(nodes.watchlist.children.length, 2);
  for (const [code, expected] of [["API_LIMIT", "Лимит API исчерпан. Попробуйте позже"], ["UNAVAILABLE", "Поиск временно недоступен"]]) {
    reply = async () => ({ ok: false, json: async () => ({ error: code }) });
    const before = requests;
    await submit();
    assert.equal(message(), expected);
    assert.equal(requests, before + 1);
    ready();
    assert.equal(nodes.watchlist.children.length, 2);
  }
  for (const failure of [new Error("network"), new DOMException("timeout", "TimeoutError")]) {
    reply = async () => { throw failure; };
    await submit();
    assert(message().startsWith("Не удалось выполнить поиск"));
    ready();
  }
  reply = async () => ({ ok: true, json: async () => { throw new SyntaxError("JSON"); } });
  await submit();
  ready();
  assert(message().startsWith("Не удалось выполнить поиск"));
  reply = async () => ({ ok: true, json: async () => ({ films: [{ id: 3, nameRu: "Повторный поиск", rating: 0 }] }) });
  await submit();
  ready();
  assert.equal(nodes.results.children[0].children[1].textContent, "Повторный поиск");
  const directWatched = nodes.results.children[0].children[4].listeners.click;
  directWatched();
  directWatched();
  assert.equal(nodes.watched.children.length, 1);
  assert.equal(nodes.watchlist.children.length, 2);
  assert.equal(nodes.results.children[0].children[3].textContent, "В списке „Просмотрено“");
  assert.equal(nodes.results.children[0].children[3].focused, true);
  nodes.watchlist.children[1].children[3].listeners.click();
  assert.equal(nodes.watched.children[0].dataset.filmId, 1);
  assert.equal(nodes.watched.children[1].dataset.filmId, 3);
  assert.equal(nodes.watchlist.children.length + nodes.watched.children.length, 3);

  let timer;
  let timeoutMs;
  let cleared = 0;
  let apiReply;
  let apiRequests = 0;
  const environment = { KINOPOISK_API_KEY: "local-test-placeholder" };
  const backend = vm.createContext({
    module: { exports: {} }, process: { env: environment }, URL, AbortController,
    setTimeout(callback, ms) { timer = callback; timeoutMs = ms; return 1; },
    clearTimeout() { cleared++; },
    fetch: async (url, options) => {
      apiRequests++;
      assert.equal(url.origin + url.pathname, "https://kinopoiskapiunofficial.tech/api/v2.2/films");
      assert.equal(url.searchParams.get("page"), "1");
      assert.equal(options.headers["X-API-KEY"], environment.KINOPOISK_API_KEY);
      assert.equal(options.redirect, "error");
      return apiReply(options);
    },
  });
  vm.runInContext(read("api/search.js"), backend);
  const request = async () => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } };
    await backend.module.exports({ method: "GET", url: "/api/search?q=test" }, res);
    assert(!JSON.stringify(res).includes(environment.KINOPOISK_API_KEY || "never-a-real-key"));
    return res;
  };
  for (const [code, status, error] of [[402, 429, "API_LIMIT"], [429, 429, "API_LIMIT"], [401, 503, "UNAVAILABLE"], [403, 503, "UNAVAILABLE"], [500, 502, "UPSTREAM_ERROR"]]) {
    apiReply = async () => ({ status: code, ok: false });
    const res = await request();
    assert.equal(res.statusCode, status);
    assert.equal(res.body.error, error);
  }
  apiReply = async () => ({ ok: true, json: async () => ({ items: [] }) });
  assert.equal((await request()).body.films.length, 0);
  apiReply = async () => ({ ok: true, json: async () => ({ unexpected: true }) });
  assert.equal((await request()).statusCode, 502);
  apiReply = async () => { throw new Error("private upstream error"); };
  assert.equal((await request()).statusCode, 502);
  apiReply = (options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    timer();
  });
  const before = apiRequests;
  assert.equal((await request()).statusCode, 502);
  assert.equal(timeoutMs, 8000);
  assert.equal(apiRequests, before + 1);
  assert.equal(cleared, apiRequests);
  environment.KINOPOISK_API_KEY = "";
  assert.equal((await request()).body.error, "UNAVAILABLE");
  assert.equal(apiRequests, before + 1);
  return "Пройдены проверки поиска, ошибок, двух списков, переноса и защиты от дублей. Запросов к настоящему API не было.";
}

if (require.main === module) {
  run().then(console.log).catch(() => { console.error("Проверка не пройдена. Запустите отладку tests/search.cjs."); process.exitCode = 1; });
}
module.exports = run;

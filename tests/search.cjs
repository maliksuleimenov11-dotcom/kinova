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
  const nodes = Object.fromEntries(["search-form", "query", "input-error", "search-status", "results", "result-count", "watchlist", "watchlist-count", "watchlist-empty", "watched", "watched-count", "watched-empty", "catalog-status", "storage-status"].map((id) => [id, element()]));
  const stored = new Map([["unrelated", "keep"]]);
  let writeFails = false;
  const storage = {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { if (writeFails) throw new Error("quota"); stored.set(key, value); },
  };
  const button = element();
  nodes["search-form"].querySelector = () => button;
  let requests = 0;
  let reply = async () => ({ ok: true, json: async () => ({ films: [] }) });
  let clientTimeout;
  const client = vm.createContext({
    localStorage: storage, URL,
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
  assert.equal(nodes["catalog-status"].textContent, "Фильм перенесён в „Просмотрено“");
  const savedCards = () => JSON.stringify([nodes.watchlist, nodes.watched].map((list) => list.children.map((item) => ({
    id: item.dataset.filmId,
    title: item.children[1].textContent,
    meta: item.children[2].children.map((field) => field.textContent),
  }))));
  const beforeErrors = savedCards();
  const beforeErrorsCount = [nodes["watchlist-count"].textContent, nodes["watched-count"].textContent];
  for (const nextReply of [
    async () => ({ ok: true, json: async () => ({ films: [] }) }),
    async () => { throw new Error("network"); },
    async () => ({ ok: false, json: async () => ({ error: "API_LIMIT" }) }),
  ]) {
    reply = nextReply;
    await submit();
    assert.equal(savedCards(), beforeErrors);
    assert.deepEqual([nodes["watchlist-count"].textContent, nodes["watched-count"].textContent], beforeErrorsCount);
  }
  const requestsBeforeOfflineMove = requests;
  nodes.watched.children[0].children[3].listeners.click();
  assert.equal(requests, requestsBeforeOfflineMove);
  assert.equal(nodes.watchlist.children[0].dataset.filmId, 1);
  assert.equal(nodes.watchlist.children[0].children[1].textContent, "Original");
  assert.equal(nodes.watchlist.children[0].children[2].children[0].textContent, "Год не указан");
  assert.equal(nodes["catalog-status"].textContent, "Фильм перенесён в „Хочу посмотреть“");
  reply = async () => ({ ok: true, json: async () => ({ films: [
    { id: 0 }, { id: -1 }, { id: 1.5 }, { id: "5" },
    { id: 7, nameRu: "Один фильм" }, { id: 7, nameRu: "Другой вариант названия" },
  ] }) });
  await submit();
  for (const invalidCard of nodes.results.children.slice(0, 4)) assert.equal(invalidCard.children.length, 3);
  const firstDuplicate = nodes.results.children[4].children[3].listeners.click;
  const secondDuplicate = nodes.results.children[5].children[4].listeners.click;
  firstDuplicate();
  secondDuplicate();
  assert.equal(nodes.watchlist.children.length + nodes.watched.children.length, 4);
  assert.equal(nodes.results.children[4].children[3].textContent, "В списке „Хочу посмотреть“");
  assert.equal(nodes.results.children[5].children[3].textContent, "В списке „Хочу посмотреть“");
  assert.equal(nodes["catalog-status"].textContent, "Фильм добавлен в „Хочу посмотреть“");

  // Сбой записи не меняет интерфейс, порядок или прежнюю строку в хранилище.
  const beforeFailedMove = savedCards();
  const storedBeforeFailure = stored.get("kinova.catalog");
  const retryMove = nodes.watchlist.children[0].children[3].listeners.click;
  writeFails = true;
  retryMove();
  assert.equal(savedCards(), beforeFailedMove);
  assert.equal(stored.get("kinova.catalog"), storedBeforeFailure);
  assert(nodes["storage-status"].textContent.startsWith("Не удалось сохранить изменения"));
  assert.equal(nodes["catalog-status"].textContent, "");
  writeFails = false;
  retryMove();
  assert.equal(nodes["storage-status"].textContent, "");
  assert.equal(nodes.watched.children[0].dataset.filmId, 7);
  assert.equal(stored.get("unrelated"), "keep");

  // Новый контекст страницы восстанавливает оба списка без API.
  const freshNodes = Object.fromEntries(Object.keys(nodes).map((id) => [id, element()]));
  freshNodes["search-form"].querySelector = () => element();
  const freshContext = vm.createContext({
    localStorage: storage, URL,
    document: { querySelector: (selector) => freshNodes[selector.slice(1)], createElement: element },
  });
  vm.runInContext(read("script.js"), freshContext);
  for (const id of ["watchlist", "watched"]) {
    assert.deepEqual(freshNodes[id].children.map((item) => item.dataset.filmId), nodes[id].children.map((item) => item.dataset.filmId));
    assert.equal(freshNodes[`${id}-count`].textContent, nodes[`${id}-count`].textContent);
    assert.equal(freshNodes[`${id}-empty`].hidden, nodes[`${id}-empty`].hidden);
  }
  assert.equal(freshNodes["storage-status"].textContent, "");
  const beforeRestoredDuplicate = stored.get("kinova.catalog");
  vm.runInContext('addToCatalog({ id: 7, nameRu: "Повтор" }, "planned")', freshContext);
  assert.equal(stored.get("kinova.catalog"), beforeRestoredDuplicate);
  assert.equal(freshNodes.watchlist.children.length + freshNodes.watched.children.length, 4);
  assert(read("index.html").includes("Каталог сохраняется в этом браузере"));

  function storagePage(raw, readFails = false) {
    const pageNodes = Object.fromEntries(Object.keys(nodes).map((id) => [id, element()]));
    const searchButton = element();
    pageNodes["search-form"].querySelector = () => searchButton;
    const values = new Map([["unrelated", "keep"]]);
    if (raw !== null) values.set("kinova.catalog", raw);
    let writes = 0;
    let failWrite = false;
    const context = vm.createContext({
      URL, location: { protocol: "http:" }, AbortSignal,
      localStorage: {
        getItem(key) { if (readFails) throw new Error("denied"); return values.get(key) ?? null; },
        setItem(key, value) { writes++; if (failWrite) throw new Error("quota"); values.set(key, value); },
      },
      document: { querySelector: (selector) => pageNodes[selector.slice(1)], createElement: element },
      fetch: async () => ({ ok: true, json: async () => ({ films: [{ id: 90, nameRu: "Проверка" }] }) }),
    });
    vm.runInContext(read("script.js"), context);
    return { nodes: pageNodes, values, context, button: searchButton, writes: () => writes, failWrite: (value) => { failWrite = value; } };
  }
  const validFilm = { id: 11, status: "planned", nameRu: "Первый фильм", nameOriginal: null, year: 2000, rating: 8, poster: null };
  const invalidRows = [null, { ...validFilm, id: "11" }, { ...validFilm, status: "other" },
    { ...validFilm, nameRu: 123 }, { ...validFilm, year: 2000.5 }, { ...validFilm, rating: 11 },
    { ...validFilm, poster: "javascript:alert(1)" }, { ...validFilm, poster: "https://user:password@example.org/a.jpg" }];
  const invalidRaw = ["{broken", "null", "[]", JSON.stringify({ version: 2, films: [] }),
    JSON.stringify({ version: 1, films: {} }), ...invalidRows.map((film) => JSON.stringify({ version: 1, films: [validFilm, film] }))];
  for (const raw of invalidRaw) {
    const page = storagePage(raw);
    assert.equal(page.nodes.watchlist.children.length, 0);
    assert(page.nodes["storage-status"].textContent.startsWith("Не удалось восстановить каталог"));
    page.nodes.query.value = "фильм";
    await page.nodes["search-form"].listeners.submit({ preventDefault() {} });
    assert.equal(page.nodes.results.children.length, 1);
    assert.equal(page.nodes.results.children[0].children[3].disabled, true);
    assert.equal(page.button.disabled, false);
    vm.runInContext('addToCatalog({ id: 90 }, "planned")', page.context);
    assert.equal(page.writes(), 0);
    assert.equal(page.values.get("kinova.catalog"), raw);
    assert.equal(page.values.get("unrelated"), "keep");
  }
  const unreadable = storagePage(JSON.stringify({ version: 1, films: [validFilm] }), true);
  assert(unreadable.nodes["storage-status"].textContent.startsWith("Не удалось прочитать каталог"));
  vm.runInContext('addToCatalog({ id: 90 }, "planned")', unreadable.context);
  assert.equal(unreadable.writes(), 0);
  const recovered = storagePage(unreadable.values.get("kinova.catalog"));
  assert.equal(recovered.nodes.watchlist.children.length, 1);
  const duplicateRaw = JSON.stringify({ version: 1, films: [validFilm, { ...validFilm, status: "watched", nameRu: "Повтор" }] });
  const duplicates = storagePage(duplicateRaw);
  assert.equal(duplicates.nodes.watchlist.children.length, 1);
  assert.equal(duplicates.nodes.watched.children.length, 0);
  assert.equal(duplicates.nodes.watchlist.children[0].children[1].textContent, "Первый фильм");
  assert.equal(duplicates.nodes["storage-status"].textContent, "Повторяющиеся фильмы объединены");
  assert.equal(duplicates.values.get("kinova.catalog"), duplicateRaw);
  const empty = storagePage(null);
  assert.equal(empty.nodes["storage-status"].textContent, "");
  assert.equal(empty.nodes["watchlist-count"].textContent, "0");
  empty.failWrite(true);
  vm.runInContext('addToCatalog({ id: 90 }, "planned")', empty.context);
  assert.equal(empty.nodes.watchlist.children.length, 0);
  assert.equal(empty.values.has("kinova.catalog"), false);
  assert(empty.nodes["storage-status"].textContent.startsWith("Не удалось сохранить изменения"));
  empty.failWrite(false);
  vm.runInContext('addToCatalog({ id: 90 }, "planned")', empty.context);
  assert.equal(empty.nodes.watchlist.children.length, 1);
  assert.equal(empty.nodes["storage-status"].textContent, "");
  assert.equal(empty.values.get("unrelated"), "keep");

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
  return "Пройдены проверки поиска, списков, сохранения, восстановления и ошибки записи. Запросов к настоящему API не было.";
}

if (require.main === module) {
  run().then(console.log).catch(() => { console.error("Проверка не пройдена. Запустите отладку tests/search.cjs."); process.exitCode = 1; });
}
module.exports = run;

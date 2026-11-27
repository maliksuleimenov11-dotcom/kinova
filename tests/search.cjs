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
  const nodes = Object.fromEntries(["search-form", "query", "input-error", "search-status", "results", "result-count", "watchlist", "watchlist-count", "watchlist-empty", "watched", "watched-count", "watched-empty", "catalog-status", "storage-status", "catalog-search-form", "catalog-query", "catalog-search-error", "catalog-search-status", "catalog-search-reset", "catalog-export", "catalog-export-status", "catalog-import-choose", "catalog-import-file", "catalog-import-hint", "catalog-import-status", "catalog-import-preview", "catalog-import-title", "catalog-import-name", "catalog-import-summary", "catalog-import-cancel"].map((id) => [id, element()]));
  const stored = new Map([["unrelated", "keep"]]);
  nodes["catalog-import-confirm"] = element();
  nodes["catalog-title"] = element();
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
  for (const json of [async () => { throw new SyntaxError("HTML firewall response"); }, async () => ({ error: "RATE_LIMITED" })]) {
    reply = async () => ({ status: 429, ok: false, json });
    const before = requests;
    await submit();
    assert.equal(message(), "Слишком много запросов к поиску. Подождите немного и попробуйте снова");
    assert.equal(requests, before + 1);
    ready();
  }
  reply = async () => ({ status: 429, ok: false, json: async () => ({ error: "API_LIMIT" }) });
  await submit();
  assert.equal(message(), "Лимит API исчерпан. Попробуйте позже");
  ready();
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
    let networkCalls = 0;
    let response = async () => ({ ok: true, json: async () => ({ films: [{ id: 90, nameRu: "Проверка" }] }) });
    const context = vm.createContext({
      URL, location: { protocol: "http:" }, AbortSignal,
      localStorage: {
        getItem(key) { if (readFails) throw new Error("denied"); return values.get(key) ?? null; },
        setItem(key, value) { writes++; if (failWrite) throw new Error("quota"); values.set(key, value); },
      },
      document: { querySelector: (selector) => pageNodes[selector.slice(1)], createElement: element },
      fetch: () => { networkCalls++; return response(); },
    });
    vm.runInContext(read("script.js"), context);
    return { nodes: pageNodes, values, context, button: searchButton, writes: () => writes, failWrite: (value) => { failWrite = value; }, respond: (value) => { response = value; }, networkCalls: () => networkCalls };
  }
  const validFilm = { id: 11, status: "planned", nameRu: "Первый фильм", nameOriginal: null, year: 2000, rating: 8, poster: null };
  const invalidRows = [null, { ...validFilm, id: "11" }, { ...validFilm, status: "other" },
    { ...validFilm, nameRu: 123 }, { ...validFilm, year: 2000.5 }, { ...validFilm, rating: 11 },
    { ...validFilm, poster: "javascript:alert(1)" }, { ...validFilm, poster: "https://user:password@example.org/a.jpg" }];
  const invalidRaw = ["{broken", "null", "[]", JSON.stringify({ version: 3, films: [] }),
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

  // Поиск после восстановления не записывает каталог и учитывает оба статуса.
  const restoredRaw = JSON.stringify({ version: 1, films: [
    { ...validFilm, id: 90 }, { ...validFilm, id: 91, status: "watched" },
  ] });
  const restoredPage = storagePage(restoredRaw);
  const pageSubmit = () => restoredPage.nodes["search-form"].listeners.submit({ preventDefault() {} });
  restoredPage.nodes.query.value = "фильм";
  restoredPage.respond(async () => ({ ok: true, json: async () => ({ films: [{ id: 90 }, { id: 91 }] }) }));
  await pageSubmit();
  assert.equal(restoredPage.nodes.results.children[0].children[3].textContent, "В списке „Хочу посмотреть“");
  assert.equal(restoredPage.nodes.results.children[1].children[3].textContent, "В списке „Просмотрено“");
  const restoredSnapshot = () => JSON.stringify(["watchlist", "watched"].map((id) => ({
    count: restoredPage.nodes[`${id}-count`].textContent,
    films: restoredPage.nodes[id].children.map((card) => [card.dataset.filmId, card.children[1].textContent]),
  })));
  const beforeRestoredErrors = restoredSnapshot();
  for (const failure of [
    async () => ({ ok: true, json: async () => ({ films: [] }) }),
    async () => { throw new Error("network"); },
    async () => ({ ok: false, json: async () => ({ error: "API_LIMIT" }) }),
  ]) {
    restoredPage.respond(failure);
    await pageSubmit();
    assert.equal(restoredSnapshot(), beforeRestoredErrors);
    assert.equal(restoredPage.values.get("kinova.catalog"), restoredRaw);
    assert.equal(restoredPage.writes(), 0);
  }
  // Перенос восстановленного фильма сохраняется и виден при следующем открытии.
  restoredPage.nodes.watchlist.children[0].children[3].listeners.click();
  assert.equal(restoredPage.nodes.watched.children.length, 2);
  const openedAgain = storagePage(restoredPage.values.get("kinova.catalog"));
  assert.equal(openedAgain.nodes.watchlist.children.length, 0);
  assert.deepEqual(openedAgain.nodes.watched.children.map((card) => card.dataset.filmId), [90, 91]);
  assert.equal(openedAgain.nodes["watched-count"].textContent, "2");
  assert.equal(openedAgain.nodes["watchlist-empty"].hidden, false);

  const oldRaw = JSON.stringify({ version: 1, films: [validFilm] });
  const ratedPage = storagePage(oldRaw);
  assert.equal(ratedPage.values.get("kinova.catalog"), oldRaw);
  const ratingCard = () => ratedPage.nodes.watchlist.children[0];
  const openRating = () => { ratingCard().children[5].listeners.click(); return ratingCard().children[6]; };
  let ratingForm = openRating();
  assert.equal(ratingCard().children[3].disabled, true);
  assert.equal(ratingForm.children[2].focused, true);
  ratingForm.children[2].value = "8";
  ratedPage.failWrite(true);
  ratingForm.listeners.submit({ preventDefault() {} });
  assert.equal(ratingCard().children[6], ratingForm);
  assert.equal(ratingForm.children[2].value, "8");
  assert.equal(ratedPage.values.get("kinova.catalog"), oldRaw);
  assert.equal(ratingCard().children[4].textContent, "Моя оценка: не указана");
  ratedPage.failWrite(false);
  ratingForm.listeners.submit({ preventDefault() {} });
  assert.equal(ratingCard().children[4].textContent, "Моя оценка: 8 из 10");
  assert.equal(ratingCard().children[5].focused, true);
  let savedRating = JSON.parse(ratedPage.values.get("kinova.catalog"));
  assert.equal(savedRating.version, 2);
  assert.equal(savedRating.films[0].rating, 8);
  assert.equal(savedRating.films[0].personalRating, 8);
  assert.equal(savedRating.films[0].review, "");
  ratingForm = openRating();
  ratingForm.children[2].value = "1";
  ratingForm.children[9].listeners.click();
  assert.equal(ratingCard().children[4].textContent, "Моя оценка: 8 из 10");
  ratingForm = openRating();
  for (const invalid of ["0", "11", "2.5", "abc"]) {
    ratingForm.children[2].value = invalid;
    ratingForm.listeners.submit({ preventDefault() {} });
    assert(ratingForm.children[3].textContent.startsWith("Выберите целую оценку"));
    assert.equal(JSON.parse(ratedPage.values.get("kinova.catalog")).films[0].personalRating, 8);
  }
  for (const value of ["1", "10", ""]) {
    ratingForm.children[2].value = value;
    ratingForm.listeners.submit({ preventDefault() {} });
    assert.equal(JSON.parse(ratedPage.values.get("kinova.catalog")).films[0].personalRating, value ? Number(value) : null);
    ratingForm = openRating();
  }
  ratingForm.children[2].value = "8";
  ratingForm.listeners.submit({ preventDefault() {} });
  ratingCard().children[3].listeners.click();
  const reloadedRating = storagePage(ratedPage.values.get("kinova.catalog"));
  assert.equal(reloadedRating.nodes.watched.children[0].children[4].textContent, "Моя оценка: 8 из 10");
  const futureReview = storagePage(JSON.stringify({ version: 2, films: [{ ...validFilm, personalRating: 9, review: "Сохранённый отзыв" }] }));
  futureReview.nodes.watchlist.children[0].children[5].listeners.click();
  const futureForm = futureReview.nodes.watchlist.children[0].children[6];
  futureForm.children[2].value = "7";
  futureForm.listeners.submit({ preventDefault() {} });
  assert.equal(JSON.parse(futureReview.values.get("kinova.catalog")).films[0].review, "Сохранённый отзыв");
  const reviewPage = storagePage(JSON.stringify({ version: 2, films: [{ ...validFilm, personalRating: 8, review: "Прежний отзыв" }] }));
  const reviewCard = () => reviewPage.nodes.watchlist.children.find((card) => card.dataset.filmId === 11);
  const openReview = () => { reviewCard().children[5].listeners.click(); return reviewCard().children[6]; };
  let reviewForm = openReview();
  const submitReview = () => reviewForm.listeners.submit({ preventDefault() {} });
  const setReview = (text) => { reviewForm.children[5].value = text; reviewForm.children[5].listeners.input(); };
  setReview("я".repeat(501));
  submitReview();
  assert.equal(reviewForm.children[6].textContent, "501 / 500");
  assert.equal(reviewForm.children[7].textContent, "Отзыв должен быть не длиннее 500 символов");
  assert.equal(reviewForm.children[5].value.length, 501);
  assert.equal(reviewForm.children[5].focused, true);
  assert.equal(JSON.parse(reviewPage.values.get("kinova.catalog")).films[0].review, "Прежний отзыв");
  setReview("я".repeat(500));
  submitReview();
  assert.equal(JSON.parse(reviewPage.values.get("kinova.catalog")).films[0].review.length, 500);
  reviewForm = openReview();
  setReview("  Отличный фильм  ");
  assert.equal(reviewForm.children[6].textContent, "14 / 500");
  reviewPage.failWrite(true);
  submitReview();
  assert.equal(reviewCard().children[6], reviewForm);
  assert.equal(reviewForm.children[5].value, "  Отличный фильм  ");
  assert.equal(JSON.parse(reviewPage.values.get("kinova.catalog")).films[0].review.length, 500);
  reviewPage.failWrite(false);
  submitReview();
  assert.equal(JSON.parse(reviewPage.values.get("kinova.catalog")).films[0].review, "Отличный фильм");
  assert.equal(reviewPage.nodes["catalog-status"].textContent, "Оценка и отзыв сохранены");
  reviewForm = openReview();
  setReview("Отменённый текст");
  reviewForm.children[9].listeners.click();
  reviewForm = openReview();
  assert.equal(reviewForm.children[5].value, "Отличный фильм");
  setReview("😀".repeat(500));
  assert.equal(reviewForm.children[6].textContent, "500 / 500");
  submitReview();
  assert.equal(Array.from(JSON.parse(reviewPage.values.get("kinova.catalog")).films[0].review).length, 500);
  reviewForm = openReview();
  setReview("<b>Фильм</b>\nВторая строка");
  // Поиск и добавление другого фильма не заменяют форму с черновиком.
  reviewPage.nodes.query.value = "фильм";
  await reviewPage.nodes["search-form"].listeners.submit({ preventDefault() {} });
  assert.equal(reviewCard().children[6], reviewForm);
  reviewPage.nodes.results.children[0].children[3].listeners.click();
  assert.equal(reviewCard().children[6], reviewForm);
  assert.equal(reviewForm.children[5].value, "<b>Фильм</b>\nВторая строка");
  submitReview();
  assert.equal(reviewCard().children[6].textContent, "Мой отзыв: <b>Фильм</b>\nВторая строка");
  assert.equal(reviewCard().children[6].children.length, 0);
  reviewCard().children[3].listeners.click();
  const reviewReloaded = storagePage(reviewPage.values.get("kinova.catalog"));
  const movedReview = reviewReloaded.nodes.watched.children[0];
  assert.equal(movedReview.children[4].textContent, "Моя оценка: 8 из 10");
  assert.equal(movedReview.children[6].textContent, "Мой отзыв: <b>Фильм</b>\nВторая строка");
  movedReview.children[5].listeners.click();
  const clearReview = reviewReloaded.nodes.watched.children[0].children[6];
  clearReview.children[2].value = "";
  clearReview.children[5].value = "   ";
  clearReview.listeners.submit({ preventDefault() {} });
  const clearedPersonal = JSON.parse(reviewReloaded.values.get("kinova.catalog")).films.find((film) => film.id === 11);
  assert.equal(clearedPersonal.personalRating, null);
  assert.equal(clearedPersonal.review, "");

  // Редактирование не меняет порядок, статус, счётчики и другие фильмы.
  const finalRaw = JSON.stringify({ version: 2, films: [
    { ...validFilm, personalRating: 6, review: "Сохранено" },
    { ...validFilm, id: 12, status: "watched", personalRating: 9, review: "Другой фильм" },
  ] });
  const finalPage = storagePage(finalRaw);
  finalPage.nodes.watchlist.children[0].children[5].listeners.click();
  const finalForm = finalPage.nodes.watchlist.children[0].children[6];
  finalForm.children[5].value = "Черновик";
  // Повторное нажатие той же кнопки не стирает черновик.
  finalPage.nodes.watchlist.children[0].children[5].listeners.click();
  assert.equal(finalPage.nodes.watchlist.children[0].children[6], finalForm);
  assert.equal(finalForm.children[5].value, "Черновик");
  finalPage.respond(async () => { throw new Error("network"); });
  finalPage.nodes.query.value = "фильм";
  await finalPage.nodes["search-form"].listeners.submit({ preventDefault() {} });
  assert.equal(finalPage.nodes.watchlist.children[0].children[6], finalForm);
  assert.equal(finalPage.values.get("kinova.catalog"), finalRaw);
  // Прямой вызов переноса также защищает редактируемый фильм.
  vm.runInContext('moveFilm(11, "watched")', finalPage.context);
  assert.equal(finalPage.values.get("kinova.catalog"), finalRaw);
  // Перенос другого фильма сохраняет открытый черновик.
  finalPage.nodes.watched.children[0].children[3].listeners.click();
  const editingCard = () => finalPage.nodes.watchlist.children.find((card) => card.dataset.filmId === 11);
  assert.equal(editingCard().children[6], finalForm);
  assert.equal(finalForm.children[5].value, "Черновик");
  const beforeEditRows = JSON.parse(finalPage.values.get("kinova.catalog")).films;
  finalForm.children[2].value = "10";
  finalForm.listeners.submit({ preventDefault() {} });
  const afterEditRows = JSON.parse(finalPage.values.get("kinova.catalog")).films;
  assert.deepEqual(afterEditRows.map((film) => [film.id, film.status]), beforeEditRows.map((film) => [film.id, film.status]));
  assert.deepEqual(afterEditRows.find((film) => film.id === 12), beforeEditRows.find((film) => film.id === 12));
  assert.equal(finalPage.nodes["watchlist-count"].textContent, "2");
  assert.equal(afterEditRows.find((film) => film.id === 11).review, "Черновик");
  // Открытие другой формы отменяет только несохранённый ввод предыдущей.
  editingCard().children[5].listeners.click();
  editingCard().children[6].children[5].value = "Не сохранять";
  finalPage.nodes.watchlist.children.find((card) => card.dataset.filmId === 12).children[5].listeners.click();
  editingCard().children[5].listeners.click();
  assert.equal(editingCard().children[6].children[5].value, "Черновик");
  assert.equal(finalPage.nodes.watchlist.children.filter((card) => card.children[6]?.className === "rating-form").length, 1);

  for (const broken of [{ personalRating: 0 }, { personalRating: 1.5 }, { personalRating: "8" }, { review: 123 }, { review: "я".repeat(501) }]) {
    const raw = JSON.stringify({ version: 2, films: [{ ...validFilm, personalRating: null, review: "", ...broken }] });
    const page = storagePage(raw);
    assert(page.nodes["storage-status"].textContent.startsWith("Не удалось восстановить каталог"));
    assert.equal(page.values.get("kinova.catalog"), raw);
    assert.equal(page.writes(), 0);
  }

  const localPage = storagePage(JSON.stringify({ version: 2, films: [
    { ...validFilm, id: 101, nameRu: "Матрица" },
    { ...validFilm, id: 102, nameRu: "Дюна" },
    { ...validFilm, id: 103, nameRu: null, nameOriginal: "Матрица", status: "watched" },
  ] }));
  const localNodes = localPage.nodes;
  const localRaw = localPage.values.get("kinova.catalog");
  // Любой запрос к сети — ошибка проверки, поиск каталога должен работать без неё.
  localPage.respond(async () => { throw new Error("Unexpected network request"); });
  const localSubmit = () => localNodes["catalog-search-form"].listeners.submit({ preventDefault() {} });
  const visibleIds = (id) => localNodes[id].children.filter((card) => !card.hidden).map((card) => card.dataset.filmId);
  localNodes["catalog-query"].value = " МАТР ";
  assert.equal(visibleIds("watchlist").length, 2);
  localSubmit();
  assert.deepEqual(visibleIds("watchlist"), [101]);
  assert.deepEqual(visibleIds("watched"), [103]);
  assert.equal(localNodes["watchlist-count"].textContent, "Найдено: 1 из 2");
  assert.equal(localNodes["watched-count"].textContent, "Найдено: 1 из 1");
  localNodes["catalog-query"].value = "Дюна";
  assert.deepEqual(visibleIds("watchlist"), [101]);
  localNodes["catalog-query"].value = "я".repeat(201);
  localSubmit();
  assert.deepEqual(visibleIds("watchlist"), [101]);
  assert(localNodes["catalog-search-error"].textContent);
  localNodes["catalog-query"].value = "нет совпадений";
  localSubmit();
  assert.equal(visibleIds("watchlist").length, 0);
  assert.equal(localNodes["watchlist-empty"].hidden, false);
  assert(localNodes["watchlist-empty"].textContent.startsWith("В этом списке ничего не найдено"));
  assert.equal(localPage.values.get("kinova.catalog"), localRaw);
  assert.equal(localPage.writes(), 0);
  localNodes["catalog-search-reset"].listeners.click();
  assert.equal(localNodes["catalog-query"].value, "");
  assert.equal(localNodes["catalog-query"].focused, true);
  assert.deepEqual(visibleIds("watchlist"), [102, 101]);
  localNodes.watchlist.children[1].children[5].listeners.click();
  const localDraft = localNodes.watchlist.children[1].children[6];
  localDraft.children[5].value = "Черновик";
  localNodes["catalog-query"].value = "Дюна";
  localSubmit();
  assert.equal(localNodes.watchlist.children[1].hidden, true);
  localNodes["catalog-search-reset"].listeners.click();
  assert.equal(localNodes.watchlist.children[1].children[6], localDraft);
  assert.equal(localDraft.children[5].value, "Черновик");
  localDraft.children[9].listeners.click();
  localNodes["catalog-query"].value = "матр";
  localSubmit();
  localNodes.watchlist.children[1].children[3].listeners.click();
  assert.equal(visibleIds("watchlist").length, 0);
  assert.deepEqual(visibleIds("watched"), [101, 103]);
  assert.equal(localNodes["watchlist-count"].textContent, "Найдено: 0 из 1");
  localNodes["catalog-query"].value = "  ";
  localSubmit();
  assert.deepEqual(visibleIds("watchlist"), [102]);
  assert.equal(localNodes["watchlist-count"].textContent, "1");
  assert.equal(localPage.networkCalls(), 0);

  // Выгрузка всех сохранённых данных, без черновика и без сети.
  const exportRaw = JSON.stringify({ version: 2, films: [
    { ...validFilm, personalRating: 8, review: "Сохранённый отзыв", unexpectedField: "do-not-export" },
    { ...validFilm, id: 12, nameRu: "Другой фильм", status: "watched", personalRating: 10, review: "Вторая запись" },
  ] });
  const exportPage = storagePage(exportRaw);
  const links = [];
  const blobs = [];
  const released = [];
  const cleanup = [];
  let failDownload = false;
  const mockURL = class extends URL {
    static createObjectURL(blob) { blobs.push(blob); return `blob:test-${blobs.length}`; }
    static revokeObjectURL(url) { released.push(url); }
  };
  exportPage.context.URL = mockURL;
  exportPage.context.Blob = Blob;
  exportPage.context.Date = class extends Date { constructor() { super(2026, 10, 27, 23, 30); } };
  exportPage.context.setTimeout = (callback) => { cleanup.push(callback); };
  exportPage.context.document.body = { append(link) { links.push(link); } };
  const createElement = exportPage.context.document.createElement;
  exportPage.context.document.createElement = (tag) => {
    const item = createElement(tag);
    if (tag === "a") {
      item.click = () => { if (failDownload) throw new Error("download failed"); item.clicked = true; };
      item.remove = () => { item.removed = true; };
    }
    return item;
  };
  exportPage.nodes.watchlist.children[0].children[5].listeners.click();
  const exportDraft = exportPage.nodes.watchlist.children[0].children[6];
  exportDraft.children[5].value = "Несохранённый черновик";
  exportPage.nodes["catalog-query"].value = "Другой";
  exportPage.nodes["catalog-search-form"].listeners.submit({ preventDefault() {} });
  assert.equal(exportPage.nodes.watchlist.children[0].hidden, true);
  exportPage.nodes["catalog-export"].listeners.click();
  const downloaded = JSON.parse(await blobs[0].text());
  assert.equal(downloaded.version, 2);
  assert.deepEqual(downloaded.films.map((film) => film.id), [11, 12]);
  assert.equal(downloaded.films[0].personalRating, 8);
  assert.equal(downloaded.films[0].review, "Сохранённый отзыв");
  assert.equal(downloaded.films[1].status, "watched");
  assert.equal(downloaded.films[1].personalRating, 10);
  assert(!("unexpectedField" in downloaded.films[0]));
  assert.equal(links[0].download, "kinova-catalog-2026-11-27.json");
  assert.equal(links[0].clicked, true);
  assert.equal(links[0].removed, true);
  assert.equal(blobs[0].type, "application/json;charset=utf-8");
  assert.equal(exportPage.values.get("kinova.catalog"), exportRaw);
  assert.equal(exportPage.values.get("unrelated"), "keep");
  assert.equal(exportPage.nodes.watchlist.children[0].children[6], exportDraft);
  assert.equal(exportDraft.children[5].value, "Несохранённый черновик");
  assert.equal(exportPage.writes(), 0);
  assert.equal(exportPage.networkCalls(), 0);
  cleanup.shift()();
  assert.deepEqual(released, ["blob:test-1"]);
  failDownload = true;
  exportPage.nodes["catalog-export"].listeners.click();
  assert.equal(exportPage.nodes["catalog-export-status"].textContent, "Не удалось подготовить файл. Попробуйте ещё раз");
  assert.equal(links[1].removed, true);
  cleanup.shift()();
  assert.equal(released.length, 2);
  failDownload = false;
  exportPage.nodes["catalog-export"].listeners.click();
  assert(exportPage.nodes["catalog-export-status"].textContent.startsWith("Файл подготовлен"));
  cleanup.shift()();
  const emptyExport = storagePage(null);
  emptyExport.context.Blob = Blob;
  emptyExport.context.URL = mockURL;
  emptyExport.context.setTimeout = (callback) => cleanup.push(callback);
  emptyExport.context.document.body = exportPage.context.document.body;
  emptyExport.context.document.createElement = exportPage.context.document.createElement;
  emptyExport.nodes["catalog-export"].listeners.click();
  assert.equal(JSON.parse(await blobs[blobs.length - 1].text()).films.length, 0);
  cleanup.shift()();
  const lockedExport = storagePage("{broken");
  assert.equal(lockedExport.nodes["catalog-export"].disabled, true);
  lockedExport.nodes["catalog-export"].listeners.click();
  assert.equal(lockedExport.values.get("kinova.catalog"), "{broken");

  const previewRaw = JSON.stringify({ version: 2, films: [validFilm] });
  const importPage = storagePage(previewRaw);
  let reads = 0;
  const chooseFile = async (content, options = {}) => {
    importPage.nodes["catalog-import-file"].files = [{
      name: options.name || "catalog.json", size: options.size ?? 100,
      text: async () => { reads++; if (options.error) throw new Error("read failed"); return content; },
    }];
    await importPage.nodes["catalog-import-file"].listeners.change();
  };
  const importData = JSON.stringify({ version: 2, films: [
    { ...validFilm, personalRating: 3, review: "Из файла" },
    { ...validFilm, id: 22, status: "watched", personalRating: 9, review: "Новый" },
    { ...validFilm, id: 22, status: "planned", personalRating: 1 },
  ] });
  await chooseFile(importData, { name: "<b>Каталог</b>.json" });
  assert.equal(importPage.nodes["catalog-import-preview"].hidden, false);
  assert.equal(importPage.nodes["catalog-import-name"].textContent, "Файл: <b>Каталог</b>.json");
  assert.equal(importPage.nodes["catalog-import-name"].children.length, 0);
  assert.equal(importPage.nodes["catalog-import-summary"].textContent, "Уникальных фильмов: 2. Добавится: 1. Уже есть: 1. Повторов в файле пропущено: 1.");
  assert.equal(importPage.nodes["catalog-import-title"].focused, true);
  assert.equal(importPage.nodes["catalog-import-file"].value, "");
  assert.equal(importPage.nodes.watchlist.children[0].children[3].disabled, true);
  assert.equal(importPage.nodes.watchlist.children[0].children[5].disabled, true);
  vm.runInContext('addToCatalog({ id: 99 }, "planned"); moveFilm(11, "watched"); openRatingEditor(11);', importPage.context);
  assert.equal(importPage.nodes.watchlist.children.length, 1);
  assert.equal(importPage.nodes.watched.children.length, 0);
  assert.equal(importPage.values.get("kinova.catalog"), previewRaw);
  assert.equal(importPage.writes(), 0);
  importPage.nodes["catalog-import-cancel"].listeners.click();
  assert.equal(importPage.nodes["catalog-import-preview"].hidden, true);
  assert.equal(importPage.nodes["catalog-import-choose"].focused, true);
  assert.equal(importPage.nodes.watchlist.children[0].children[3].disabled, false);
  await chooseFile(importData);
  assert.equal(reads, 2); // Повторный выбор того же файла.
  importPage.nodes["catalog-import-cancel"].listeners.click();
  const beforeBigFile = reads;
  await chooseFile("not read", { size: 5242881 });
  assert.equal(reads, beforeBigFile);
  assert(importPage.nodes["catalog-import-status"].textContent.startsWith("Файл больше 5 МиБ"));
  for (const bad of ["{broken", JSON.stringify({ version: 3, films: [] }), JSON.stringify({ version: 2, films: [validFilm, { ...validFilm, review: "я".repeat(501) }] })]) {
    await chooseFile(bad);
    assert.equal(importPage.nodes["catalog-import-preview"].hidden, true);
    assert(importPage.nodes["catalog-import-status"].textContent.startsWith("Не удалось импортировать каталог"));
    assert.equal(importPage.values.get("kinova.catalog"), previewRaw);
  }
  await chooseFile("", { error: true });
  assert.equal(importPage.nodes["catalog-import-status"].textContent, "Не удалось прочитать файл. Выберите его ещё раз");
  await chooseFile('\uFEFF' + JSON.stringify({ version: 1, films: [validFilm] }), { size: 5242880 });
  assert.equal(importPage.nodes["catalog-import-status"].textContent, "Новых фильмов нет");
  assert.equal(vm.runInContext('pendingImport.films.get(11).personalRating', importPage.context), null);
  importPage.nodes["catalog-import-cancel"].listeners.click();
  await chooseFile(JSON.stringify({ version: 2, films: [] }));
  assert.equal(importPage.nodes["catalog-import-status"].textContent, "Новых фильмов нет");
  importPage.nodes["catalog-import-cancel"].listeners.click();
  importPage.nodes.watchlist.children[0].children[5].listeners.click();
  assert.equal(importPage.nodes["catalog-import-choose"].disabled, true);
  const beforeEditorRead = reads;
  await chooseFile(importData);
  assert.equal(reads, beforeEditorRead);
  assert.equal(importPage.nodes.watchlist.children[0].children[6].className, "rating-form");
  assert.equal(importPage.networkCalls(), 0);
  assert.equal(importPage.writes(), 0);
  assert.equal(importPage.values.get("unrelated"), "keep");

  const cancelReadingPage = storagePage(null);
  let finishReading;
  cancelReadingPage.nodes["catalog-import-file"].files = [{ name: "slow.json", size: 100, text: () => new Promise((resolve) => { finishReading = resolve; }) }];
  const reading = cancelReadingPage.nodes["catalog-import-file"].listeners.change();
  assert.equal(cancelReadingPage.nodes["catalog-import-choose"].disabled, true);
  cancelReadingPage.nodes["catalog-import-cancel"].listeners.click();
  finishReading(importData);
  await reading;
  assert.equal(cancelReadingPage.nodes["catalog-import-preview"].hidden, true);
  assert.equal(cancelReadingPage.writes(), 0);

  const loadImport = async (page, content) => {
    page.nodes["catalog-import-file"].files = [{ name: "copy.json", size: 500, text: async () => content }];
    await page.nodes["catalog-import-file"].listeners.change();
  };
  const confirmPage = storagePage(JSON.stringify({ version: 2, films: [{ ...validFilm, personalRating: 8, review: "Текущий отзыв" }] }));
  const confirmRaw = confirmPage.values.get("kinova.catalog");
  confirmPage.nodes["catalog-query"].value = "скрыть всё";
  confirmPage.nodes["catalog-search-form"].listeners.submit({ preventDefault() {} });
  await loadImport(confirmPage, importData);
  assert.equal(confirmPage.nodes["catalog-import-confirm"].disabled, false);
  confirmPage.failWrite(true);
  confirmPage.nodes["catalog-import-confirm"].listeners.click();
  assert.equal(confirmPage.values.get("kinova.catalog"), confirmRaw);
  assert.equal(confirmPage.nodes.watchlist.children.length, 1);
  assert.equal(confirmPage.nodes["catalog-import-preview"].hidden, false);
  assert.equal(confirmPage.nodes["catalog-import-confirm"].disabled, false);
  const writesBeforeSuccess = confirmPage.writes();
  confirmPage.failWrite(false);
  confirmPage.nodes["catalog-import-confirm"].listeners.click();
  assert.equal(confirmPage.writes(), writesBeforeSuccess + 1);
  const merged = JSON.parse(confirmPage.values.get("kinova.catalog"));
  assert.deepEqual(merged.films.map((film) => film.id), [11, 22]);
  assert.equal(merged.films[0].personalRating, 8);
  assert.equal(merged.films[0].review, "Текущий отзыв");
  assert.equal(merged.films[0].status, "planned");
  assert.equal(merged.films[1].personalRating, 9);
  assert.equal(merged.films[1].review, "Новый");
  assert.equal(merged.films[1].status, "watched");
  assert.equal(confirmPage.nodes["catalog-query"].value, "");
  assert.equal(confirmPage.nodes.watchlist.children[0].hidden, false);
  assert.equal(confirmPage.nodes["catalog-import-preview"].hidden, true);
  assert.equal(confirmPage.nodes["catalog-title"].focused, true);
  assert.equal(confirmPage.nodes["catalog-import-status"].textContent, "Добавлено фильмов: 1. Уже были в каталоге: 1");
  const successfulWrites = confirmPage.writes();
  confirmPage.nodes["catalog-import-confirm"].listeners.click();
  assert.equal(confirmPage.writes(), successfulWrites);
  await loadImport(confirmPage, importData);
  assert.equal(confirmPage.nodes["catalog-import-status"].textContent, "Новых фильмов нет");
  assert.equal(confirmPage.nodes["catalog-import-confirm"].disabled, true);
  confirmPage.nodes["catalog-import-confirm"].listeners.click();
  assert.equal(confirmPage.writes(), successfulWrites);
  assert.equal(confirmPage.networkCalls(), 0);
  const mergedReloaded = storagePage(confirmPage.values.get("kinova.catalog"));
  assert.equal(mergedReloaded.nodes["watchlist-count"].textContent, "1");
  assert.equal(mergedReloaded.nodes["watched-count"].textContent, "1");
  assert.equal(mergedReloaded.nodes.watched.children[0].children[4].textContent, "Моя оценка: 9 из 10");

  const emptyTarget = storagePage(null);
  await loadImport(emptyTarget, JSON.stringify({ version: 1, films: [validFilm, { ...validFilm, id: 33 }] }));
  emptyTarget.nodes["catalog-import-confirm"].listeners.click();
  const oldVersionImported = JSON.parse(emptyTarget.values.get("kinova.catalog"));
  assert.equal(oldVersionImported.version, 2);
  assert.deepEqual(emptyTarget.nodes.watchlist.children.map((card) => card.dataset.filmId), [33, 11]);
  assert.equal(oldVersionImported.films[0].personalRating, null);
  assert.equal(oldVersionImported.films[0].review, "");

  const changedTab = storagePage(previewRaw);
  await loadImport(changedTab, importData);
  const otherTabRaw = JSON.stringify({ version: 2, films: [{ ...validFilm, review: "Из другой вкладки" }] });
  changedTab.values.set("kinova.catalog", otherTabRaw);
  changedTab.nodes["catalog-import-confirm"].listeners.click();
  assert.equal(changedTab.values.get("kinova.catalog"), otherTabRaw);
  assert.equal(changedTab.writes(), 0);
  assert.equal(changedTab.nodes["catalog-import-preview"].hidden, true);
  assert(changedTab.nodes["storage-status"].textContent.includes("Перезагрузите страницу"));
  assert.equal(changedTab.nodes.watchlist.children[0].children[3].disabled, true);
  assert.equal(changedTab.nodes["catalog-export"].disabled, true);

  // Полный перенос именно сформированного экспорта в независимый каталог.
  const transfer = storagePage(null);
  const exportedJson = await blobs[0].text();
  transfer.respond(async () => ({ ok: true, json: async () => ({ films: [{ id: 11 }, { id: 12 }] }) }));
  transfer.nodes.query.value = "фильм";
  await transfer.nodes["search-form"].listeners.submit({ preventDefault() {} });
  const callsBeforeTransfer = transfer.networkCalls();
  await loadImport(transfer, exportedJson);
  assert.equal(transfer.writes(), 0);
  transfer.nodes["catalog-import-confirm"].listeners.click();
  const transferredRaw = transfer.values.get("kinova.catalog");
  assert.deepEqual(JSON.parse(transferredRaw), downloaded);
  assert.equal(transfer.writes(), 1);
  assert.equal(transfer.networkCalls(), callsBeforeTransfer);
  assert.equal(transfer.nodes.results.children[0].children[3].textContent, "В списке „Хочу посмотреть“");
  assert.equal(transfer.nodes.results.children[1].children[3].textContent, "В списке „Просмотрено“");
  const reopenedTransfer = storagePage(transferredRaw);
  assert.equal(reopenedTransfer.nodes.watchlist.children[0].children[4].textContent, "Моя оценка: 8 из 10");
  assert.equal(reopenedTransfer.nodes.watchlist.children[0].children[6].textContent, "Мой отзыв: Сохранённый отзыв");
  assert.equal(reopenedTransfer.nodes.watched.children[0].children[4].textContent, "Моя оценка: 10 из 10");
  assert.equal(reopenedTransfer.nodes.watched.children[0].children[6].textContent, "Мой отзыв: Вторая запись");
  await loadImport(reopenedTransfer, exportedJson);
  assert.equal(reopenedTransfer.nodes["catalog-import-confirm"].disabled, true);
  reopenedTransfer.nodes["catalog-import-confirm"].listeners.click();
  assert.equal(reopenedTransfer.writes(), 0);
  assert.equal(reopenedTransfer.values.get("kinova.catalog"), transferredRaw);
  assert.equal(reopenedTransfer.values.get("unrelated"), "keep");

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

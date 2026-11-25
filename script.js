"use strict";

// Только локальные учебные данные. Сетевых запросов и API-ключа здесь нет.
function demoPoster(title, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="${color}"/><circle cx="430" cy="280" r="190" fill="#ffffff" opacity=".08"/><path d="M0 720 600 350V900H0Z" fill="#000000" opacity=".3"/><text x="44" y="690" fill="#f3f0e9" font-family="sans-serif" font-size="50" font-weight="bold">${title}</text><text x="46" y="740" fill="#f3f0e9" font-family="sans-serif" font-size="18">УЧЕБНЫЙ ПОСТЕР</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const demoFilms = [
  { id: 301, nameRu: "Матрица", year: 1999, rating: 8.5, poster: demoPoster("МАТРИЦА", "#294b3a") },
  { id: 304, nameRu: "Матрица: Перезагрузка", year: 2003, rating: 7.7, poster: demoPoster("ПЕРЕЗАГРУЗКА", "#344b4e") },
  { id: 305, nameRu: "Матрица: Революция", year: 2003, rating: null, poster: null },
  { id: 409424, nameRu: "Дюна", year: 2021, rating: 7.7, poster: demoPoster("ДЮНА", "#78583c") },
];

const form = document.querySelector("#search-form");
const input = document.querySelector("#query");
const button = form.querySelector("button");
const error = document.querySelector("#input-error");
const status = document.querySelector("#search-status");
const results = document.querySelector("#results");
const count = document.querySelector("#result-count");
let searching = false;

function createCard(film) {
  const card = document.createElement("article");
  card.className = "film-card";
  card.dataset.filmId = film.id;
  const poster = document.createElement("div");
  poster.className = "poster";
  poster.textContent = "Нет постера";
  const title = film.nameRu || film.nameOriginal || "Без названия";
  if (film.poster) {
    const image = document.createElement("img");
    image.alt = `Постер: ${title}`;
    image.addEventListener("error", () => { poster.textContent = "Нет постера"; }, { once: true });
    image.src = film.poster;
    poster.replaceChildren(image);
  }
  const heading = document.createElement("h3");
  heading.textContent = title;
  const meta = document.createElement("p");
  meta.className = "film-meta";
  const year = document.createElement("span");
  year.textContent = film.year ?? "Год не указан";
  const rating = document.createElement("span");
  rating.textContent = film.rating == null ? "Нет рейтинга" : `Рейтинг API: ${film.rating}`;
  meta.append(year, rating);
  card.append(poster, heading, meta);
  return card;
}

input.addEventListener("input", () => {
  error.textContent = "";
  input.removeAttribute("aria-invalid");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (searching) return;
  const query = input.value.trim();
  if (!query) {
    error.textContent = "Введите название фильма";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  error.textContent = "";
  input.removeAttribute("aria-invalid");
  searching = true;
  button.disabled = true;
  results.setAttribute("aria-busy", "true");
  results.replaceChildren();
  count.textContent = "";
  status.textContent = "Ищем фильмы…";
  // Короткая задержка позволяет проверить состояние загрузки без API.
  await new Promise((resolve) => setTimeout(resolve, 450));
  const films = demoFilms.filter((film) => (film.nameRu || film.nameOriginal || "").toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  results.replaceChildren(...films.map(createCard));
  status.textContent = films.length ? "Показаны тестовые данные. Рейтинги приведены для примера." : "Ничего не найдено. Попробуйте другое название";
  count.textContent = `Найдено: ${films.length}`;
  results.setAttribute("aria-busy", "false");
  button.disabled = false;
  searching = false;
});

"use strict";

// Этот файл выполняется только на сервере: локально и как Vercel Function.
module.exports = async function search(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(405, { error: "METHOD_NOT_ALLOWED" });
  }
  const params = new URL(req.url, "http://localhost").searchParams;
  const query = (params.get("q") || "").trim();
  if (params.getAll("q").length !== 1 || !query || query.length > 200) {
    return send(400, { error: "INVALID_QUERY" });
  }
  const key = process.env.KINOPOISK_API_KEY?.trim();
  if (!key) return send(503, { error: "UNAVAILABLE" });

  const url = new URL("https://kinopoiskapiunofficial.tech/api/v2.2/films");
  url.searchParams.set("keyword", query);
  url.searchParams.set("page", "1");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    if (response.status === 402 || response.status === 429) {
      return send(429, { error: "API_LIMIT" });
    }
    if (response.status === 401 || response.status === 403) {
      return send(503, { error: "UNAVAILABLE" });
    }
    if (!response.ok) return send(502, { error: "UPSTREAM_ERROR" });
    const data = await response.json();
    if (!Array.isArray(data.items)) return send(502, { error: "UPSTREAM_ERROR" });
    const text = (value) => typeof value === "string" ? value.trim() || null : null;
    const safePoster = (value) => {
      try {
        const poster = new URL(value);
        return poster.protocol === "https:" && !poster.username && !poster.password ? poster.href : null;
      } catch { return null; }
    };
    const films = data.items
      .filter((film) => film && Number.isSafeInteger(film.kinopoiskId) && film.kinopoiskId > 0)
      .map((film) => ({
        id: film.kinopoiskId,
        nameRu: text(film.nameRu),
        nameOriginal: text(film.nameOriginal) || text(film.nameEn),
        year: Number.isInteger(film.year) ? film.year : null,
        rating: typeof film.ratingKinopoisk === "number" && Number.isFinite(film.ratingKinopoisk)
          && film.ratingKinopoisk >= 0 && film.ratingKinopoisk <= 10 ? film.ratingKinopoisk : null,
        poster: safePoster(film.posterUrlPreview) || safePoster(film.posterUrl),
      }));
    return send(200, { films });
  } catch {
    // Не возвращаем и не записываем исходную ошибку: она может содержать секреты.
    return send(502, { error: "UPSTREAM_ERROR" });
  } finally {
    clearTimeout(timer);
  }
};

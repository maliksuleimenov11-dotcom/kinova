"use strict";

const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const search = require("./api/search.js");

// Явный список: файлы окружения, .git и серверный код никогда не раздаются.
const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/script.js": ["script.js", "text/javascript; charset=utf-8"],
};

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname === "/api/search") return await search(req, res);
      const file = publicFiles[pathname];
      if (!file || !["GET", "HEAD"].includes(req.method)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Страница не найдена");
      }
      const body = await readFile(path.join(__dirname, file[0]));
      res.writeHead(200, { "Content-Type": file[1], "X-Content-Type-Options": "nosniff" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Сервер временно недоступен");
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.on("error", () => {
    console.error("Не удалось запустить сервер. Проверьте, свободен ли порт 3000.");
    process.exitCode = 1;
  });
  server.listen(3000, "127.0.0.1", () => console.log("Откройте http://localhost:3000. Для остановки нажмите Ctrl+C."));
}

module.exports = { createServer };

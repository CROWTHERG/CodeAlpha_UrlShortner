import express from "express";
import cors from "cors";
import fs from "fs";
import initSqlJs from "sql.js";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

// fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static("."));
app.use(express.json());

let db;

(async () => {
  // ✅ FIX: use local sql-wasm.wasm instead of remote URL
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, "sqljs", file),
  });

  // Load or create the database
  if (fs.existsSync("urls.db")) {
    const filebuffer = fs.readFileSync("urls.db");
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        longUrl TEXT,
        shortCode TEXT UNIQUE,
        clicks INTEGER DEFAULT 0
      );
    `);
    saveDb();
  }

  console.log("✅ Database initialized and ready");
})();

function saveDb() {
  const data = db.export();
  fs.writeFileSync("urls.db", Buffer.from(data));
}

// ========================= API Routes =========================

// Shorten URL
app.post("/shorten", (req, res) => {
  const { longUrl } = req.body;
  if (!longUrl) return res.status(400).json({ error: "URL is required" });

  const shortCode = nanoid(6);
  db.run("INSERT INTO urls (longUrl, shortCode) VALUES (?, ?)", [longUrl, shortCode]);
  saveDb();
  res.json({ shortUrl: `http://localhost:${PORT}/${shortCode}` });
});

// Redirect + track clicks
app.get("/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const stmt = db.prepare("SELECT longUrl, clicks FROM urls WHERE shortCode = ?");
  stmt.bind([shortCode]);
  if (stmt.step()) {
    const { longUrl, clicks } = stmt.getAsObject();
    db.run("UPDATE urls SET clicks = ? WHERE shortCode = ?", [clicks + 1, shortCode]);
    saveDb();
    res.redirect(longUrl);
  } else {
    res.status(404).send("Short URL not found");
  }
  stmt.free();
});

// Fetch stats
app.get("/stats/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const stmt = db.prepare("SELECT longUrl, clicks FROM urls WHERE shortCode = ?");
  stmt.bind([shortCode]);
  if (stmt.step()) {
    res.json(stmt.getAsObject());
  } else {
    res.status(404).json({ error: "Not found" });
  }
  stmt.free();
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
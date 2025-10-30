import express from "express";
import cors from "cors";
import fs from "fs";
import initSqlJs from "sql.js";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let db;
const DB_FILE = "urls.db";

// Base62 characters
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Encode number to Base62
function encodeBase62(num) {
  if (num === 0) return "0";
  let str = "";
  while (num > 0) {
    str = BASE62[num % 62] + str;
    num = Math.floor(num / 62);
  }
  return str;
}

// Save DB to file
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// Initialize database
(async () => {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, "sqljs", file),
  });

  if (fs.existsSync(DB_FILE)) {
    const filebuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      longUrl TEXT NOT NULL,
      shortCode TEXT UNIQUE NOT NULL,
      clicks INTEGER DEFAULT 0
    );
  `);

  saveDb();
  console.log("✅ Database initialized");
})();

// ================= API ROUTES ==================

// Create short URL
app.post("/shorten", (req, res) => {
  const { longUrl, customCode } = req.body;

  if (!longUrl || typeof longUrl !== "string") {
    return res.status(400).json({ error: "URL is required" });
  }

  let shortCode;

  if (customCode) {
    // Check duplicate
    const stmt = db.prepare("SELECT * FROM urls WHERE shortCode = ?");
    stmt.bind([customCode]);
    if (stmt.step()) {
      stmt.free();
      return res.status(400).json({ error: "Custom code already in use" });
    }
    stmt.free();
    shortCode = customCode;
  } else {
    // Insert first to get auto-incremented id
    db.run("INSERT INTO urls (longUrl, shortCode) VALUES (?, ?)", [longUrl, "temp"]);
    const stmt = db.prepare("SELECT id FROM urls WHERE shortCode = ?");
    stmt.bind(["temp"]);
    stmt.step();
    const { id } = stmt.getAsObject();
    stmt.free();

    // Encode id to Base62
    shortCode = encodeBase62(id);

    // Update shortCode in DB
    db.run("UPDATE urls SET shortCode = ? WHERE id = ?", [shortCode, id]);
  }

  saveDb();

  const fullShortUrl = `${req.protocol}://${req.get("host")}/${shortCode}`;
  res.json({ shortUrl: fullShortUrl });
});

// Redirect short URL
app.get("/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const stmt = db.prepare("SELECT longUrl, clicks FROM urls WHERE shortCode = ?");
  stmt.bind([shortCode]);

  if (stmt.step()) {
    const { longUrl, clicks } = stmt.getAsObject();
    db.run("UPDATE urls SET clicks = ? WHERE shortCode = ?", [clicks + 1, shortCode]);
    saveDb();
    stmt.free();
    return res.redirect(longUrl);
  } else {
    stmt.free();
    return res.status(404).send("Short URL not found");
  }
});

// URL stats
app.get("/stats/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const stmt = db.prepare("SELECT longUrl, clicks FROM urls WHERE shortCode = ?");
  stmt.bind([shortCode]);

  if (stmt.step()) {
    const data = stmt.getAsObject();
    stmt.free();
    return res.json(data);
  } else {
    stmt.free();
    return res.status(404).json({ error: "Short URL not found" });
  }
});

// Simple homepage
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>URL Shortener</title></head>
      <body style="font-family:sans-serif;text-align:center;margin-top:50px">
        <h2>URL Shortener</h2>
        <input type="text" id="urlInput" placeholder="Enter long URL" style="width:60%;padding:10px">
        <input type="text" id="customCode" placeholder="Optional custom code" style="width:30%;padding:10px">
        <button onclick="shorten()">Shorten</button>
        <p id="result"></p>
        <script>
          async function shorten() {
            const url = document.getElementById("urlInput").value;
            const code = document.getElementById("customCode").value;
            const res = await fetch("/shorten", {
              method:"POST",
              headers:{"Content-Type":"application/json"},
              body: JSON.stringify({ longUrl: url, customCode: code || null })
            });
            const data = await res.json();
            document.getElementById("result").innerHTML = data.shortUrl
              ? '<a href="'+data.shortUrl+'" target="_blank">'+data.shortUrl.split("/").pop()+'</a>'
              : data.error;
          }
        </script>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
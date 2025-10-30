import express from "express";
import cors from "cors";
import fs from "fs";
import initSqlJs from "sql.js";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

let db;
const DB_FILE = "urls.db";

// Save database to file
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

// Shorten URL (random or custom)
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
    // Generate random 5-character code
    shortCode = nanoid(5);

    // Ensure uniqueness
    let stmt = db.prepare("SELECT * FROM urls WHERE shortCode = ?");
    stmt.bind([shortCode]);
    while (stmt.step()) {
      shortCode = nanoid(5);
      stmt.reset();
      stmt.bind([shortCode]);
    }
    stmt.free();
  }

  db.run("INSERT INTO urls (longUrl, shortCode) VALUES (?, ?)", [longUrl, shortCode]);
  saveDb();

  // Display as "shorturl/<code>"
  const displayShortUrl = `shorturl/${shortCode}`;
  res.json({ shortUrl: displayShortUrl });
});

// Redirect short URL
app.get("/shorturl/:shortCode", (req, res) => {
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
            if(data.shortUrl){
              // Link points to /shorturl/<code> route
              document.getElementById("result").innerHTML = '<a href="/'+data.shortUrl+'" target="_blank">'+data.shortUrl+'</a>';
            } else {
              document.getElementById("result").innerText = data.error;
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
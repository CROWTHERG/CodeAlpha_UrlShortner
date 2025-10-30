import express from "express";
import initSqlJs from "sql.js";
import { nanoid } from "nanoid";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(express.static("."));
app.use(express.json());
app.use(cors());

let db;
const init = async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run("CREATE TABLE IF NOT EXISTS urls (id TEXT PRIMARY KEY, short TEXT, original TEXT)");
};
await init();

app.post("/shorten", (req, res) => {
  const { url } = req.body;
  const short = nanoid(6);
  db.run("INSERT INTO urls (id, short, original) VALUES (?, ?, ?)", [short, short, url]);
  res.json({ short });
});

app.get("/:short", (req, res) => {
  const stmt = db.prepare("SELECT original FROM urls WHERE short = ?");
  stmt.bind([req.params.short]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    res.redirect(row.original);
  } else {
    res.status(404).send("Not found");
  }
});

app.listen(3000, () => console.log("🚀 Running at http://localhost:3000"));

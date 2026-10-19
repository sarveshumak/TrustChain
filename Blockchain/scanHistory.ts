import Database from "better-sqlite3";

const db = new Database("scanHistory.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        scanTime TEXT NOT NULL,
        status TEXT NOT NULL,
        secretValid INTEGER NOT NULL DEFAULT 0
    )
`);

console.log("Scan history database initialized successfully.");

db.close();
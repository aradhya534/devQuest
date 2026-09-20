import knex, { type Knex } from "knex";
import fs from "fs";
import path from "path";
import config from "../knexfile.js";

let db: Knex;

const dbPath = path.resolve(process.cwd(), config.development.connection.filename);
// Tests use an in-memory database, so the file is only needed for `npm start`; stay quiet under test (and in CI,
// where nobody runs `npm run migrate`).
if (process.env.NODE_ENV !== "test" && !fs.existsSync(dbPath)) {
  console.error("\x1b[31m%s\x1b[0m", "========================================");
  console.error("\x1b[31m%s\x1b[0m", "  ERROR: Database file does not exist!");
  console.error("\x1b[31m%s\x1b[0m", "========================================");
  console.error("\x1b[33m%s\x1b[0m", "Please run the following commands:");
  console.error("\x1b[33m%s\x1b[0m", "  npm run migrate");
  console.error("\x1b[33m%s\x1b[0m", "  npm run seed");
  console.error("\x1b[33m%s\x1b[0m", "");
  console.error("\x1b[33m%s\x1b[0m", "Both the application and tests now require");
  console.error("\x1b[33m%s\x1b[0m", "a properly initialized database file.");
  console.error("\x1b[31m%s\x1b[0m", "========================================");
}

if (process.env.NODE_ENV === "test") {
  db = knex(config.test);
} else {
  db = knex(config.development);
}

export default db;

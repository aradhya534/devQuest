import path from "node:path";
let __dirname = "";

const config = {
  development: {
    client: "sqlite3",
    connection: {
      filename: "./main.sqlite3",
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, "./db/migrations"),
    },
    seeds: {
      directory: path.join(__dirname, "./db/seeds"),
    },
  },

  test: {
    client: "sqlite3",
    connection: {
      filename: ":memory:",
    },
    // A ":memory:" database is private to its connection, so the pool must hold
    // exactly one connection for migrations, seeds and queries to share state.
    pool: { min: 1, max: 1 },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, "./db/migrations"),
    },
    seeds: {
      directory: path.join(__dirname, "./db/seeds"),
    },
  },
};

export default config;

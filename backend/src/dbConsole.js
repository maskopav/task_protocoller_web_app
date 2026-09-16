// src/dbConsole.js
// Opens the MariaDB client against the database in .env, so nobody has to
// retype credentials or hand-parse .env in whatever shell they happen to be in
// (the cmd.exe / Git Bash split makes a one-liner unportable).
//
//   npm run db:sql                          -- interactive console
//   npm run db:sql -- -e "SHOW TABLES;"     -- one-off query
//   npm run db:sql -- -E -e "SELECT * FROM protocols;"   -- vertical output
//
// The password goes through MYSQL_PWD rather than -p on the command line: an
// argument is visible to anything that can list processes, and the client warns
// about it. Everything after `--` is passed straight to the client.
import { spawn } from "child_process";

const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

const missing = Object.entries({ DB_HOST, DB_USER, DB_NAME })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`❌ Missing in backend/.env: ${missing.join(", ")}`);
  process.exit(1);
}

const passthrough = process.argv.slice(2);
const args = ["-h", DB_HOST, "-u", DB_USER, DB_NAME, ...passthrough];

// MariaDB ships `mariadb`; older installs and MySQL ship `mysql`.
const candidates = process.platform === "win32"
  ? ["mariadb.exe", "mysql.exe"]
  : ["mariadb", "mysql"];

function run(index) {
  if (index >= candidates.length) {
    console.error(
      "❌ No MariaDB/MySQL client on PATH. It ships with the server — look for\n" +
      "   C:\\Program Files\\MariaDB <version>\\bin and add it to PATH."
    );
    process.exit(1);
  }

  const child = spawn(candidates[index], args, {
    stdio: "inherit",
    env: { ...process.env, MYSQL_PWD: DB_PASSWORD ?? "" },
  });

  child.on("error", (err) => {
    if (err.code === "ENOENT") return run(index + 1);
    console.error(`❌ Failed to start ${candidates[index]}:`, err.message);
    process.exit(1);
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

run(0);

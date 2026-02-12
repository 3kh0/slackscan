import chalk from "chalk";

const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

function ts() {
  return new Date().toISOString();
}

let reqCounter = 0;

const log = {
  error: (msg) => {
    console.error(chalk.red(`[ERROR] [${ts()}] ${msg}`));
  },

  warn: (msg) => {
    console.warn(chalk.yellow(`[WARN] [${ts()}] ${msg}`));
  },

  info: (msg) => {
    console.log(chalk.blue(`[INFO] [${ts()}] ${msg}`));
  },

  success: (msg) => {
    console.log(chalk.green(`[DONE] [${ts()}] ${msg}`));
  },

  db: (msg) => {
    console.log(chalk.magenta(`[DB] [${ts()}] ${msg}`));
  },

  debug: (msg) => {
    if (DEBUG) console.log(chalk.gray(`[DEBUG] [${ts()}] ${msg}`));
  },

  log: (msg) => {
    console.log(msg);
  },

  reqId: () => {
    return `req-${++reqCounter}-${Date.now().toString(36)}`;
  },
};

export default log;

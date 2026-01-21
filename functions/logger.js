import chalk from "chalk";

const log = {
  error: (msg) => {
    console.error(chalk.red(`[ERROR] ${msg}`));
  },

  warn: (msg) => {
    console.warn(chalk.yellow(`[WARN] ${msg}`));
  },

  info: (msg) => {
    console.log(chalk.blue(`[INFO] ${msg}`));
  },

  success: (msg) => {
    console.log(chalk.green(`[DONE] ${msg}`));
  },

  db: (msg) => {
    console.log(chalk.magenta(`[DB] ${msg}`));
  },

  log: (msg) => {
    console.log(msg);
  },
};

export default log;

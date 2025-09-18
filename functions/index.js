const utils = require("./utils");
const response = require("./response");
const user = require("./user");
const command = require("./command");
const db = require("./db");
const channel = require("./channel");

module.exports = {
  ...utils,
  ...response,
  ...user,
  ...command,
  ...db,
  ...channel,
};
// damn this is so fucking fancy

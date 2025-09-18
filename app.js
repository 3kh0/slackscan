const { App } = require("@slack/bolt");
require("dotenv").config();
const cron = require("node-cron");

const { getId, runChannelIndexing } = require("./functions/utils");
const { getUsr } = require("./functions/user");
const { handle, showHelp } = require("./functions/command");
const { formatErr } = require("./functions/response");
const { testDb, setUserOptOut } = require("./functions/db");
const log = require("./functions/logger");

const app = new App({
  token: process.env.OAUTH_TOKEN,
  signingSecret: process.env.SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SOCKET_TOKEN,
});

app.message(async ({ message, client, say }) => {
  if (message.channel_type !== "im" || message.bot_id) return;

  const text = message.text.trim();
  const userId = message.user;
  if (text === "-h" || text === "--help" || text === "help") {
    await say(showHelp());
    return;
  }

  if (text === "optout") {
    const success = await setUserOptOut(userId, true);
    if (success) {
      await say({
        text: ":okay-1: You are out! Others will not be able to see what public channels you are in.",
      });
    } else {
      await say(
        formatErr(
          ":red-x: Ruh ro, something broke, give it another go?"
        )
      );
    }
    return;
  }

  if (text === "optin") {
    const success = await setUserOptOut(userId, false);
    if (success) {
      await say({
        text: ":okay-1: Your back in! Others will be able to see what public channels you are in.",
      });
    } else {
      await say(
        formatErr(
          ":red-x: Ruh ro, something broke, give it another go?"
        )
      );
    }
    return;
  }

  const parts = text.split(" ");
  let targetUserId = null;
  let showChannelsOnly = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === "-c" || part === "--channels") {
      showChannelsOnly = true;
      continue;
    }

    if (!targetUserId) {
      targetUserId = getId(part);
    }
  }

  if (!targetUserId) return;

  const response = await getUsr(targetUserId, client, showChannelsOnly);
  await say(response);
});

app.command("/scan", async ({ command, ack, respond, client }) => {
  await ack();
  try {
    const response = await handle(command, client);
    await respond(response);
  } catch (error) {
    log.error(`Error: ${error.message}`);
    await respond(formatErr(":red-x: Ruh ro, something broke, give it another go?"));
  }
});

(async () => {
  const check = await testDb();
  if (!check) {
    log.error("dude where's my database");
    process.exit(1);
  }

  await app.start(3000);
  log.success("we are so back, and on port 3000");

  cron.schedule("0 */6 * * *", async () => {
    try {
      log.info(
        `channel gobble started at ${new Date().toLocaleString()}`
      );
      const result = await runChannelIndexing();
      if (result.success) {
        log.success(`channel gobble completed: ${result.message}`);
      } else {
        log.error(`channel gobble failed: ${result.message}`);
      }
    } catch (error) {
      log.error(`error during channel gobble: ${error.message}`);
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      log.info(`hourly channel gobble started ${new Date().toLocaleString()}`);
      const { scan } = require("./scripts/scan");
      const result = await scan();
      if (result && result.success) {
        const successCount = result.successes || 0;
        const totalCount = result.channelsScanned || 0;
        const skippedCount = result.skipped || 0;

        let message = `channel gobble done, scanned ${successCount} channels out of ${totalCount} that needed update`;
        if (skippedCount > 0) {
          message += ` (${skippedCount} skipped)`;
        }
        log.success(message);
      } else {
        log.error("channel gobble failed");
      }
    } catch (error) {
      log.error(`error during hourly channel gobble: ${error.message}`);
    }
  });
})();

import { App } from "@slack/bolt";
import "dotenv/config";
import cron from "node-cron";

import { getId, runChannelIndexing } from "./functions/utils.js";
import { getUsr } from "./functions/user.js";
import { handle, showHelp } from "./functions/command.js";
import { formatErr } from "./functions/response.js";
import { testDb, setUserOptOut } from "./functions/db.js";
import log from "./functions/logger.js";

const app = new App({
  token: process.env.OAUTH_TOKEN,
  signingSecret: process.env.SIGNING_SECRET,
  port: 3000,
});

app.message(async ({ message, client, say }) => {
  const reqId = log.reqId();
  const startTime = Date.now();
  try {
    const messageTs = parseFloat(message.ts) * 1000;
    if (message.channel_type !== "im" || message.bot_id || !message.text) {
      log.debug(`[${reqId}] dm ignored: channel_type=${message.channel_type}, bot_id=${message.bot_id || "none"}, text=${!!message.text}`);
      return;
    }

    const text = message.text.trim();
    const userId = message.user;
    log.info(`[${reqId}] dm received from user=${userId}, text="${text}"`);

    if (text === "-h" || text === "--help" || text === "help") {
      log.debug(`[${reqId}] sending help response`);
      await say(showHelp());
      return;
    }

    if (text === "optout") {
      const success = await setUserOptOut(userId, true);
      if (success) {
        log.debug(`[${reqId}] sending optout success response`);
        await say({
          text: ":okay-1: You are out! Others will not be able to see what public channels you are in.",
        });
      } else {
        log.debug(`[${reqId}] sending optout failure response`);
        await say(formatErr(":red-x: Ruh ro, something broke, give it another go?"));
      }
      return;
    }

    if (text === "optin") {
      const success = await setUserOptOut(userId, false);
      if (success) {
        log.debug(`[${reqId}] sending optin success response`);
        await say({
          text: ":okay-1: Your back in! Others will be able to see what public channels you are in.",
        });
      } else {
        log.debug(`[${reqId}] sending optin failure response`);
        await say(formatErr(":red-x: Ruh ro, something broke, give it another go?"));
      }
      return;
    }

    const parts = text.split(" ");
    let targetUserId = null;
    let showChannelsOnly = false;

    for (const part of parts) {
      if (part === "-c" || part === "--channels") {
        showChannelsOnly = true;
        continue;
      }
      if (!targetUserId) {
        targetUserId = getId(part);
      }
    }

    if (!targetUserId) {
      log.debug(`[${reqId}] dm ignored: no targetUserId parsed from text="${text}"`);
      return;
    }

    const response = await getUsr(targetUserId, client, showChannelsOnly, messageTs);
    log.debug(`[${reqId}] sending scan response for target=${targetUserId}`);
    await say(response);
  } catch (error) {
    log.error(`[${reqId}] dm err: ${error.message} (user: ${message.user}, subtype: ${message.subtype || "none"})`);
  } finally {
    log.debug(`[${reqId}] dm handler completed in ${Date.now() - startTime}ms`);
  }
});

// #what-is-my-slack-id
app.message(async ({ message, client }) => {
  if (message.channel !== "C0159TSJVH8" || message.bot_id || message.thread_ts) return;
  const reqId = log.reqId();
  const startTime = Date.now();
  const messageTs = parseFloat(message.ts) * 1000;

  try {
    const text = message.text?.trim();
    log.info(`[${reqId}] #what-is-my-slack-id message from user=${message.user}, text="${text}"`);

    const userId = text?.match(/^<@([A-Z0-9]+)>$|^(U[A-Z0-9]{8,})$/);
    const channelId = text?.match(/^<#(C[A-Z0-9]+)(?:\|[^>]*)?>$|^(C[A-Z0-9]{8,})$/);
    const groupId = text?.match(/^<!subteam\^(S[A-Z0-9]+)(?:\|[^>]*)?>$|^(S[A-Z0-9]{8,})$/);
    const x = userId ? (userId[1] || userId[2]) : null;
    const ugid = groupId ? (groupId[1] || groupId[2]) : null;

    if (ugid) {
      const groups = await client.usergroups.list();
      const group = groups.usergroups?.find(g => g.id === ugid);
      log.debug(`[${reqId}] sending user group id reply for ugid=${ugid}`);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: ugid,
      });
      if (group) {
        log.debug(`[${reqId}] sending user group details for ${group.name}`);
        await client.chat.postMessage({
          channel: message.channel,
          thread_ts: message.ts,
          text: `User group: *${group.name}* (\`${group.handle}\`)\nID: \`${ugid}\``,
        });
      } else {
        log.debug(`[${reqId}] sending user group not found reply for ugid=${ugid}`);
        await client.chat.postMessage({
          channel: message.channel,
          thread_ts: message.ts,
          text: `User group ID: \`${ugid}\` (group not found)`,
        });
      }
    } else if (channelId) {
      const cid = channelId[1] || channelId[2];
      log.debug(`[${reqId}] sending channel id reply for cid=${cid}`);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: cid,
      });
      log.debug(`[${reqId}] sending channel link reply for cid=${cid}`);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: `<#${cid}>`,
      });
    } else {
      let response;
      const targetId = x || message.user;
      if (x) {
        response = await getUsr(x, client, false, messageTs);
      }
      if (!response?.blocks) {
        response = await getUsr(message.user, client, false, messageTs);
      }
      if (response?.blocks) {
        log.debug(`[${reqId}] sending user lookup reply for targetId=${targetId}`);
        await client.chat.postMessage({
          channel: message.channel,
          thread_ts: message.ts,
          text: targetId,
        });
        log.debug(`[${reqId}] sending user details reply for targetId=${targetId}`);
        await client.chat.postMessage({
          channel: message.channel,
          thread_ts: message.ts,
          ...response,
        });
      }
    }
  } catch (error) {
    log.error(`[${reqId}] Error replying with Slack ID: ${error.message}`);
  } finally {
    log.debug(`[${reqId}] #what-is-my-slack-id handler completed in ${Date.now() - startTime}ms`);
  }
});

app.command("/scan", async ({ command, ack, respond, client }) => {
  const reqId = log.reqId();
  const startTs = Date.now();
  log.info(`[${reqId}] /scan command from user=${command.user_id}, text="${command.text}", channel=${command.channel_id}`);
  await ack();
  try {
    const response = await handle(command, client, startTs);
    log.debug(`[${reqId}] sending /scan response`);
    await respond(response);
  } catch (error) {
    log.error(`[${reqId}] /scan error: ${error.message}`);
    await respond(formatErr(":red-x: Ruh ro, something broke, give it another go?"));
  } finally {
    log.debug(`[${reqId}] /scan handler completed in ${Date.now() - startTs}ms`);
  }
});

process.on("unhandledRejection", (reason) => {
  log.error(`unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : reason}`);
});

process.on("uncaughtException", (error) => {
  log.error(`uncaught exception: ${error.stack || error.message}`);
  process.exit(1);
});

(async () => {
  log.info(`starting slackscan | node=${process.version} | platform=${process.platform} | arch=${process.arch} | env=${process.env.NODE_ENV || "development"} | pid=${process.pid}`);

  const check = await testDb();
  if (!check) {
    log.error("dude where's my database");
    process.exit(1);
  }

  await app.start();
  log.success("we are so back, and on port 3000");

  app.receiver.app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

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
      const { scan } = await import("./scripts/scan.js");
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

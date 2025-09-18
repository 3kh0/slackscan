#!/usr/bin/env node

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { WebClient } = require("@slack/web-api");
const {
  listAll,
  markScanned,
  markUpdated,
  getTime,
  testDb,
  listOldest,
  markChannelDeleted,
} = require("../functions/db");
const { scanMembers } = require("../functions/channel");
const log = require("../functions/logger");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BATCH_SIZE = 100;

async function scanBatch(client) {
  const toScan = await listOldest(BATCH_SIZE);

  if (toScan.length === 0) {
    log.success("Already all up to date!");
    return { success: true, count: 0, hasMore: false };
  }

  let ok = 0;
  let errs = 0;
  let skipped = 0;
  let ltd = 0;
  let total = toScan.length;
  let done = 0;

  for (const ch of toScan) {
    done++;
    try {
      const result = await scanMembers(ch.channel_id, client);
      if (result.success) {
        log.success(
          `[${done}/${total}] Scanned ${ch.channel_name} (${ch.channel_id}) and found ${result.count} users`
        );
        await markScanned(ch.channel_id);
        await markUpdated(ch.channel_id);
        ok++;
      } else if (result.error && result.error.includes("rate_limited")) {
        log.warn(
          `[${done}/${total}] Rate limited on ${ch.channel_name} (${ch.channel_id}) waiting 2 mins`
        );
        ltd++;
        await sleep(120000);
        const retry = await scanMembers(ch.channel_id, client);
        if (retry.success) {
          log.success(
            `[${done}/${total}] Retried ${ch.channel_name} (${ch.channel_id}) and found ${retry.count} users`
          );
          await markScanned(ch.channel_id);
          await markUpdated(ch.channel_id);
          ok++;
        } else {
          const retryErrorMsg = retry.error || "Unknown error";
          if (retry.skippable && retry.error === "channel_not_found") {
            log.warn(
              `[${done}/${total}] Marking ${ch.channel_name} (${ch.channel_id}) as deleted`
            );
            await markChannelDeleted(ch.channel_id);
            skipped++;
          } else if (
            retry.error &&
            retry.error === "No members found in channel"
          ) {
            log.warn(
              `[${done}/${total}] Marking ${ch.channel_name} (${ch.channel_id}) as private (archived/no members)`
            );
            await markChannelDeleted(ch.channel_id);
            skipped++;
          } else if (retry.skippable) {
            log.warn(
              `[${done}/${total}] Skipping ${ch.channel_name} (${ch.channel_id}): ${retryErrorMsg}`
            );
            skipped++;
          } else {
            log.error(
              `[${done}/${total}] Retry failed for ${ch.channel_name} (${ch.channel_id}): ${retryErrorMsg}`
            );
            errs++;
          }
        }
      } else {
        const errorMsg = result.error || "Unknown error";
        if (result.error && result.error === "No members found in channel") {
          log.warn(
            `[${done}/${total}] Marking ${ch.channel_name} (${ch.channel_id}) as private (archived/no members)`
          );
          await markChannelDeleted(ch.channel_id);
          skipped++;
        } else if (result.skippable && result.error === "channel_not_found") {
          log.warn(
            `[${done}/${total}] Marking ${ch.channel_name} (${ch.channel_id}) as deleted`
          );
          await markChannelDeleted(ch.channel_id);
          skipped++;
        } else if (result.skippable) {
          log.warn(
            `[${done}/${total}] Skipping ${ch.channel_name} (${ch.channel_id}): ${errorMsg}`
          );
          skipped++;
        } else {
          log.error(
            `[${done}/${total}] Failed to scan ${ch.channel_name} (${ch.channel_id}): ${errorMsg}`
          );
          errs++;
        }
      }
    } catch (error) {
      log.error(
        `[${done}/${total}] Error scanning ${ch.channel_name} (${ch.channel_id}): ${error.message}`
      );
      errs++;
    }
  }

  log.success(`Batch completed! Scanned ${ok} out of ${total} channels`);

  if (errs > 0) {
    log.warn(`Found ${errs} errors`);
  }
  if (skipped > 0) {
    log.info(`Skipped ${skipped} channels (deleted/archived)`);
  }
  if (ltd > 0) {
    log.info(`Rate limited ${ltd} times`);
  }

  const allChans = await listAll();
  const now = getTime();
  const cutoff = now - 3600;
  const left = allChans.filter(
    (ch) => !ch.last_members_update || ch.last_members_update < cutoff
  ).length;

  const hasMore = left > total;

  return {
    success: true,
    channelsScanned: total,
    successes: ok,
    errors: errs,
    skipped: skipped,
    hasMore,
    remainingToScan: left - total,
  };
}

async function scan() {
  const check = await testDb();
  if (!check) {
    log.error("Can't connect to DB, is it running?");
    process.exit(1);
  }

  const token = process.env.OAUTH_TOKEN;
  if (!token) {
    log.error("OAUTH_TOKEN not found in .env");
    process.exit(1);
  }

  const client = new WebClient(token);
  const chans = await listAll();

  if (chans.length === 0) {
    log.error("No channels found, please index channels first");
    process.exit(1);
  }

  let res;
  let batchNum = 1;
  let totScanned = 0;
  let totOk = 0;
  let totErr = 0;
  let totSkipped = 0;

  do {
    log.info(`Starting batch #${batchNum}...`);
    res = await scanBatch(client);

    if (res.success) {
      totScanned += res.channelsScanned || 0;
      totOk += res.successes || 0;
      totErr += res.errors || 0;
      totSkipped += res.skipped || 0;

      if (res.hasMore) {
        log.info(
          `${res.remainingToScan} more channels need scanning, continuing with next batch...`
        );
        await sleep(10000);
      }
    }

    batchNum++;
  } while (res.hasMore);

  return {
    success: true,
    totalChannels: chans.length,
    channelsScanned: totScanned,
    successes: totOk,
    errors: totErr,
    skipped: totSkipped,
  };
}

module.exports = { scan };

if (require.main === module) {
  scan()
    .then((result) => {
      if (result && result.successes > 0) {
        const successMsg = `Total: scanned ${
          result.successes || 0
        } channels out of ${result.channelsScanned || 0} that needed update`;
        const extraInfo = [];
        if (result.skipped > 0) extraInfo.push(`${result.skipped} skipped`);
        if (result.errors > 0) extraInfo.push(`${result.errors} errors`);

        log.success(
          successMsg +
            (extraInfo.length > 0 ? ` (${extraInfo.join(", ")})` : "")
        );
      } else {
        log.success("no updates needed, good job");
      }
      process.exit(0);
    })
    .catch((err) => {
      log.error(`Error: ${err.message}`);
      process.exit(1);
    });
}

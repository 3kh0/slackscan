import "dotenv/config";
import pgPromise from "pg-promise";
import { WebClient } from "@slack/web-api";
import log from "../functions/logger.js";

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

const token = process.env.OAUTH_TOKEN;
if (!token) {
  log.error("where's the OAUTH_TOKEN");
  process.exit(1);
}

const client = new WebClient(token);

async function fetchValidChannelIds() {
  log.info("fetching current channels from slack...");
  const validIds = new Set();
  let cursor;
  let page = 0;

  do {
    page++;
    const resp = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 1000,
      cursor,
    });
    resp.channels.forEach((ch) => validIds.add(ch.id));
    cursor = resp.response_metadata?.next_cursor;
    log.info(`  page ${page}: fetched ${resp.channels.length} channels (total: ${validIds.size})`);
  } while (cursor);

  log.success(`found ${validIds.size} valid channels in slack`);
  return validIds;
}

async function purgeStaleData() {
  const startTime = Date.now();

  const validChannelIds = await fetchValidChannelIds();

  // get all channels from db
  log.info("loading channels from database...");
  const dbChannels = await db.manyOrNone("SELECT channel_id, channel_name FROM channels");
  const dbChannelIds = dbChannels.map((c) => c.channel_id);
  log.info(`  found ${dbChannelIds.length} channels in database`);

  // find stale channels
  const staleChannelIds = dbChannelIds.filter((id) => !validChannelIds.has(id));
  const staleChannels = dbChannels.filter((c) => !validChannelIds.has(c.channel_id));
  
  if (staleChannelIds.length > 0) {
    log.warn(`found ${staleChannelIds.length} stale channels to remove:`);
    staleChannels.slice(0, 20).forEach((ch) => {
      log.info(`  - ${ch.channel_name} (${ch.channel_id})`);
    });
    if (staleChannels.length > 20) {
      log.info(`  ... and ${staleChannels.length - 20} more`);
    }

    // delete stale channels
    log.info("deleting stale channels...");
    await db.none("DELETE FROM channels WHERE channel_id = ANY($1)", [
      staleChannelIds,
    ]);
    log.success(`deleted ${staleChannelIds.length} stale channels`);
  } else {
    log.success("no stale channels found");
  }

  // clean up user channel references using simple batched pagination
  log.info("cleaning up stale user channel references...");

  let usersUpdated = 0;
  let refsRemoved = 0;
  let totalProcessed = 0;
  let lastUid = '';
  const BATCH_SIZE = 500;

  while (true) {
    const batchStart = Date.now();
    
    // simple paginated fetch - no expensive jsonb operations in query
    const users = await db.manyOrNone(`
      SELECT slack_uid, channels
      FROM users
      WHERE slack_uid > $1
      ORDER BY slack_uid
      LIMIT $2
    `, [lastUid, BATCH_SIZE]);

    if (users.length === 0) break;

    lastUid = users[users.length - 1].slack_uid;
    totalProcessed += users.length;

    // collect updates to batch them
    const updates = [];
    for (const user of users) {
      if (!Array.isArray(user.channels) || user.channels.length === 0) continue;

      const originalCount = user.channels.length;
      const filtered = user.channels.filter(
        (ch) => Array.isArray(ch) && ch.length === 2 && validChannelIds.has(ch[0])
      );

      if (filtered.length !== originalCount) {
        updates.push({ uid: user.slack_uid, channels: filtered, removed: originalCount - filtered.length });
      }
    }

    // batch update using a transaction
    if (updates.length > 0) {
      await db.tx(async (t) => {
        for (const u of updates) {
          await t.none(
            "UPDATE users SET channels = $1::jsonb WHERE slack_uid = $2",
            [JSON.stringify(u.channels), u.uid]
          );
        }
      });
      usersUpdated += updates.length;
      refsRemoved += updates.reduce((sum, u) => sum + u.removed, 0);
    }

    const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);
    log.info(`  processed ${totalProcessed} users, ${usersUpdated} updated, ${refsRemoved} refs removed (${batchTime}s)`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.success(`purge complete in ${elapsed}s`);
  log.info(`  channels removed: ${staleChannelIds.length}`);
  log.info(`  users updated: ${usersUpdated}`);
  log.info(`  stale refs removed: ${refsRemoved}`);

  return {
    channelsRemoved: staleChannelIds.length,
    usersUpdated,
    refsRemoved,
  };
}

async function purgeAndReindex() {
  const { testDb } = await import("../functions/db.js");
  const { indexChannels } = await import("./channel_index.js");
  const overallStart = Date.now();

  const dbOk = await testDb();
  if (!dbOk) {
    log.error("can't connect to db");
    process.exit(1);
  }

  log.info("");
  log.info("╔════════════════════════════════════╗");
  log.info("║         PURGE PHASE                ║");
  log.info("╚════════════════════════════════════╝");
  const purgeResult = await purgeStaleData();

  log.info("");
  log.info("╔════════════════════════════════════╗");
  log.info("║        REINDEX PHASE               ║");
  log.info("╚════════════════════════════════════╝");
  await indexChannels();

  const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);
  log.info("");
  log.info("╔════════════════════════════════════╗");
  log.info("║           SUMMARY                  ║");
  log.info("╚════════════════════════════════════╝");
  log.success(`total time: ${totalElapsed}s`);
  log.info(`  stale channels purged: ${purgeResult.channelsRemoved}`);
  log.info(`  users cleaned: ${purgeResult.usersUpdated}`);
  log.info(`  stale refs removed: ${purgeResult.refsRemoved}`);
}

export { purgeStaleData, purgeAndReindex };

if (import.meta.main) {
  purgeAndReindex()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(`failed: ${err.message}`);
      process.exit(1);
    });
}

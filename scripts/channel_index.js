const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { WebClient } = require("@slack/web-api");
const { addChannel, testDb } = require("../functions/db");
const log = require("../functions/logger");

const token = process.env.OAUTH_TOKEN;
if (!token) {
  log.error("where's the OAUTH_TOKEN ");
  process.exit(1);
}

const client = new WebClient(token);

async function fetchChannels() {
  log.info("yoinking all channels...");

  let chs = [];
  let cursor;

  try {
    do {
      const resp = await client.conversations.list({
        types: "public_channel",
        exclude_archived: true,
        limit: 1000,
        cursor,
      });

      chs = chs.concat(resp.channels);
      cursor = resp.response_metadata?.next_cursor;
    } while (cursor);

    cursor = undefined;
    do {
      const resp = await client.conversations.list({
        types: "private_channel",
        exclude_archived: true,
        limit: 1000,
        cursor,
      });

      const pvt = resp.channels.map((ch) => ({
        ...ch,
        is_private: true,
      }));

      chs = chs.concat(pvt);
      cursor = resp.response_metadata?.next_cursor;
    } while (cursor);

    log.info(`yoinked ${chs.length} channels total`);
    return chs;
  } catch (err) {
    log.error(`error yoinking channels: ${err.message}`);
    return [];
  }
}

async function indexChannels() {
  const startTime = Date.now();

  const dbOk = await testDb();
  if (!dbOk) {
    log.error("Can't connect to DB, is it running?");
    process.exit(1);
  }

  const chs = await fetchChannels();

  if (chs.length === 0) {
    log.error("No channels found or error occurred");
    process.exit(1);
  }

  log.info(`Adding ${chs.length} channels to index...`);

  let ok = 0;
  let errs = 0;
  const BATCH = 50;
  let batchTimes = [];

  for (let i = 0; i < chs.length; i += BATCH) {
    const batchStartTime = Date.now();
    const batch = chs.slice(i, i + BATCH);

    for (const ch of batch) {
      try {
        const success = await addChannel(
          ch.id,
          ch.name,
          ch.is_private || false
        );

        if (success) {
          ok++;
          process.stdout.write(".");
          if (ok % 50 === 0) {
            process.stdout.write(`${ok}\n`);
          }
        } else {
          errs++;
          process.stdout.write("x");
        }
      } catch (err) {
        log.error(`Error adding channel ${ch.id} to index: ${err.message}`);
        errs++;
      }
    }

    const batchTime = Date.now() - batchStartTime;
    batchTimes.push(batchTime);
  }

  const totalTime = Date.now() - startTime;
  const avgBatchTime =
    batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;

  process.stdout.write("\n");
  log.success(`Done! Added ${ok} channels to index`);
  if (errs > 0) {
    log.warn(`There were ${errs} errors`);
  }

  log.info(
    `Total: ${(totalTime / 1000).toFixed(
      1
    )} seconds. Per batch: ${avgBatchTime.toFixed(1)} ms`
  );

  return {
    success: true,
    count: ok,
    errors: errs,
    timing: {
      total: totalTime,
      avgBatch: avgBatchTime,
    },
  };
}

module.exports = {
  indexChannels,
  fetchChannels,
};

if (require.main === module) {
  indexChannels()
    .then(() => {
      log.success("victory royale");
      process.exit(0);
    })
    .catch((err) => {
      log.error(`fuck: ${err.message}`);
      process.exit(1);
    });
}

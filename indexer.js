import "dotenv/config";
import cron from "node-cron";
import http from "node:http";

import { testDb } from "./functions/db.js";
import { runChannelIndexing } from "./functions/utils.js";
import log from "./functions/logger.js";

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "indexer",
        uptime: process.uptime(),
      })
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

process.on("unhandledRejection", (reason) => {
  log.error(
    `unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : reason}`
  );
});

process.on("uncaughtException", (error) => {
  log.error(`uncaught exception: ${error.stack || error.message}`);
  process.exit(1);
});

(async () => {
  log.info(
    `starting slackscan indexer | node=${process.version} | platform=${process.platform} | arch=${process.arch} | pid=${process.pid}`
  );

  const check = await testDb();
  if (!check) {
    log.error("dude where's my database");
    process.exit(1);
  }

  server.listen(PORT, () => {
    log.success(`indexer is locked in on port ${PORT}`);
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
      log.info(
        `hourly channel gobble started ${new Date().toLocaleString()}`
      );
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

import {
  formatUsr,
  formatErr,
  formatChsOnly,
  formatOut,
} from "./response.js";
import { getUserData } from "./db.js";
import log from "./logger.js";

export async function check(userId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  
  try {
    const response = await fetch(
      `https://identity.hackclub.com/api/external/check?slack_id=${userId}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await response.json();
    return data.result || "unknown";
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      log.warn(`hca timeout for ${userId}`);
    } else {
      log.error(`epic hca fail ${err.message}`);
    }
    return null;
  }
}

export async function getUsr(id, client, channelsOnly = false, messageTs = null) {
  const start = messageTs || Date.now();

  try {
    const [res, userData, hcaStatus] = await Promise.all([
      client.users.info({ user: id }),
      getUserData(id),
      check(id),
    ]);

    const { channels, optedOut } = userData;

    if (optedOut) {
      return formatOut(res.user, start, hcaStatus);
    }

    if (channelsOnly) {
      return formatChsOnly(res.user, channels, start, hcaStatus);
    } else {
      return formatUsr(res.user, channels, start, hcaStatus);
    }
  } catch (err) {
    log.error(`fail on return ${err.message}`);
    return formatErr(
      "Sorry, I couldn't find that user. Check the ID or mention."
    );
  }
}

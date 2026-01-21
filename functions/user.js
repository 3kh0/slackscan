import {
  formatUsr,
  formatErr,
  formatChsOnly,
  formatOut,
} from "./response.js";
import { getCh, getUserOptOutStatus } from "./db.js";
import log from "./logger.js";

export async function check(userId) {
  try {
    const response = await fetch(`https://identity.hackclub.com/api/external/check?slack_id=${userId}`);
    const data = await response.json();
    return data.result || "unknown";
  } catch (err) {
    log.error(`epic hca fail ${err.message}`);
    return "unknown";
  }
}

export async function getUsr(id, client, channelsOnly = false, messageTs = null) {
  const start = messageTs || Date.now();

  try {
    const [res, isOptedOut, hcaStatus, channels] = await Promise.all([
      client.users.info({ user: id }),
      getUserOptOutStatus(id),
      check(id),
      getCh(id),
    ]);

    if (isOptedOut) {
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

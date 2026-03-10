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
  log.debug(`starting hca check for ${userId}`);
  const hcaStart = Date.now();
  
  try {
    const response = await fetch(
      `https://identity.hackclub.com/api/external/check?slack_id=${userId}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await response.json();
    const status = data.result || "unknown";
    log.debug(`hca check for ${userId}: status=${status} (${Date.now() - hcaStart}ms)`);
    return status;
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

export async function checkTrust(userId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  log.debug(`starting trust check for ${userId}`);
  const start = Date.now();

  try {
    const response = await fetch(
      `https://hackatime.hackclub.com/api/v1/users/${userId}/trust_factor`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    log.debug(`trust check for ${userId}: level=${data.trust_level} value=${data.trust_value} (${Date.now() - start}ms)`);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      log.warn(`trust timeout for ${userId}`);
    } else {
      log.error(`trust check fail ${err.message}`);
    }
    return null;
  }
}

export async function getUsr(id, client, channelsOnly = false, messageTs = null) {
  const receiveTime = Date.now();
  const slackDelay = messageTs ? receiveTime - messageTs : null;
  log.info(`lookup start user=${id} channelsOnly=${channelsOnly}`);

  try {
    const timeout = (ms, label) => new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    );

    const [res, userData, hcaStatus, trustData] = await Promise.all([
      Promise.race([client.users.info({ user: id }), timeout(10000, "users.info")]),
      getUserData(id),
      check(id),
      checkTrust(id),
    ]);

    const { channels, optedOut } = userData;
    log.debug(`lookup data user=${id} channels=${channels?.length ?? 0} optedOut=${optedOut}`);

    if (optedOut) {
      log.info(`lookup done user=${id} (opted out) slack=${slackDelay ?? "?"}ms process=${Date.now() - receiveTime}ms`);
      return formatOut(res.user, receiveTime, slackDelay, hcaStatus, trustData);
    }

    if (channelsOnly) {
      log.info(`lookup done user=${id} (channelsOnly) slack=${slackDelay ?? "?"}ms process=${Date.now() - receiveTime}ms`);
      return formatChsOnly(res.user, channels, receiveTime, slackDelay, hcaStatus, trustData);
    } else {
      log.info(`lookup done user=${id} slack=${slackDelay ?? "?"}ms process=${Date.now() - receiveTime}ms`);
      return formatUsr(res.user, channels, receiveTime, slackDelay, hcaStatus, trustData);
    }
  } catch (err) {
    log.error(`fail on return ${err.message}\n${err.stack}`);
    if (err.message.includes("timed out")) {
      return formatErr(
        ":hourglass: Slack API is busy right now (likely rate limited). Try again in a minute!"
      );
    }
    return formatErr(
      "Sorry, I couldn't find that user. Check the ID or mention."
    );
  }
}

const {
  formatUsr,
  formatErr,
  formatChsOnly,
  formatOut,
} = require("./response");
const { getChRespectingPrivacy, getUserOptOutStatus } = require("./db");
const log = require("./logger");

async function check(userId) {
  try {
    const response = await fetch(`https://identity.hackclub.com/api/external/check?slack_id=${userId}`);
    const data = await response.json();
    return data.result || "unknown";
  } catch (err) {
    log.error(`epic idv fail ${err.message}`);
    return "unknown";
  }
}

async function getUsr(id, client, channelsOnly = false) {
  const start = new Date();

  try {
    const res = await client.users.info({
      user: id,
    });
    const isOptedOut = await getUserOptOutStatus(id);
    const idvStatus = await check(id);

    if (isOptedOut) {
      return formatOut(res.user, start, idvStatus);
    }

    const channels = await getChRespectingPrivacy(id);

    if (channelsOnly) {
      return formatChsOnly(res.user, channels, start, idvStatus);
    } else {
      return formatUsr(res.user, channels, start, idvStatus);
    }
  } catch (err) {
    log.error(`fail on return ${err.message}`);
    return formatErr(
      "Sorry, I couldn't find that user. Check the ID or mention."
    );
  }
}

module.exports = {
  getUsr,
  check,
};

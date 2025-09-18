const pgp = require("pg-promise")();
const log = require("./logger");

const db = pgp(
  process.env.DATABASE_URL ||
    "postgres://slackscan:slackscanpass@localhost:5432/slackscan"
);

async function testDb() {
  try {
    const r = await db.one("SELECT NOW() as time");
    log.db(`tapped in ${r.time}`);
    return true;
  } catch (e) {
    log.error(`db fail ${e.message}`);
    return false;
  }
}

function getTime() {
  return Math.floor(Date.now() / 1000);
}

async function addCh(uid, chId) {
  try {
    const ts = getTime();
    const u = await db.oneOrNone("SELECT * FROM users WHERE slack_uid = $1", [
      uid,
    ]);

    if (u) {
      let existingChannels = [];
      try {
        if (Array.isArray(u.channels)) {
          existingChannels = u.channels.filter(
            (ch) =>
              Array.isArray(ch) && ch.length === 2 && typeof ch[0] === "string"
          );
        }
      } catch (parseErr) {
        log.warn(`Invalid channel data for user ${uid}, resetting channels`);
        existingChannels = [];
      }

      const chMap = new Map(existingChannels);
      chMap.set(chId, ts);
      const updCh = Array.from(chMap.entries());

      if (
        !Array.isArray(updCh) ||
        !updCh.every(
          (ch) =>
            Array.isArray(ch) &&
            ch.length === 2 &&
            typeof ch[0] === "string" &&
            typeof ch[1] === "number"
        )
      ) {
        throw new Error("dude ur data is all fucked up");
      }

      await db.none(
        "UPDATE users SET channels = $1::jsonb WHERE slack_uid = $2",
        [JSON.stringify(updCh), uid]
      );
    } else {
      const chs = [[chId, ts]];
      await db.none(
        "INSERT INTO users (slack_uid, channels) VALUES ($1, $2::jsonb)",
        [uid, JSON.stringify(chs)]
      );
    }
    return true;
  } catch (e) {
    log.error(`cant add ${uid} to channel ${chId}: ${e.message}`);
    return false;
  }
}

async function getCh(uid) {
  try {
    const u = await db.oneOrNone(
      "SELECT channels FROM users WHERE slack_uid = $1",
      [uid]
    );

    if (!u) return [];

    return u.channels.map((ch) => ch[0]);
  } catch (e) {
    log.error(`fail on getting channels for ${uid}: ${e.message}`);
    return [];
  }
}

async function getChRespectingPrivacy(uid) {
  try {
    const isOptedOut = await getUserOptOutStatus(uid);
    if (isOptedOut) {
      return [];
    }
    return await getCh(uid);
  } catch (e) {
    log.error(
      `gdpr complaint ${uid}: ${e.message}`
    );
    return [];
  }
}

async function updateCh(chId, memberIds) {
  try {
    return await db.tx(async (t) => {
      const promises = memberIds.map((uid) => addCh(uid, chId));
      await markScanned(chId);
      await markUpdated(chId);
      return t.batch(promises);
    });
  } catch (e) {
    log.error(`Error updating members for channel ${chId}: ${e.message}`);
    return false;
  }
}

async function addChannel(chId, chName, isPrivate = false) {
  try {
    const ts = getTime();
    await db.none(
      `
      INSERT INTO channels (channel_id, channel_name, last_scanned, last_members_update, is_private)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (channel_id) 
      DO UPDATE SET 
        channel_name = $2,
        is_private = $5
    `,
      [chId, chName, ts, null, isPrivate]
    );
    return true;
  } catch (e) {
    log.error(`fail adding ${chId} to db: ${e.message}`);
    return false;
  }
}

async function markScanned(chId) {
  try {
    const ts = getTime();
    await db.none(
      `
      UPDATE channels 
      SET last_scanned = $1
      WHERE channel_id = $2
    `,
      [ts, chId]
    );
    return true;
  } catch (e) {
    log.error(`fail updating scan time for channel ${chId}: ${e.message}`);
    return false;
  }
}

async function markUpdated(chId) {
  try {
    const ts = getTime();
    await db.none(
      `
      UPDATE channels 
      SET last_members_update = $1
      WHERE channel_id = $2
    `,
      [ts, chId]
    );
    return true;
  } catch (e) {
    log.error(
      `fail updating members update time for channel ${chId}: ${e.message}`
    );
    return false;
  }
}

async function markChannelDeleted(chId) {
  try {
    await db.none(
      `
      UPDATE channels 
      SET last_members_update = $1, is_private = true
      WHERE channel_id = $2
    `,
      [getTime(), chId]
    );
    return true;
  } catch (e) {
    log.error(`Error marking channel ${chId} as deleted: ${e.message}`);
    return false;
  }
}

async function listAll() {
  try {
    return await db.manyOrNone("SELECT * FROM channels ORDER BY last_scanned");
  } catch (e) {
    log.error(`fail getting all channels: ${e.message}`);
    return [];
  }
}

async function listOldest(limit = 100) {
  try {
    const cutoffTime = getTime() - 21600; // 6h
    const recentTime = getTime() - 300; // 5m

    return await db.manyOrNone(
      `
      SELECT * FROM channels 
      WHERE 
        (last_members_update IS NULL OR last_members_update < $2)
        AND NOT (
          last_members_update > $3 AND is_private = true
        )
      ORDER BY last_members_update ASC NULLS FIRST
      LIMIT $1
    `,
      [limit, cutoffTime, recentTime]
    );
  } catch (e) {
    log.error(`fail getting oldest channels for update: ${e.message}`);
    return [];
  }
}

async function setUserOptOut(uid, optedOut = true) {
  try {
    const u = await db.oneOrNone("SELECT * FROM users WHERE slack_uid = $1", [
      uid,
    ]);

    if (u) {
      await db.none("UPDATE users SET opted_out = $1 WHERE slack_uid = $2", [
        optedOut,
        uid,
      ]);
    } else {
      await db.none(
        "INSERT INTO users (slack_uid, channels, opted_out) VALUES ($1, $2::jsonb, $3)",
        [uid, JSON.stringify([]), optedOut]
      );
    }
    return true;
  } catch (e) {
    log.error(`fail setting opt-out status for user ${uid}: ${e.message}`);
    return false;
  }
}

async function getUserOptOutStatus(uid) {
  try {
    const u = await db.oneOrNone(
      "SELECT opted_out FROM users WHERE slack_uid = $1",
      [uid]
    );
    return u ? u.opted_out : false;
  } catch (e) {
    log.error(`fail getting opt-out status for user ${uid}: ${e.message}`);
    return false;
  }
}

module.exports = {
  testDb,
  getTime,
  addCh,
  getCh,
  getChRespectingPrivacy,
  updateCh,
  addChannel,
  markScanned,
  markUpdated,
  listAll,
  listOldest,
  markChannelDeleted,
  setUserOptOut,
  getUserOptOutStatus,
};

const { updateCh, addChannel } = require("./db");
const log = require("./logger");

function getIdFromUrl(url) {
  const match = url.match(/\/archives\/([A-Z0-9]+)/);
  return match ? match[1] : null;
}

async function scanMembers(chId, client) {
  try {
    let name = chId;
    let pvt = false;

    try {
      const info = await client.conversations.info({
        channel: chId,
      });

      if (info.ok && info.channel) {
        name = info.channel.name;
        pvt = info.channel.is_private || false;
        await addChannel(chId, name, pvt);
      }
    } catch (err) {
      if (err.message.includes("channel_not_found")) {
        log.warn(
          `Channel ${chId} not found (possibly deleted or archived), skipping...`
        );
        return {
          success: false,
          error: "channel_not_found",
          skippable: true,
        };
      }
      log.warn(`Could not get channel info for ${chId}: ${err.message}`);
    }

    let members = [];
    let cursor;
    let tries = 0;

    do {
      try {
        const res = await client.conversations.members({
          channel: chId,
          limit: 1000,
          cursor,
        });

        if (!res.ok) {
          if (res.error && res.error.includes("rate_limited")) {
            tries++;
            if (tries >= 3) {
              return {
                success: false,
                error: `Rate limited after 3 attempts`,
              };
            }
            const waitTime = 60;
            log.warn(
              `Rate limited while fetching members for ${name}, waiting ${waitTime} seconds before retry (attempt ${tries}/3)...`
            );
            await new Promise((r) => setTimeout(r, waitTime * 1000));
            continue;
          }

          if (res.error && res.error.includes("channel_not_found")) {
            log.warn(
              `Channel ${chId} not found during member fetch (possibly deleted), skipping...`
            );
            return {
              success: false,
              error: "channel_not_found",
              skippable: true,
            };
          }

          log.error(`Error scanning channel members: ${res.error}`);
          return {
            success: false,
            error: res.error,
          };
        }

        tries = 0;
        members = members.concat(res.members || []);
        cursor = res.response_metadata?.next_cursor;

        if (cursor) {
          log.info(
            `Found ${members.length} members so far in ${name}, getting next page`
          );
        }
      } catch (err) {
        if (err.message.includes("channel_not_found")) {
          log.warn(
            `Channel ${chId} not found during pagination (possibly deleted), skipping...`
          );
          return {
            success: false,
            error: "channel_not_found",
            skippable: true,
          };
        }

        log.error(`Error during pagination for ${chId}: ${err.message}`);
        return {
          success: false,
          error: err.message,
        };
      }
    } while (cursor);

    if (members.length > 0) {
      const chunkSize = 100;
      const chunks = [];

      for (let i = 0; i < members.length; i += chunkSize) {
        chunks.push(members.slice(i, i + chunkSize));
      }

      log.info(
        `Processing ${members.length} members in ${chunks.length} batches for ${name}`
      );

      let success = true;
      let processed = 0;
      for (const chunk of chunks) {
        const result = await updateCh(chId, chunk);
        processed += chunk.length;
        if (!result) {
          success = false;
          log.warn(
            `Failed to update members ${
              processed - chunk.length + 1
            }-${processed} in channel ${name}`
          );
        } else {
          log.info(
            `Successfully updated ${processed}/${
              members.length
            } members in channel ${name} (${Math.round(
              (processed / members.length) * 100
            )}%)`
          );
        }
      }

      return {
        success: success,
        count: members.length,
        partial: !success,
      };
    } else {
      return {
        success: false,
        error: "No members found in channel",
      };
    }
  } catch (err) {
    log.error(`Exception scanning channel members: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}

async function scan(urls, client) {
  const results = {};

  for (const url of urls) {
    const id = getIdFromUrl(url);
    if (id) {
      results[id] = await scanMembers(id, client);
    } else {
      results[url] = {
        success: false,
        error: "Invalid channel URL",
      };
    }
  }

  return results;
}

module.exports = {
  getIdFromUrl,
  scanMembers,
  scan,
};

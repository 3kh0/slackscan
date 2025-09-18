const log = require("./logger");

function formatUsr(user, channels = [], start = null, idvStatus = null) {
  try {
    const executionStart = start || new Date();
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "User found!",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Looking up <@${user.id}>*\n\n*Slack ID: *\`${
            user.id
          }\`\n*Display Name:* ${
            user.profile.display_name || "Not set"
          }\n*Real Name:* ${user.real_name || "Not set"}\n*Username:* ${
            user.name
          }${idvStatus ? `\n*IDV Status:* ${idvStatus}` : ""}`,
        },
        accessory: {
          type: "image",
          image_url: user.profile.image_512,
          alt_text: `${user.real_name || user.name}'s picture`,
        },
      },
    ];

    if (channels && channels.length > 0) {
      const mentions = channels.map((c) => `<#${c}>`);
      let text = `*Channels (${channels.length}):*\n`;
      let truncated = false;
      let included = 0;

      const maxLen = 2800;
      let currLen = text.length;

      for (let i = 0; i < mentions.length; i++) {
        if (currLen + mentions[i].length + 2 > maxLen) {
          truncated = true;
          break;
        }

        text += mentions[i];
        if (i < mentions.length - 1) {
          text += ", ";
          currLen += 2;
        }

        currLen += mentions[i].length;
        included++;
      }

      if (truncated) {
        const remaining = mentions.length - included;
        text += `\n\n_...and ${remaining} more channels (truncated due to size limit)_`;
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: text,
        },
      });

      try {
        const msgSize = JSON.stringify(blocks).length;
        if (msgSize > 3000) {
          const count = channels.length;
          blocks.pop();

          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Channels (${count}):* ${mentions
                .slice(0, 50)
                .join(", ")}${
                count - 50 > 0
                  ? ` _(${count - 50} more channels truncated)_`
                  : ""
              }`,
            },
          });
        }
      } catch (err) {
        log.error(`Error calculating message size: ${err.message}`);
      }
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Channels (0):* No channel data available",
        },
      });
    }

    blocks.push(
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Executed in ${new Date() - executionStart}ms`,
          },
        ],
      }
    );

    return {
      blocks: blocks,
      text: `User information for <@${user.id}>`,
    };
  } catch (err) {
    log.error(`Error formatting user response: ${err.message}`);
    return {
      text: ":red-x: Internal error :(",
    };
  }
}

function formatErr(msg = "An unknown error occurred") {
  return {
    text: msg,
  };
}

function formatChsOnly(user, channels = [], start = null, idvStatus = null) {
  try {
    const executionStart = start || new Date();
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Channels for <@${user.id}> (${user.real_name || user.name})${idvStatus ? ` - IDV: ${idvStatus}` : ""}`,
        },
      },
      {
        type: "divider",
      },
    ];

    if (channels && channels.length > 0) {
      const mentions = channels.map((c) => `<#${c}>`);
      let text = `*Channels (${channels.length}):*\n`;
      let truncated = false;
      let included = 0;

      const maxLen = 2900;
      let currLen = text.length;

      for (let i = 0; i < mentions.length; i++) {
        if (currLen + mentions[i].length + 2 > maxLen) {
          truncated = true;
          break;
        }

        text += mentions[i];
        if (i < mentions.length - 1) {
          text += ", ";
          currLen += 2;
        }

        currLen += mentions[i].length;
        included++;
      }

      if (truncated) {
        const remaining = mentions.length - included;
        text += `\n\n_...and ${remaining} more channels (truncated due to size limit)_`;
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: text,
        },
      });

      try {
        const msgSize = JSON.stringify(blocks).length;
        if (msgSize > 3000) {
          const count = channels.length;
          blocks.pop();

          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Channels (${count}):* ${mentions
                .slice(0, 160)
                .join(", ")}${
                count - 150 > 0
                  ? ` _(${count - 150} more channels truncated)_`
                  : ""
              }`,
            },
          });
        }
      } catch (err) {
        log.error(`Error calculating message size: ${err.message}`);
      }
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Channels (0):* No channel data available",
        },
      });
    }

    blocks.push(
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Executed in ${new Date() - executionStart}ms`,
          },
        ],
      }
    );

    return {
      blocks: blocks,
      text: `Channels for ${user.real_name || user.name}`,
    };
  } catch (err) {
    log.error(`Error formatting channels-only response: ${err.message}`);
    return {
      text: ":red-x: Internal error :(",
    };
  }
}

function formatOut(user, start = null, idvStatus = null) {
  try {
    const executionStart = start || new Date();
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "User found!",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Looking up <@${user.id}>*\n\n*Slack ID: *\`${
            user.id
          }\`\n*Display Name:* ${
            user.profile.display_name || "Not set"
          }\n*Real Name:* ${user.real_name || "Not set"}\n*Username:* ${
            user.name
          }${idvStatus ? `\n*IDV Status:* ${idvStatus}` : ""}`,
        },
        accessory: {
          type: "image",
          image_url: user.profile.image_512,
          alt_text: `${user.real_name || user.name}'s picture`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Channels:* This user has opted to keep this data private",
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Executed in ${new Date() - executionStart}ms`,
          },
        ],
      },
    ];

    return {
      blocks: blocks,
      text: `User information for <@${user.id}> (privacy protected)`,
    };
  } catch (err) {
    log.error(`Error formatting opted-out user response: ${err.message}`);
    return {
      text: ":red-x: Internal error :(",
    };
  }
}

module.exports = {
  formatUsr,
  formatErr,
  formatChsOnly,
  formatOut,
};

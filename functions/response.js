import log from "./logger.js";

function silent(user) {
  const name = user.profile?.display_name || user.real_name || user.name || user.id;
  return `<https://hackclub.enterprise.slack.com/team/${user.id}|@${name}>`;
}

export function formatUsr(user, channels = [], start = null, hcaStatus = null) {
  try {
    const executionStart = start || Date.now();
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
          text: `*Looking up ${silent(user)}*\n\n*Slack ID: *\`${
            user.id
          }\`\n*Display Name:* ${
            user.profile.display_name || "Not set"
          }\n*Real Name:* ${user.real_name || "Not set"}\n*Username:* ${
            user.name
          }${hcaStatus ? `\n*HCA Status:* ${hcaStatus}` : ""}`,
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
      let text = `*Seen in (${channels.length}):*\n_Note: They may have left some channels_\n`;
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
              text: `*Seen in (${count}):* _User may have left some_\n${mentions
                .slice(0, 50)
                .join(", ")}${
                count - 50 > 0
                  ? ` _(${count - 50} more truncated)_`
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
          text: "*Seen in (0):* No channel data available :(",
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
            text: `${Math.round(Date.now() - executionStart)}ms - You can use me via DMs and /scan!`,
          },
        ],
      }
    );

    return {
      blocks: blocks,
      text: `User information for ${silent(user)}`,
    };
  } catch (err) {
    log.error(`Error formatting user response: ${err.message}`);
    return {
      text: ":red-x: Internal error :(",
    };
  }
}

export function formatErr(msg = "An unknown error occurred") {
  return {
    text: msg,
  };
}

export function formatChsOnly(user, channels = [], start = null, hcaStatus = null) {
  try {
    const executionStart = start || Date.now();
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Channels for ${silent(user)} (${user.real_name || user.name})${hcaStatus ? ` - HCA: ${hcaStatus}` : ""}`,
        },
      },
      {
        type: "divider",
      },
    ];

    if (channels && channels.length > 0) {
      const mentions = channels.map((c) => `<#${c}>`);
      let text = `*Seen in (${channels.length}):*\n_Note: They may have left some channels_\n`;
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
              text: `*Seen in (${count}):* _They may have left some channels_\n${mentions
                .slice(0, 160)
                .join(", ")}${
                count - 150 > 0
                  ? ` _(${count - 150} more truncated)_`
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
          text: "*Seen in (0):* No channel data available :(",
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
            text: `Executed in ${Math.round(Date.now() - executionStart)}ms`,
          },
        ],
      }
    );

    return {
      blocks: blocks,
      text: `Seen in ${user.real_name || user.name}`,
    };
  } catch (err) {
    log.error(`Error formatting channels-only response: ${err.message}`);
    return {
      text: ":red-x: Internal error :(",
    };
  }
}

export function formatOut(user, start = null, hcaStatus = null) {
  try {
    const executionStart = start || Date.now();
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
          text: `*Looking up ${silent(user)}*\n\n*Slack ID: *\`${
            user.id
          }\`\n*Display Name:* ${
            user.profile.display_name || "Not set"
          }\n*Real Name:* ${user.real_name || "Not set"}\n*Username:* ${
            user.name
          }${hcaStatus ? `\n*HCA Status:* ${hcaStatus}` : ""}`,
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
          text: "*Seen in:* This user has opted to keep this data private",
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
            text: `Executed in ${Math.round(Date.now() - executionStart)}ms`,
          },
        ],
      },
    ];

    return {
      blocks: blocks,
      text: `User information for ${silent(user)} (privacy protected)`,
    };
  } catch (err) {
    log.error(`Error formatting opted-out user response: ${err.message}`);
    return {
      text: ":red-x: Internal error :(",
    };
  }
}

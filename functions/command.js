import { getId } from "./utils.js";
import { getUsr } from "./user.js";
import { formatErr } from "./response.js";
import { setUserOptOut, getUserOptOutStatus } from "./db.js";
import log from "./logger.js";

function showHelp() {
  return {
    text: "slackscan help",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "SlackScan cmds",
          emoji: true,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "`/scan [@user|UserID]` - get basic user information and some channels",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "`/scan [@user|UserID] -c` - show expanded list of channels for the user",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "`/scan optout` - optout yourself from sharing channel data",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "`/scan optin` - optin yourself to share channel data",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "`/scan -h` - Show this help message",
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
            text: "SlackScan v1.0 - For more information, contact 3kh0\nYou can also directly DM the bot, it will respond with the same commands.",
          },
        ],
      },
    ],
  };
}

export async function handle(cmd, client, startTs = null) {
  const txt = cmd.text.trim();
  const userId = cmd.user_id;
  log.debug(`handle cmd text="${txt}" userId=${userId}`);

  if (txt === "-h" || txt === "--help" || txt === "help") {
    return showHelp();
  }

  if (txt === "optout") {
    const success = await setUserOptOut(userId, true);
    if (success) {
      log.info(`optout success for ${userId}`);
      return {
        text: "✅ Done you party pooper",
        response_type: "ephemeral",
      };
    } else {
      log.info(`optout failed for ${userId}`);
      return formatErr(
        ":red-x: Ruh ro, something broke, give it another go?"
      );
    }
  }

  if (txt === "optin") {
    const success = await setUserOptOut(userId, false);
    if (success) {
      log.info(`optin success for ${userId}`);
      return {
        text: "✅ Done welcome back",
        response_type: "ephemeral",
      };
    } else {
      log.info(`optin failed for ${userId}`);
      return formatErr(
        ":red-x: Ruh ro, something broke, give it another go?"
      );
    }
  }

  if (!txt) {
    return formatErr("Command not found, try running with -h for help");
  }

  const parts = txt.split(" ");
  let targetUserId = null;
  let showChannelsOnly = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === "-c" || part === "--channels") {
      showChannelsOnly = true;
      continue;
    }

    if (!targetUserId) {
      targetUserId = getId(part);
      if (targetUserId) {
        log.debug(`resolved target userId=${targetUserId} from "${part}"`);
        continue;
      }
    }

    if (!part.startsWith("-")) {
      log.warn(`tf is that command ${part}`);
    }
  }

  if (!targetUserId) {
    log.warn(`no target user ID parsed from "${txt}"`);
    return formatErr("Invalid user ID or mention. Try `/scan -h` for help.");
  }

  return await getUsr(targetUserId, client, showChannelsOnly, startTs);
}

export { showHelp };

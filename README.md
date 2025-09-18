# SlackScan

Inspired by the popular bot on Telegram, [TgScan](https://tgdev.io/tgscan/), SlackScan can index channels and their members to provide information about what channels a user is in.

As a Hack Club exclusive, you can also look up a users status in [Identity Vault](https://identity.hackclub.com/faq) if their slack ID is linked to their IDV account.

Using SlackScan is easy as DMing the bot a user mention (if you are in the Hack Club Slack) or using the `/scan` command anywhere in your workspace.

## Features

- Yoinks channels
- Yoinks members in said channels
- If people are schizo about privacy you can opt out
- If you're in Hack Club, you can look up people's IDV status
- Find peoples username which commonly includes part of their real email (not a bug, just a feature)
- Better than stalking people manually

## Setup

Want to stalk people on your own Slack workspace? Here's how to set it up:

1. Clone the code and install packages with `pnpm i`.
2. Get a Slack app with these scopes: `channels:read`, `chat:write`, `commands`, `users:read`, `groups:read`. Make sure it is in Socket Mode.
3. Set up a Postgres database (see the init.sql file for schema)
4. Create a `.env` file by copying `.env.example` and filling it in
5. SlackScan also supports a slash command which you can register `/scan` in your Slack settings. Make sure to tick the "Escape channels, users, and links sent to your app" option and set the usage hint as "[user mention|user id]". Turn on socket mode so you do not need to set up a public URL.
6. Run the app with `pnpm start` and the channel indexing script with `pnpm run index`.
7. Profit???

## Legal mumbo jumbo

Don't use this to be weird, okay? Just don't be a dick and if you get in trouble, fuck around and find out. Don't sue me.

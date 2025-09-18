-- this should setup your db, if it does not work somehow, thug it out or something idk
CREATE TABLE IF NOT EXISTS users (
  slack_uid VARCHAR(20) PRIMARY KEY,
  channels JSONB NOT NULL DEFAULT '[]',
  opted_out BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_users_channels ON users USING GIN (channels);
CREATE INDEX IF NOT EXISTS idx_users_slack_uid ON users (slack_uid);
CREATE INDEX IF NOT EXISTS idx_users_opted_out ON users (opted_out);

CREATE TABLE IF NOT EXISTS channels (
  channel_id VARCHAR(20) PRIMARY KEY,
  channel_name TEXT NOT NULL,
  last_scanned BIGINT NOT NULL,
  last_members_update BIGINT,
  is_private BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_channels_last_scanned ON channels (last_scanned);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels (channel_name);
CREATE INDEX IF NOT EXISTS idx_channels_last_members_update ON channels (last_members_update);

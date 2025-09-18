const log = require("./logger");

function getId(text) {
  if (text.startsWith("<@") && text.endsWith(">")) {
    return text.slice(2, -1).split("|")[0];
  }

  const mention = text.match(/<@([A-Z0-9]+)(?:\|.+)?>/);
  if (mention) {
    return mention[1];
  }

  const id = text.match(/\b([UW][A-Z0-9]{8,})\b/);
  if (id) {
    return id[1];
  }

  return null;
}

async function runChannelIndexing() {
  try {
    const { indexChannels } = require("../scripts/channel_index");
    const startTime = Date.now();
    const result = await indexChannels();
    const duration = Date.now() - startTime;

    return {
      success: result.success,
      count: result.count,
      errors: result.errors,
      message: `Indexed ${result.count} channels in ${duration}ms with ${result.errors} errors`,
    };
  } catch (error) {
    log.error(`Channel indexing failed: ${error.message}`);
    return {
      success: false,
      count: 0,
      errors: 1,
      message: `Channel indexing failed: ${error.message}`,
    };
  }
}

module.exports = {
  getId,
  runChannelIndexing,
};

// The app's collaborators, built from the configuration: the database and
// whichever outside services have keys. Shared by the server and the scripts.

import { createClaude } from './claude.js';
import { loadConfig } from './config.js';
import { migrate, openDatabase } from './db.js';
import { createDipClient } from './dip.js';
import { createVoyageEmbedder } from './embeddings.js';
import { createMailer } from './mail.js';

export async function buildContext(config = loadConfig()) {
  const db = await openDatabase(config);
  await migrate(db);
  return {
    config,
    db,
    fetch: globalThis.fetch,
    claude: createClaude({ apiKey: config.anthropicApiKey, model: config.claudeModel }),
    dip: config.dipApiKey ? createDipClient({ apiKey: config.dipApiKey, baseUrl: config.dipBaseUrl }) : null,
    embedder: createVoyageEmbedder({ apiKey: config.voyageApiKey, model: config.voyageModel }),
    mailer: createMailer(config),
  };
}

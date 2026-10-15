// Demo API entry point (Render web service).
//
//   Start:  node server/index.js        (from the repository root)
//   Local:  node --env-file=server/.env server/index.js
//
// Wires the shared order engine (functions/lib/orderServiceCore.js) to the
// Express transport (./app.js) using Firebase Admin credentials from the
// environment. Order logic is NOT reimplemented here.

'use strict';

const { createApp, parseAllowedOrigins } = require('./app');
const { initFirebaseAdmin } = require('./firebaseAdmin');
const { createOrderService } = require('../functions/lib/orderServiceCore');

function buildServer(env = process.env) {
  const { db, projectId, verifyToken, serverTimestamp } = initFirebaseAdmin(env);

  const orderService = createOrderService({ db, serverTimestamp });

  const app = createApp({
    orderService,
    verifyToken,
    allowedOrigins: parseAllowedOrigins(
      env.CORS_ALLOWED_ORIGINS || env.CORS_ALLOWED_ORIGIN || ''
    ),
    mode: env.DEMO_MODE === 'false' ? 'live' : 'demo',
    projectId,
  });

  return { app, projectId };
}

function start(env = process.env) {
  const { app, projectId } = buildServer(env);
  const port = Number(env.PORT) || 8080;
  const server = app.listen(port, () => {
    console.log(
      `[pizza-demo-api] listening on :${port} (project ${projectId}, mode ${
        env.DEMO_MODE === 'false' ? 'live' : 'demo'
      })`
    );
  });
  return server;
}

if (require.main === module) {
  try {
    start();
  } catch (err) {
    console.error('[pizza-demo-api] failed to start:', err && err.message);
    process.exitCode = 1;
  }
}

module.exports = { buildServer, start };

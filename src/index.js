#!/usr/bin/env node

import TmuxMcpServer from './server.js';

async function main() {
  const server = new TmuxMcpServer();
  await server.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
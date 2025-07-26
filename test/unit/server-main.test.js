import { describe, test, expect, mock } from 'bun:test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../../src/server.js');

describe('server.js main execution', () => {
  test('server module exports default class', async () => {
    const module = await import('../../src/server.js');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });
  
  test('server runs when executed as main module', (done) => {
    // Start server as a child process
    const serverProcess = spawn('bun', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    let errorOutput = '';
    
    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Give it a moment to start
    setTimeout(() => {
      expect(errorOutput).toContain('Tmux MCP Server running on stdio');
      serverProcess.kill();
      done();
    }, 1000);
  });
});
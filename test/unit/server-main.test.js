import { describe, test, expect } from 'bun:test';
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

        const cleanup = () => {
            if(serverProcess && !serverProcess.killed) {
                serverProcess.kill();

                // Wait for process to actually terminate
                const timeoutId = setTimeout(() => {
                    // Force kill if still running after timeout
                    if(!serverProcess.killed) {
                        serverProcess.kill('SIGKILL');
                    }
                    done();
                }, 2000);

                serverProcess.on('close', () => {
                    clearTimeout(timeoutId);
                    done();
                });

                serverProcess.on('error', () => {
                    clearTimeout(timeoutId);
                    done();
                });
            } else {
                done();
                return;
            }
        };

        // Give it a moment to start
        setTimeout(() => {
            try {
                expect(errorOutput).toContain('Tmux MCP Server running on stdio');
                cleanup();
            } catch(error) {
                cleanup();
                throw error;
            }
        }, 1000);
    });
});

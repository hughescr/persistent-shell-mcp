import { spawn } from 'child_process';

class TmuxManager {
    constructor() {
        this.sessionMetadata = new Map();
    }

    async _runTmuxCommand(args, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const process = spawn('tmux', args, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '', stderr = '', timeoutId = null;

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    process.kill('SIGTERM');
                    reject(new Error(`Tmux command timed out after ${timeout}ms: tmux ${args.join(' ')}`));
                }, timeout);
            }

            process.stdout.on('data', (data) => { stdout += data.toString(); });
            process.stderr.on('data', (data) => { stderr += data.toString(); });

            process.on('close', (code) => {
                if (timeoutId) clearTimeout(timeoutId);
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    let errorMsg = `tmux command failed with code ${code}`;
                    if (stderr.includes('no server running') || stderr.includes('no such session')) {
                        errorMsg = `Session not found: ${stderr.trim()}`;
                    } else if (stderr) {
                        errorMsg += `: ${stderr.trim()}`;
                    }
                    const error = new Error(errorMsg);
                    error.code = code;
                    error.stderr = stderr;
                    reject(error);
                }
            });

            process.on('error', (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                if (error.code === 'ENOENT') {
                    error.message = 'tmux command not found. Please install tmux.';
                }
                reject(error);
            });
        });
    }

    async sessionExists(sessionId) {
        try {
            await this._runTmuxCommand(['has-session', '-t', `${sessionId}-MCP`]);
            return true;
        } catch (error) {
            return false;
        }
    }

    async createSession(sessionId = 'default') {
        // If the session doesn't exist, then create it, adding it to the named group
        if(await this.sessionExists(sessionId)) {
            return;
        }
        await this._runTmuxCommand(['new-session', '-d', '-t', sessionId, '-s', `${sessionId}-MCP`]);
        await this._runTmuxCommand(['new-window', '-t', `${sessionId}-MCP`, '-n', 'exec']);
        await this._runTmuxCommand(['new-window', '-t', `${sessionId}-MCP`, '-n', 'ui']);
        
        this.sessionMetadata.set(sessionId, {
            id: sessionId,
            created: Date.now(),
        });
    }

    async destroySession(sessionId) {
        if (!await this.sessionExists(sessionId)) {
            return;
        }
        await this._runTmuxCommand(['kill-window', '-t', `${sessionId}-MCP:ui`]);
        await this._runTmuxCommand(['kill-window', '-t', `${sessionId}-MCP:exec`]);
        await this._runTmuxCommand(['kill-session', '-t' `${sessionId}-MCP`]);
        this.sessionMetadata.delete(sessionId);
    }

    async listSessions() {
        const result = await this._runTmuxCommand(['ls', '-F', '#S']);
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    async interrupt(sessionId, windowName) {
        const target = `${sessionId}-MCP:${windowName}`;
        const args = ['send-keys', '-t', target, 'C-c'];
        return await this._runTmuxCommand(args);
    }
    
    async sendKeys(sessionId, windowName, keys, pressEnter = true) {
        const target = `${sessionId}-MCP:${windowName}`;
        const args = ['send-keys', '-t', target, ...keys];
        if (pressEnter) {
            args.push('C-m');
        }
        return await this._runTmuxCommand(args);
    }

    async capturePane(sessionId, windowName = 'ui') {
        const target = `${sessionId}-MCP:${windowName}`;
        const result = await this._runTmuxCommand(['capture-pane', '-p', '-t', target]);
        return result.stdout;
    }
}

export default TmuxManager;

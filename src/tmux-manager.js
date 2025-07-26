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

    async windowExists(sessionId, windowName) {
        try {
            // Use list-windows to check if window exists
            const result = await this._runTmuxCommand(['list-windows', '-t', `${sessionId}-MCP`, '-F', '#W']);
            const windows = result.stdout.trim().split('\n').filter(Boolean);
            return windows.includes(windowName);
        } catch (error) {
            return false;
        }
    }

    async createSession(sessionId = 'default') {
        // If the session doesn't exist, create it with a main window
        if (await this.sessionExists(sessionId)) {
            return;
        }
        
        // Create session with a main window
        await this._runTmuxCommand(['new-session', '-d', '-s', `${sessionId}-MCP`, '-n', 'main']);
        
        this.sessionMetadata.set(sessionId, {
            id: sessionId,
            created: Date.now(),
            windows: ['main']
        });
    }

    async createWindow(sessionId, windowName) {
        // Ensure session exists
        await this.createSession(sessionId);
        
        // Check if window already exists
        if (await this.windowExists(sessionId, windowName)) {
            return;
        }
        
        // Create new window
        await this._runTmuxCommand(['new-window', '-t', `${sessionId}-MCP`, '-n', windowName]);
        
        // Update metadata
        const metadata = this.sessionMetadata.get(sessionId);
        if (metadata && !metadata.windows.includes(windowName)) {
            metadata.windows.push(windowName);
        }
    }

    async destroySession(sessionId) {
        if (!await this.sessionExists(sessionId)) {
            return;
        }
        await this._runTmuxCommand(['kill-session', '-t', `${sessionId}-MCP`]);
        this.sessionMetadata.delete(sessionId);
    }

    async listSessions() {
        try {
            const result = await this._runTmuxCommand(['ls', '-F', '#S']);
            return result.stdout
                .trim()
                .split('\n')
                .filter(name => name.endsWith('-MCP'))
                .map(name => name.slice(0, -4))
                .filter(Boolean);
        } catch (error) {
            // No sessions
            return [];
        }
    }

    async listWindows(sessionId) {
        try {
            const result = await this._runTmuxCommand(['list-windows', '-t', `${sessionId}-MCP`, '-F', '#W']);
            return result.stdout
                .trim()
                .split('\n')
                .filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    async listWorkspaces() {
        const sessions = await this.listSessions();
        const workspaces = [];
        
        for (const sessionId of sessions) {
            const windows = await this.listWindows(sessionId);
            workspaces.push({
                workspace_id: sessionId,
                windows: windows
            });
        }
        
        return workspaces;
    }

    async sendKeys(sessionId, windowName, keys) {
        // Ensure window exists
        await this.createWindow(sessionId, windowName);
        
        const target = `${sessionId}-MCP:${windowName}`;
        const args = ['send-keys', '-t', target, ...keys];
        return await this._runTmuxCommand(args);
    }

    async capturePane(sessionId, windowName = 'main', lines) {
        // Ensure window exists
        await this.createWindow(sessionId, windowName);
        
        const target = `${sessionId}-MCP:${windowName}`;
        const args = ['capture-pane', '-p', '-t', target];
        
        if (lines !== undefined) {
            // Capture specific number of lines from scrollback
            args.push('-S', `-${lines}`);
        } else {
            // Capture all scrollback
            args.push('-S', '-');
        }
        
        const result = await this._runTmuxCommand(args);
        return result.stdout;
    }
}

export default TmuxManager;
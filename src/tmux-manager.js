import { spawn } from 'child_process';
import _ from 'lodash';

// Constants
const DEFAULT_TMUX_TIMEOUT = 10000; // 10 seconds
const DEFAULT_SCROLLBACK_SIZE = 50000; // 50k lines for new sessions

class TmuxManager {
    constructor() {
        this.sessionMetadata = new Map();
        this.parentSession = null;
        this.parentWindow = null;
        this.isUsingParentSession = false;
        this._detectionPromise = this._detectParentSession();
    }

    async _detectParentSession() {
        // Check if we're running inside a tmux session
        const tmuxEnv = process.env.TMUX;
        const tmuxPane = process.env.TMUX_PANE;

        if(!tmuxEnv || !tmuxPane) {
            // Not running inside tmux
            return;
        }

        try {
            // Get the session and window name for our pane
            const result = await this._runTmuxCommand([
                'list-panes', '-F', '#S #W', '-f', `#{==:#D,${tmuxPane}}`
            ]);

            const output = _.trim(result.stdout);
            if(output) {
                const [session, window] = _.split(output, ' ');
                this.parentSession = session;
                this.parentWindow = window;
                this.isUsingParentSession = true;
                console.error(`Detected parent tmux session: ${session}, window: ${window}`);
            }
        } catch(error) {
            console.error('Failed to detect parent tmux session:', error.message);
        }
    }

    async ensureInitialized() {
        await this._detectionPromise;
    }

    async _runTmuxCommand(args, timeout = DEFAULT_TMUX_TIMEOUT) {
        return new Promise((resolve, reject) => {
            const process = spawn('tmux', args, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '', stderr = '', timeoutId = null;

            if(timeout > 0) {
                timeoutId = setTimeout(() => {
                    process.kill('SIGTERM');
                    reject(new Error(`Tmux command timed out after ${timeout}ms: tmux ${args.join(' ')}`));
                }, timeout);
            }

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if(timeoutId) {
                    clearTimeout(timeoutId);
                }
                if(code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    let errorMsg = `tmux command failed with code ${code}`;
                    if(stderr.includes('no server running') || stderr.includes('no such session')) {
                        errorMsg = `Session not found: ${_.trim(stderr)}`;
                    } else if(stderr) {
                        errorMsg += `: ${_.trim(stderr)}`;
                    }
                    const error = new Error(errorMsg);
                    error.code = code;
                    error.stderr = stderr;
                    reject(error);
                }
            });

            process.on('error', (error) => {
                if(timeoutId) {
                    clearTimeout(timeoutId);
                }
                if(error.code === 'ENOENT') {
                    error.message = 'tmux command not found. Please install tmux.';
                }
                reject(error);
            });
        });
    }

    async sessionExists(sessionId) {
        // If using parent session, only check if the requested session matches
        if(this.isUsingParentSession) {
            return sessionId === 'default' || sessionId === this.parentSession;
        }

        try {
            await this._runTmuxCommand(['has-session', '-t', `${sessionId}-MCP`]);
            return true;
        } catch{
            return false;
        }
    }

    async windowExists(sessionId, windowName) {
        try {
            // Use list-windows to check if window exists
            const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;
            const result = await this._runTmuxCommand(['list-windows', '-t', targetSession, '-F', '#W']);
            const windows = _.compact(_.split(_.trim(result.stdout), '\n'));
            return windows.includes(windowName);
        } catch{
            return false;
        }
    }

    async createSession(sessionId = 'default') {
        // If using parent session, we don't create new sessions
        if(this.isUsingParentSession) {
            return;
        }

        // If the session doesn't exist, create it with a main window
        if(await this.sessionExists(sessionId)) {
            return;
        }

        // Create session with a main window
        await this._runTmuxCommand(['new-session', '-d', '-s', `${sessionId}-MCP`, '-n', 'main']);

        // Set a reasonable default scrollback size (50,000 lines) if current limit is less
        // This ensures adequate scrollback history for debugging and reviewing command output
        try {
            const currentLimit = await this.getScrollbackSize(sessionId);
            if(currentLimit < DEFAULT_SCROLLBACK_SIZE) {
                await this.setScrollbackSize(sessionId, DEFAULT_SCROLLBACK_SIZE);
            }
        } catch(error) {
            // Don't fail workspace creation if setting scrollback fails - just log warning
            console.warn(`Failed to set default scrollback size for session ${sessionId}: ${error.message}`);
        }

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
        if(await this.windowExists(sessionId, windowName)) {
            return;
        }

        // Create new window
        const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;
        await this._runTmuxCommand(['new-window', '-t', targetSession, '-n', windowName]);

        // Update metadata
        if(!this.isUsingParentSession) {
            const metadata = this.sessionMetadata.get(sessionId);
            if(metadata && !metadata.windows.includes(windowName)) {
                metadata.windows.push(windowName);
            }
        }
    }

    async destroySession(sessionId) {
        // Cannot destroy parent session
        if(this.isUsingParentSession) {
            throw new Error('Cannot destroy parent tmux session');
        }

        if(!await this.sessionExists(sessionId)) {
            return;
        }
        await this._runTmuxCommand(['kill-session', '-t', `${sessionId}-MCP`]);
        this.sessionMetadata.delete(sessionId);
    }

    async listSessions() {
        // If using parent session, return only that session
        if(this.isUsingParentSession) {
            return ['default'];
        }

        try {
            const result = await this._runTmuxCommand(['ls', '-F', '#S']);
            return _.chain(result.stdout)
                .trim()
                .split('\n')
                .filter(name => _.endsWith(name, '-MCP'))
                .invokeMap('slice', 0, -4)
                .compact()
                .value();
        } catch{
            // No sessions
            return [];
        }
    }

    async listWindows(sessionId) {
        try {
            const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;
            const result = await this._runTmuxCommand(['list-windows', '-t', targetSession, '-F', '#W']);
            const windows = _.compact(
                _.split(_.trim(result.stdout), '\n')
            );

            // If using parent session, exclude the window we're running in
            if(this.isUsingParentSession && this.parentWindow) {
                return _.filter(windows, w => w !== this.parentWindow);
            }

            return windows;
        } catch{
            return [];
        }
    }

    async listWorkspaces() {
        const sessions = await this.listSessions();
        const workspaces = [];

        for(const sessionId of sessions) {
            const windows = await this.listWindows(sessionId);
            workspaces.push({
                workspace_id: sessionId,
                windows: windows
            });
        }

        return workspaces;
    }

    async sendKeys(sessionId, windowName, keys) {
        // Safety check: don't send to our own window if using parent session
        if(this.isUsingParentSession && windowName === this.parentWindow) {
            throw new Error(`Cannot send keys to own window (${this.parentWindow})`);
        }

        // Ensure window exists
        await this.createWindow(sessionId, windowName);

        const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;
        const target = `${targetSession}:${windowName}`;
        const args = ['send-keys', '-t', target, ...keys];
        return await this._runTmuxCommand(args);
    }

    async capturePane(sessionId, windowName = 'main', lines = undefined) {
        // Safety check: don't capture from our own window if using parent session
        if(this.isUsingParentSession && windowName === this.parentWindow) {
            throw new Error(`Cannot capture from own window (${this.parentWindow})`);
        }

        // Ensure window exists
        await this.createWindow(sessionId, windowName);

        const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;
        const target = `${targetSession}:${windowName}`;
        const args = ['capture-pane', '-p', '-t', target];

        if(lines !== undefined) {
            // Capture specific number of lines from scrollback
            args.push('-S', `-${lines}`);
        } else {
            // Capture all scrollback
            args.push('-S', '-');
        }

        const result = await this._runTmuxCommand(args);
        return result.stdout;
    }

    async getScrollbackSize(sessionId) {
        const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;

        try {
            const result = await this._runTmuxCommand(['show', '-s', '-t', targetSession, 'history-limit']);
            const output = _.trim(result.stdout);

            // Output format is "history-limit 2000" - extract the number
            const match = output.match(/history-limit\s+(\d+)/);
            if(match) {
                return parseInt(match[1], 10);
            }

            // Fallback - try to get just the value
            const lines = _.split(output, '\n');
            const lastLine = _.trim(_.last(lines));
            const value = parseInt(lastLine, 10);
            if(!isNaN(value)) {
                return value;
            }

            throw new Error('Could not parse history-limit value');
        } catch(error) {
            throw new Error(`Failed to get scrollback size: ${error.message}`);
        }
    }

    async setScrollbackSize(sessionId, lines) {
        if(!Number.isInteger(lines) || lines < 0) {
            throw new Error('Lines must be a non-negative integer');
        }

        const targetSession = this.isUsingParentSession ? this.parentSession : `${sessionId}-MCP`;

        try {
            await this._runTmuxCommand(['set', '-s', '-t', targetSession, 'history-limit', lines.toString()]);
        } catch(error) {
            throw new Error(`Failed to set scrollback size: ${error.message}`);
        }
    }
}

export default TmuxManager;

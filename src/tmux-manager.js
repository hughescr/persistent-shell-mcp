import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';

class TmuxManager {
    constructor() {
        this.sessions = new Map();
        this.sessionMetadata = new Map();
        this.lastHealthCheck = new Map();
        this.healthCheckInterval = 5 * 60 * 1000; // 5 minutes
        this.maxIdleTime = 30 * 60 * 1000; // 30 minutes
        this.tmuxAvailable = null; // Cache tmux availability check
        this.startBackgroundCleanup();
    }

    async checkTmuxInstallation() {
        if (this.tmuxAvailable !== null) {
            return this.tmuxAvailable;
        }
        try {
            await this._runTmuxCommand(['list-sessions'], 5000);
            this.tmuxAvailable = true;
            return true;
        } catch (error) {
            if (error.message.includes('command not found') || error.code === 'ENOENT') {
                this.tmuxAvailable = false;
                throw new Error('tmux is not installed. Please install tmux:\n' +
                    '• Ubuntu/Debian: sudo apt update && sudo apt install tmux\n' +
                    '• macOS: brew install tmux\n' +
                    '• CentOS/RHEL: sudo yum install tmux\n' +
                    '• Arch Linux: sudo pacman -S tmux');
            }
            // tmux is installed but no server running (that's ok)
            this.tmuxAvailable = true;
            return true;
        }
    }

    async createSession(sessionId = null, purpose = 'general') {
        await this.checkTmuxInstallation();

        if (sessionId === null) {
            sessionId = `mcp_${randomBytes(4).toString('hex')}`;
        }

        const sessionAlreadyExists = await this._runTmuxCommand(['has-session', '-t', sessionId]).then(() => true).catch(() => false);
        const sessionIsConfigured = await this.sessionExists(sessionId);

        if (sessionAlreadyExists && !sessionIsConfigured) {
            console.warn(`Session ${sessionId} exists but is not correctly configured. Destroying and recreating.`);
            await this.destroySession(sessionId);
        } else if (sessionAlreadyExists && sessionIsConfigured) {
            console.log(`Session ${sessionId} already exists and is correctly configured.`);
            this._updateSessionMetadata(sessionId, { lastAccessed: Date.now() });
            return sessionId;
        }

        const uiLogFile = `/tmp/tmux-mcp-ui-${sessionId}.log`;

        try {
            // 1. Create the session with the 'exec' window
            console.error(`[createSession] Creating 'exec' window for session ${sessionId}...`);
            await this._runTmuxCommand([
                'new-session', '-d',
                '-s', sessionId,
                '-n', 'exec',
                '-c', process.cwd() // Start in current working directory
            ]);
            console.error(`[createSession] 'exec' window created.`);

            // 2. Create the 'ui' window
            console.error(`[createSession] Creating 'ui' window for session ${sessionId}...`);
            await this._runTmuxCommand([
                'new-window',
                '-t', `${sessionId}`,
                '-n', 'ui'
            ]);
            console.error(`[createSession] 'ui' window created.`);

            // 3. Initialize the UI log file (but keep UI window as normal shell)
            console.error(`[createSession] Initializing UI log file...`);
            await fs.writeFile(uiLogFile, ''); // Ensure log file is created and empty
            console.error(`[createSession] UI log file initialized.`);

            // 4. Set metadata
            const now = Date.now();
            this.sessions.set(sessionId, { created: true, active: true, createdAt: new Date().toISOString() });
            this.sessionMetadata.set(sessionId, {
                purpose,
                createdAt: now,
                lastAccessed: now,
                commandCount: 0,
                healthStatus: 'healthy',
                workingDirectory: process.cwd(),
                uiLogFile: uiLogFile
            });
            this.lastHealthCheck.set(sessionId, now);

            console.log(`Created tmux session: ${sessionId} with 'ui' and 'exec' windows.`);
            return sessionId;

        } catch (error) {
            console.error(`Failed to create and configure session ${sessionId}:`, error.message);
            // Cleanup failed session creation
            try {
                if (await this._runTmuxCommand(['has-session', '-t', sessionId])) {
                     await this.destroySession(sessionId);
                }
            } catch(e) { /* ignore cleanup errors */ }
            throw new Error(`Failed to create tmux session: ${error.message}`);
        }
    }

    async sessionExists(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            return false;
        }
        
        try {
            await this.checkTmuxInstallation();
            const result = await this._runTmuxCommand(['list-windows', '-t', sessionId, '-F', '#{window_name}']);
            const windows = new Set(result.stdout.trim().split('\n'));
            console.error(`[sessionExists] For session ${sessionId}, found windows: ${Array.from(windows).join(', ')}`);
            
            if (windows.has('ui') && windows.has('exec')) {
                this._updateSessionMetadata(sessionId, { lastAccessed: Date.now() });
                return true;
            }
            return false;
        } catch (error) {
            if (this.sessions.has(sessionId)) {
                this.sessions.delete(sessionId);
                this.sessionMetadata.delete(sessionId);
                this.lastHealthCheck.delete(sessionId);
            }
            return false;
        }
    }

    async listSessions() {
        try {
            await this.checkTmuxInstallation();
            const result = await this._runTmuxCommand(['list-sessions', '-F', '#{session_name}']);
            return result.stdout.trim() ? result.stdout.trim().split('\n') : [];
        } catch (error) {
            if (error.message.includes('tmux is not installed')) {
                throw error;
            }
            return [];
        }
    }

    async destroySession(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            throw new Error('Session ID must be a non-empty string');
        }
        
        const exists = await this._runTmuxCommand(['has-session', '-t', sessionId]).then(() => true).catch(() => false);
        if (!exists) {
            console.warn(`Session ${sessionId} not found. Cannot destroy.`);
            return false;
        }
        
        try {
            await this._runTmuxCommand(['kill-session', '-t', sessionId]);
            this.sessions.delete(sessionId);
            this.sessionMetadata.delete(sessionId);
            this.lastHealthCheck.delete(sessionId);
            console.log(`Destroyed tmux session: ${sessionId}`);
            // Clean up UI log file
            const uiLogFile = `/tmp/tmux-mcp-ui-${sessionId}.log`;
            await fs.unlink(uiLogFile).catch(err => console.warn(`Failed to clean up UI log file ${uiLogFile}: ${err.message}`));
            return true;
        } catch (error) {
            console.error(`Failed to destroy session ${sessionId}:`, error.message);
            return false;
        }
    }

    async getSessionHealth(sessionId) {
        const exists = await this.sessionExists(sessionId);
        if (!exists) {
            return { exists: false, healthy: false, reason: 'Session does not exist or is misconfigured' };
        }

        const metadata = this.sessionMetadata.get(sessionId) || {};
        const now = Date.now();
        const age = now - (metadata.createdAt || now);
        const idleTime = now - (metadata.lastAccessed || now);

        return {
            exists: true,
            healthy: metadata.healthStatus === 'healthy',
            session_id: sessionId,
            purpose: metadata.purpose || 'unknown',
            age_minutes: Math.round(age / (1000 * 60)),
            idle_minutes: Math.round(idleTime / (1000 * 60)),
            command_count: metadata.commandCount || 0,
            working_directory: metadata.workingDirectory || 'unknown',
            health_status: metadata.healthStatus,
            last_health_check: new Date(this.lastHealthCheck.get(sessionId) || 0).toISOString(),
            needs_cleanup: idleTime > this.maxIdleTime
        };
    }

    async performLifecycleCleanup() {
        const sessions = await this.listSessions();
        const now = Date.now();
        const cleanedSessions = [];

        for (const sessionId of sessions) {
            const health = await this.getSessionHealth(sessionId);
            if (!health.exists) continue;

            if (health.needs_cleanup || !health.healthy) {
                console.log(`Cleaning up ${!health.healthy ? 'unhealthy' : 'idle'} session: ${sessionId} (idle: ${health.idle_minutes}min)`);
                try {
                    await this.destroySession(sessionId);
                    cleanedSessions.push(sessionId);
                } catch (error) {
                    console.error(`Failed to cleanup session ${sessionId}:`, error.message);
                }
            }
        }
        return cleanedSessions;
    }

    _updateSessionMetadata(sessionId, updates) {
        if (!this.sessionMetadata.has(sessionId)) {
            return; // Don't create metadata for sessions we don't own
        }
        const current = this.sessionMetadata.get(sessionId);
        this.sessionMetadata.set(sessionId, { ...current, ...updates });
    }

    startBackgroundCleanup() {
        setInterval(async () => {
            try {
                await this.performLifecycleCleanup();
            } catch (error) {
                console.error('Background cleanup failed:', error.message);
            }
        }, 10 * 60 * 1000);
    }

    async recordCommandExecution(sessionId, workingDir) {
        if (this.sessionMetadata.has(sessionId)) {
            const updates = {
                lastAccessed: Date.now(),
                commandCount: (this.sessionMetadata.get(sessionId).commandCount || 0) + 1,
                workingDirectory: workingDir
            };
            this._updateSessionMetadata(sessionId, updates);
        }
    }

    async captureWindowContent(sessionId, windowName = 'ui') {
        const target = `${sessionId}:${windowName}`;
        const result = await this._runTmuxCommand([
            'capture-pane', '-p', '-t', target
        ]);
        return {
            content: result.stdout,
            timestamp: Date.now()
        };
    }

    async sendKeysToWindow(sessionId, windowName, keys, pressEnter = true) {
        const target = `${sessionId}:${windowName}`;
        const args = ['send-keys', '-t', target, keys];
        if (pressEnter) {
            args.push('C-m');
        }
        return await this._runTmuxCommand(args);
    }
    
    async getPaneCurrentPath(sessionId, windowName) {
        const target = `${sessionId}:${windowName}`;
        const result = await this._runTmuxCommand(['display-message', '-p', '-t', target, '-F', '#{pane_current_path}']);
        return result.stdout.trim();
    }

    _runTmuxCommand(args, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!args || !Array.isArray(args) || args.length === 0) {
                return reject(new Error('Invalid tmux command arguments'));
            }
            
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
}

export default TmuxManager;

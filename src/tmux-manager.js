import { spawn } from 'child_process';
import { randomBytes } from 'crypto';

class TmuxManager {
    constructor() {
        this.sessions = new Map();
        this.maxRetries = 3;
        this.retryDelay = 500; // 500ms
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
            await this._runTmuxCommand(['list-sessions'], false);
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

        // Check if session already exists first
        if (await this.sessionExists(sessionId)) {
            console.log(`Session ${sessionId} already exists`);
            this.sessions.set(sessionId, { created: true, active: true });
            this._updateSessionMetadata(sessionId, { lastAccessed: Date.now() });
            return sessionId;
        }

        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await this._runTmuxCommand([
                    'new-session',
                    '-d',
                    '-s', sessionId,
                    '-c', '/tmp'
                ]);

                // Verify session was actually created
                if (await this.sessionExists(sessionId)) {
                    const now = Date.now();
                    this.sessions.set(sessionId, {
                        created: true,
                        active: true,
                        createdAt: new Date().toISOString()
                    });
                    
                    // Initialize session metadata for lifecycle management
                    this.sessionMetadata.set(sessionId, {
                        purpose,
                        createdAt: now,
                        lastAccessed: now,
                        commandCount: 0,
                        healthStatus: 'healthy',
                        workingDirectory: '/tmp'
                    });
                    
                    this.lastHealthCheck.set(sessionId, now);

                    console.log(`Created tmux session: ${sessionId} (purpose: ${purpose})`);
                    return sessionId;
                } else {
                    throw new Error('Session creation succeeded but session not found');
                }

            } catch (error) {
                lastError = error;
                console.error(`Failed to create tmux session ${sessionId} (attempt ${attempt}):`, error.message);
                
                if (attempt < this.maxRetries) {
                    console.log(`Retrying session creation in ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }
        
        throw new Error(`Failed to create tmux session after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    async sessionExists(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            return false;
        }
        
        try {
            await this.checkTmuxInstallation();
            await this._runTmuxCommand(['has-session', '-t', sessionId]);
            // Update last accessed time for lifecycle management
            this._updateSessionMetadata(sessionId, { lastAccessed: Date.now() });
            return true;
        } catch (error) {
            // Remove from our internal tracking if session no longer exists
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
            // Re-throw installation errors
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
        
        // Check if session exists before attempting to destroy
        if (!(await this.sessionExists(sessionId))) {
            throw new Error(`Session ${sessionId} not found. Cannot destroy a nonexistent session.`);
        }
        
        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await this._runTmuxCommand(['kill-session', '-t', sessionId]);
                
                // Verify session was actually destroyed
                const stillExists = await this.sessionExists(sessionId);
                if (!stillExists) {
                    this.sessions.delete(sessionId);
                    console.log(`Destroyed tmux session: ${sessionId}`);
                    return true;
                } else {
                    throw new Error('Session destroy command succeeded but session still exists');
                }

            } catch (error) {
                lastError = error;
                console.error(`Failed to destroy session ${sessionId} (attempt ${attempt}):`, error.message);
                
                if (attempt < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }
        
        console.error(`Failed to destroy session ${sessionId} after ${this.maxRetries} attempts:`, lastError.message);
        return false;
    }

    async getSessionHealth(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            return { exists: false, error: 'Invalid session ID' };
        }

        try {
            // Check basic existence
            const exists = await this.sessionExists(sessionId);
            if (!exists) {
                return { exists: false, healthy: false, reason: 'Session does not exist' };
            }

            const metadata = this.sessionMetadata.get(sessionId) || {};
            const now = Date.now();
            const lastCheck = this.lastHealthCheck.get(sessionId) || 0;

            // Perform health check if needed
            if (now - lastCheck > this.healthCheckInterval) {
                await this._performHealthCheck(sessionId);
            }

            const healthStatus = metadata.healthStatus || 'unknown';
            const age = now - (metadata.createdAt || now);
            const idleTime = now - (metadata.lastAccessed || now);

            return {
                exists: true,
                healthy: healthStatus === 'healthy',
                session_id: sessionId,
                purpose: metadata.purpose || 'unknown',
                age_minutes: Math.round(age / (1000 * 60)),
                idle_minutes: Math.round(idleTime / (1000 * 60)),
                command_count: metadata.commandCount || 0,
                working_directory: metadata.workingDirectory || 'unknown',
                health_status: healthStatus,
                last_health_check: new Date(lastCheck).toISOString(),
                needs_cleanup: idleTime > this.maxIdleTime
            };
        } catch (error) {
            return {
                exists: false,
                healthy: false,
                error: error.message
            };
        }
    }

    async performLifecycleCleanup() {
        const sessions = await this.listSessions();
        const now = Date.now();
        const cleanedSessions = [];

        for (const sessionId of sessions) {
            const metadata = this.sessionMetadata.get(sessionId);
            if (!metadata) continue;

            const idleTime = now - metadata.lastAccessed;
            const isZombie = metadata.healthStatus === 'unhealthy';

            if (idleTime > this.maxIdleTime || isZombie) {
                console.log(`Cleaning up ${isZombie ? 'zombie' : 'idle'} session: ${sessionId} (idle: ${Math.round(idleTime / (1000 * 60))}min)`);
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
            this.sessionMetadata.set(sessionId, {
                purpose: 'unknown',
                createdAt: Date.now(),
                lastAccessed: Date.now(),
                commandCount: 0,
                healthStatus: 'healthy',
                workingDirectory: '/tmp'
            });
        }

        const current = this.sessionMetadata.get(sessionId);
        this.sessionMetadata.set(sessionId, { ...current, ...updates });
    }

    async _performHealthCheck(sessionId) {
        const now = Date.now();
        this.lastHealthCheck.set(sessionId, now);

        try {
            // Test session responsiveness with simple command
            const result = await this._runTmuxCommand([
                'send-keys', '-t', sessionId, 'echo health_test_ok', 'C-m'
            ], 3000);

            this._updateSessionMetadata(sessionId, {
                healthStatus: 'healthy',
                lastHealthCheck: now
            });
        } catch (error) {
            console.warn(`Health check failed for session ${sessionId}:`, error.message);
            this._updateSessionMetadata(sessionId, {
                healthStatus: 'unhealthy',
                lastHealthCheck: now
            });
        }
    }

    startBackgroundCleanup() {
        // Run cleanup every 10 minutes
        setInterval(async () => {
            try {
                const cleaned = await this.performLifecycleCleanup();
                if (cleaned.length > 0) {
                    console.log(`Background cleanup removed ${cleaned.length} sessions:`, cleaned);
                }
            } catch (error) {
                console.error('Background cleanup failed:', error.message);
            }
        }, 10 * 60 * 1000);
    }

    async recordCommandExecution(sessionId, workingDir = null) {
        if (this.sessionMetadata.has(sessionId)) {
            const updates = {
                lastAccessed: Date.now(),
                commandCount: (this.sessionMetadata.get(sessionId).commandCount || 0) + 1
            };
            
            // If workingDir is not provided, attempt to fetch it
            if (!workingDir) {
                try {
                    const result = await this._runTmuxCommand(['display-message', '-p', '#{pane_current_path}', '-t', sessionId]);
                    if (result.stdout) {
                        workingDir = result.stdout.trim();
                    }
                } catch (error) {
                    console.warn(`Could not retrieve working directory for session ${sessionId}:`, error.message);
                }
            }

            if (workingDir) {
                updates.workingDirectory = workingDir;
            }
            this._updateSessionMetadata(sessionId, updates);
        }
    }

    async cleanupAllSessions() {
        for (const sessionId of this.sessions.keys()) {
            await this.destroySession(sessionId);
        }
    }

    async capturePaneContent(sessionId, paneId = 0) {
        const result = await this._runTmuxCommand([
            'capture-pane', '-t', sessionId, '-p'
        ]);
        return {
            content: result.stdout,
            timestamp: Date.now()
        };
    }

    async sendKeysToPane(sessionId, keys, paneId = 0, pressEnter = true) {
        const args = ['send-keys', '-t', sessionId, keys];
        if (pressEnter) {
            args.push('Enter');
        }
        return await this._runTmuxCommand(args);
    }

    _runTmuxCommand(args, timeout = 10000) {
        return new Promise((resolve, reject) => {
            // Validate tmux is available
            if (!args || !Array.isArray(args) || args.length === 0) {
                reject(new Error('Invalid tmux command arguments'));
                return;
            }
            
            const process = spawn('tmux', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            let timeoutId = null;
            
            // Set timeout for tmux commands
            if (timeout > 0) {
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
                if (timeoutId) clearTimeout(timeoutId);
                
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    // Provide more specific error messages
                    let errorMsg = `tmux command failed with code ${code}`;
                    if (stderr.includes('no server running')) {
                        errorMsg += ': No tmux server running. Tmux daemon may need to be started.';
                    } else if (stderr.includes('no such session')) {
                        errorMsg += ': Session not found. Use tmux_list_sessions to see available sessions.';
                    } else if (stderr.includes('session name too long')) {
                        errorMsg += ': Session name too long. Use shorter session names.';
                    } else if (stderr) {
                        errorMsg += `: ${stderr.trim()}`;
                    }
                    
                    const error = new Error(errorMsg);
                    error.code = code;
                    error.stderr = stderr;
                    error.command = `tmux ${args.join(' ')}`;
                    reject(error);
                }
            });

            process.on('error', (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                
                // Enhance error message for common issues
                if (error.code === 'ENOENT') {
                    error.message = 'tmux command not found. Please install tmux: sudo apt install tmux';
                }
                reject(error);
            });
        });
    }
}

export default TmuxManager;
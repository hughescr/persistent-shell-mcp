import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class CommandExecutor {
    constructor(tmuxManager) {
        this.tmuxManager = tmuxManager;
        this.tempDir = '/tmp';
        this.maxRetries = 2;
        this.retryDelay = 1000; // 1 second
    }

    async executeCommand(command, sessionId = 'default', timeout = 30) {
        let lastError = null;
        let attempt = 0;
        
        // Validate and sanitize inputs
        if (!command || typeof command !== 'string') {
            throw new Error('Command must be a non-empty string');
        }
        
        while (attempt <= this.maxRetries) {
            attempt++;
            
            try {
                return await this._executeCommandAttempt(command, sessionId, timeout, attempt);
            } catch (error) {
                lastError = error;
                console.error(`Command execution attempt ${attempt} failed:`, error.message);
                
                // Check if this is a recoverable error
                if (this._isRecoverableError(error) && attempt <= this.maxRetries) {
                    console.log(`Attempting recovery for session ${sessionId}...`);
                    
                    // Try session recovery
                    try {
                        await this._recoverSession(sessionId);
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                        continue;
                    } catch (recoveryError) {
                        console.error(`Session recovery failed:`, recoveryError.message);
                    }
                }
                
                // If non-recoverable or max retries reached, break
                if (!this._isRecoverableError(error) || attempt > this.maxRetries) {
                    break;
                }
            }
        }
        
        // Return structured error with recovery guidance
        return this._createErrorResponse(command, sessionId, lastError, attempt - 1);
    }

    async executeCommandWithCapture(command, sessionId = 'default', timeout = 30) {
        // Ensure session exists
        if (!(await this.tmuxManager.sessionExists(sessionId))) {
            sessionId = await this.tmuxManager.createSession(sessionId);
        }

        // Send command to pane 0
        await this.tmuxManager.sendKeysToPane(sessionId, command, 0, true);
        
        // Wait briefly for command to execute
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Capture terminal state
        const capture = await this.tmuxManager.capturePaneContent(sessionId, 0);
        
        return {
            terminal_content: capture.content,
            session_id: sessionId,
            timestamp: capture.timestamp,
            execution_method: 'capture-pane'
        };
    }

    async getSessionInfo(sessionId) {
        if (!(await this.tmuxManager.sessionExists(sessionId))) {
            return { exists: false };
        }

        try {
            const result = await this.executeCommand('pwd', sessionId, 5);
            const currentDir = result.stdout.trim();

            return {
                exists: true,
                session_id: sessionId,
                current_directory: currentDir,
                active: true
            };
        } catch (error) {
            return {
                exists: true,
                session_id: sessionId,
                error: error.message
            };
        }
    }

    async _sendKeysToTmux(sessionId, command) {
        return new Promise((resolve, reject) => {
            const process = spawn('tmux', [
                'send-keys',
                '-t', sessionId,
                command,
                'C-m'
            ]);

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`tmux send-keys failed with code ${code}`));
                }
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }

    async _waitForCompletion(doneMarker, timeout, outputFile = null, sessionId = null) {
        const startTime = Date.now();
        const timeoutMs = timeout * 1000;
        const warningThreshold = timeoutMs * 0.7; // 70% of timeout
        let warningShown = false;
        
        while (true) {
            try {
                await fs.access(doneMarker);
                return;
            } catch (error) {
                const elapsed = Date.now() - startTime;
                
                // Show warning at 70% timeout
                if (!warningShown && elapsed > warningThreshold) {
                    console.warn(`Command approaching timeout (${Math.round(elapsed/1000)}/${timeout}s). Consider increasing timeout for long operations.`);
                    warningShown = true;
                }
                
                if (elapsed > timeoutMs) {
                    // Before timing out, check if the session still exists
                    if (sessionId && !(await this.tmuxManager.sessionExists(sessionId))) {
                        const sessionKilledError = new Error(`Session ${sessionId} was killed before command completion.`);
                        sessionKilledError.sessionKilled = true;
                        sessionKilledError.recoverable = false;
                        throw sessionKilledError;
                    }

                    // Try to capture partial output before timing out
                    let partialOutput = '';
                    if (outputFile) {
                        try {
                            partialOutput = await fs.readFile(outputFile, 'utf8');
                        } catch (readError) {
                            // Ignore read errors for partial output
                        }
                    }
                    
                    const timeoutError = new Error(`Command timed out after ${timeout} seconds. Consider increasing timeout for long operations like builds or installs.`);
                    timeoutError.partialOutput = partialOutput;
                    timeoutError.recoverable = true;
                    throw timeoutError;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    async _readOutput(outputFile) {
        try {
            const output = await fs.readFile(outputFile, 'utf8');
            const lines = output.split('\n');
            let exitCode = 0;
            const stdoutLines = [];

            for (const line of lines) {
                if (line.startsWith('EXIT_CODE:')) {
                    try {
                        exitCode = parseInt(line.split(':')[1]);
                    } catch (error) {
                        exitCode = -1;
                    }
                } else {
                    stdoutLines.push(line);
                }
            }

            const stdout = stdoutLines.join('\n').replace(/\n$/, '');

            return {
                stdout,
                stderr: '',
                exit_code: exitCode
            };

        } catch (error) {
            return {
                stdout: '',
                stderr: '',
                exit_code: -1
            };
        }
    }

    async _executeCommandAttempt(command, sessionId, timeout, attempt) {
        // Ensure session exists and is healthy
        if (!(await this.tmuxManager.sessionExists(sessionId))) {
            console.log(`Session ${sessionId} does not exist, creating...`);
            sessionId = await this.tmuxManager.createSession(sessionId, 'command_execution');
        } else if (attempt > 1) {
            // On retries, validate session health
            const isHealthy = await this._validateSessionHealth(sessionId);
            if (!isHealthy) {
                console.log(`Session ${sessionId} appears unhealthy, recreating...`);
                await this.tmuxManager.destroySession(sessionId);
                sessionId = await this.tmuxManager.createSession(sessionId, 'command_execution');
            }
        }

        const execId = uuidv4().replace(/-/g, '').substring(0, 12);
        const outputFile = path.join(this.tempDir, `output_${execId}.txt`);
        const doneMarker = path.join(this.tempDir, `done_${execId}.marker`);

        try {
            const tmuxCommand = `${command} > ${outputFile} 2>&1; echo "EXIT_CODE:$?" >> ${outputFile}; touch ${doneMarker}`;

            await this._sendKeysToTmux(sessionId, tmuxCommand);
            await this._waitForCompletion(doneMarker, timeout, outputFile, sessionId);

            const result = await this._readOutput(outputFile);

            // Get current working directory from tmux pane
            let currentWorkingDirectory = '/tmp'; // Default to /tmp if unable to retrieve
            try {
                const wdResult = await this._executeSimpleCommand('tmux display-message -p "#{pane_current_path}"', sessionId, 2);
                if (wdResult.exit_code === 0 && wdResult.stdout) {
                    currentWorkingDirectory = wdResult.stdout.trim();
                }
            } catch (wdError) {
                console.warn(`Failed to get working directory for session ${sessionId}:`, wdError.message);
            }
            
            // Record command execution for lifecycle management
            this.tmuxManager.recordCommandExecution(sessionId, currentWorkingDirectory);
            
            return {
                ...result,
                session_id: sessionId,
                execution_id: execId,
                attempt: attempt,
                working_directory: currentWorkingDirectory
            };

        } finally {
            await this._cleanupFiles([outputFile, doneMarker]);
        }
    }

    _isRecoverableError(error) {
        const recoverableMessages = [
            'tmux send-keys failed',
            'timed out',
            'Session not found',
            'Connection refused',
            'No such session'
        ];
        
        return error.recoverable === true || 
               recoverableMessages.some(msg => error.message.includes(msg));
    }

    async _recoverSession(sessionId) {
        console.log(`Attempting to recover session: ${sessionId}`);
        
        try {
            // Check if session still exists
            const exists = await this.tmuxManager.sessionExists(sessionId);
            if (!exists) {
                console.log(`Session ${sessionId} no longer exists, recreating...`);
                await this.tmuxManager.createSession(sessionId, 'recovered_session');
                return;
            }
            
            // Try to validate session responsiveness
            const isHealthy = await this._validateSessionHealth(sessionId);
            if (!isHealthy) {
                console.log(`Session ${sessionId} is unresponsive, recreating...`);
                await this.tmuxManager.destroySession(sessionId);
                await this.tmuxManager.createSession(sessionId, 'recovered_session');
            }
            
        } catch (error) {
            console.error(`Session recovery failed for ${sessionId}:`, error.message);
            throw error;
        }
    }

    async _validateSessionHealth(sessionId) {
        try {
            // Quick responsiveness test with short timeout
            const testResult = await this._executeSimpleCommand('echo "health_check"', sessionId, 3);
            return testResult.exit_code === 0 && testResult.stdout.includes('health_check');
        } catch (error) {
            return false;
        }
    }

    async _executeSimpleCommand(command, sessionId, timeout) {
        const execId = uuidv4().replace(/-/g, '').substring(0, 12);
        const outputFile = path.join(this.tempDir, `health_${execId}.txt`);
        const doneMarker = path.join(this.tempDir, `health_done_${execId}.marker`);

        try {
            const tmuxCommand = `${command} > ${outputFile} 2>&1; echo "EXIT_CODE:$?" >> ${outputFile}; touch ${doneMarker}`;
            
            await this._sendKeysToTmux(sessionId, tmuxCommand);
            await this._waitForCompletion(doneMarker, timeout);
            
            return await this._readOutput(outputFile);
        } finally {
            await this._cleanupFiles([outputFile, doneMarker]);
        }
    }

    _createErrorResponse(command, sessionId, error, attempts) {
        let errorMessage = `Command failed after ${attempts} attempts: ${error.message}`;
        let recoveryGuidance = '';
        
        if (error.message.includes('timed out')) {
            recoveryGuidance = 'SUGGESTION: Increase timeout parameter for long-running commands (builds, installs, etc.)';
        } else if (error.sessionKilled) {
            recoveryGuidance = 'SUGGESTION: The tmux session was unexpectedly terminated. This might indicate an external issue or a problem with the command itself.';
        } else if (error.message.includes('tmux send-keys failed') || error.message.includes('No such session')) {
            recoveryGuidance = 'SUGGESTION: Check if tmux is installed and session exists. Use tmux_session_exists to verify session state.';
        } else if (error.message.includes('Connection refused')) {
            recoveryGuidance = 'SUGGESTION: Tmux daemon may not be running. Try creating a new session with tmux_create_session.';
        } else {
            recoveryGuidance = 'SUGGESTION: Check command syntax and session state. Use tmux_list_sessions to see available sessions.';
        }
        
        return {
            stdout: error.partialOutput || '',
            stderr: `${errorMessage}\n\n${recoveryGuidance}`,
            exit_code: -1,
            session_id: sessionId,
            execution_id: 'failed',
            attempts: attempts,
            recoverable: this._isRecoverableError(error)
        };
    }

    async _cleanupFiles(filePaths) {
        for (const filePath of filePaths) {
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.warn(`Failed to clean up ${filePath}:`, error.message);
            }
        }
    }

    // Enhanced cleanup with age-based removal for stale files
    async cleanupStaleFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            const staleThreshold = Date.now() - (30 * 60 * 1000); // 30 minutes
            
            for (const file of files) {
                if (file.startsWith('output_') || file.startsWith('done_') || file.startsWith('health_')) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        if (stats.mtime.getTime() < staleThreshold) {
                            await fs.unlink(filePath);
                            console.log(`Cleaned up stale file: ${file}`);
                        }
                    } catch (error) {
                        // Ignore errors for individual file cleanup
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to cleanup stale files:', error.message);
        }
    }
}

export default CommandExecutor;
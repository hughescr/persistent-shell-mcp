import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class CommandExecutor {
    constructor(tmuxManager) {
        this.tmuxManager = tmuxManager;
        this.tempDir = '/tmp';
        this.cleanupStaleFiles(); // Initial cleanup
    }

    async executeCommand(command, sessionId = 'default', timeout = 30) {
        // 1. Ensure session is ready
        await this.tmuxManager.createSession(sessionId);

        const execId = uuidv4().replace(/-/g, '').substring(0, 12);
        const captureFile = path.join(this.tempDir, `tmux-mcp-capture-${execId}.txt`);
        const doneMarker = path.join(this.tempDir, `tmux-mcp-done-${execId}.marker`);
        const metadata = this.tmuxManager.sessionMetadata.get(sessionId);

        if (!metadata || !metadata.uiLogFile) {
            throw new Error(`Session ${sessionId} is not properly configured.`);
        }

        try {
            // 2. Execute command in exec window with output capture
            const execCommand = `${command} 2>&1 | tee ${captureFile}; echo "EXIT_CODE:$?" >> ${captureFile}; touch ${doneMarker}`;
            // Add small delay to ensure shell prompt is ready
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.tmuxManager.sendKeysToWindow(sessionId, 'exec', execCommand, true);

            // 3. Wait for completion
            await this._waitForCompletion(doneMarker, timeout);

            // 4. Process results
            const result = await this._readOutput(captureFile);
            const newCwd = await this.tmuxManager.getPaneCurrentPath(sessionId, 'exec');

            // 5. Replay command and output to UI window for clean display
            const prompt = await this._getPrompt(sessionId);
            await this.tmuxManager.sendKeysToWindow(sessionId, 'ui', `echo -n "${prompt}"`, true);
            await this.tmuxManager.sendKeysToWindow(sessionId, 'ui', command, true);
            if (result.stdout) {
                // Send output line by line to make it look natural
                const lines = result.stdout.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        await this.tmuxManager.sendKeysToWindow(sessionId, 'ui', `echo "${line}"`, true);
                    }
                }
            }

            this.tmuxManager.recordCommandExecution(sessionId, newCwd);

            return {
                ...result,
                session_id: sessionId,
                execution_id: execId,
                working_directory: newCwd
            };

        } catch (error) {
            console.error(`Command execution failed for session ${sessionId}:`, error.message);
            let partialOutput = '';
            if (error.message.includes('timed out')) {
                try {
                    partialOutput = await fs.readFile(captureFile, 'utf8');
                } catch (readError) { /* ignore */ }
            }
            // Return a structured error
            return this._createErrorResponse(command, sessionId, error, partialOutput);
        } finally {
            // 5. Cleanup temp files
            await this._cleanupFiles([captureFile, doneMarker]);
        }
    }

    async executeCommandWithCapture(command, sessionId = 'default', waitMs = 100) {
        await this.tmuxManager.createSession(sessionId);
        
        // Send command to the 'exec' window, which will be mirrored to the 'ui' window
        await this.tmuxManager.sendKeysToWindow(sessionId, 'exec', command, true);
        
        await new Promise(resolve => setTimeout(resolve, waitMs));
        
        const capture = await this.tmuxManager.captureWindowContent(sessionId, 'ui');
        
        return {
            terminal_content: capture.content,
            session_id: sessionId,
            timestamp: capture.timestamp
        };
    }

    async _getPrompt(sessionId) {
        const cwd = await this.tmuxManager.getPaneCurrentPath(sessionId, 'exec');
        // A basic, clean prompt. This could be made more sophisticated if needed.
        return `user@host:${cwd}$ `;
    }

    async _waitForCompletion(doneMarker, timeout) {
        const startTime = Date.now();
        const timeoutMs = timeout * 1000;

        while (true) {
            try {
                await fs.access(doneMarker);
                return;
            } catch (error) {
                if (Date.now() - startTime > timeoutMs) {
                    const timeoutError = new Error(`Command timed out after ${timeout} seconds. For long operations like builds or installs, consider increasing the timeout.`);
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
            let exitCode = -1;
            const stdoutLines = [];

            const exitCodeLine = lines.pop(); // Last line should be EXIT_CODE
            if (exitCodeLine && exitCodeLine.startsWith('EXIT_CODE:')) {
                exitCode = parseInt(exitCodeLine.split(':')[1], 10);
            } else {
                lines.push(exitCodeLine); // It wasn't the exit code line, put it back
            }

            return {
                stdout: lines.join('\n').trim(),
                stderr: '', // Stderr is merged into stdout by `2>&1`
                exit_code: exitCode
            };

        } catch (error) {
            return {
                stdout: '',
                stderr: `Failed to read output file: ${error.message}`,
                exit_code: -1
            };
        }
    }

    _createErrorResponse(command, sessionId, error, partialOutput) {
        let errorMessage = `Command failed: ${error.message}`;
        let recoveryGuidance = 'Check command syntax and session state. Use tmux_list_sessions to see available sessions.';

        if (error.message.includes('timed out')) {
            recoveryGuidance = 'SUGGESTION: Increase timeout parameter for long-running commands (builds, installs, etc.)';
        }

        return {
            stdout: partialOutput || '',
            stderr: `${errorMessage}\n\n${recoveryGuidance}`,
            exit_code: -1,
            session_id: sessionId
        };
    }

    async _cleanupFiles(filePaths) {
        for (const filePath of filePaths) {
            try {
                await fs.unlink(filePath);
            } catch (error) {
                // Ignore errors if file doesn't exist
                if (error.code !== 'ENOENT') {
                    console.warn(`Failed to clean up ${filePath}:`, error.message);
                }
            }
        }
    }

    async cleanupStaleFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            const staleThreshold = Date.now() - (60 * 60 * 1000); // 1 hour
            
            for (const file of files) {
                if (file.startsWith('tmux-mcp-')) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        if (stats.mtime.getTime() < staleThreshold) {
                            await fs.unlink(filePath);
                            console.log(`Cleaned up stale temp file: ${file}`);
                        }
                    } catch (error) {
                        if (error.code !== 'ENOENT') {
                           console.warn(`Failed to process stale file ${file}:`, error.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to run stale file cleanup:', error.message);
        }
    }
}

export default CommandExecutor;

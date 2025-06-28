#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import TmuxManager from './tmux-manager.js';
import CommandExecutor from './command-executor.js';

class TmuxMcpServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tmux-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tmuxManager = new TmuxManager();
    this.commandExecutor = new CommandExecutor(this.tmuxManager);

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'echo',
            description: 'Echo a message back (testing tool)',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Message to echo back',
                },
              },
              required: ['message'],
            },
          },
          {
            name: 'shell_exec',
            description: 'Execute non-interactive shell commands with full output capture. WAITS FOR COMPLETION - will timeout on long-running commands. BEST FOR: Regular commands (ls, grep, build scripts) that run and complete quickly. LIMITATIONS: Times out on servers/long commands, cannot handle interactive prompts. For servers, interactive commands, or anything that might run indefinitely, use shell_exec_interactive instead. Sessions persist state across commands.',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'Shell command to execute (supports complex shell syntax, pipes, redirects)',
                },
                session_id: {
                  type: 'string',
                  description: 'Tmux session identifier (auto-creates if missing). Use descriptive names like "project-build" or "dev-server". Defaults to "default"',
                  default: 'default',
                },
                timeout: {
                  type: 'number',
                  description: 'Command timeout in seconds. Increase for long operations (build scripts, installs, etc). Defaults to 30s',
                  default: 30,
                },
              },
              required: ['command'],
            },
          },
          {
            name: 'tmux_list_sessions',
            description: 'List all active tmux sessions. Use this to discover existing sessions before creating new ones or to verify session cleanup. Sessions persist across MCP client restarts, so this shows the true state of available sessions. Essential for session management and avoiding duplicate sessions.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'tmux_create_session',
            description: 'Create a new tmux session explicitly. Generally not needed as shell_exec auto-creates sessions, but useful when you want to pre-create a session for a specific purpose. Always check if session exists first using tmux_session_exists to avoid conflicts. Use descriptive session names that indicate purpose (e.g., "database-work", "frontend-dev").',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'Session identifier. If not provided, generates unique name like "mcp_abc123". Use meaningful names for better organization',
                },
              },
            },
          },
          {
            name: 'tmux_destroy_session',
            description: 'Destroy a tmux session and clean up its resources. WARNING: This permanently removes the session and all its state (working directory, environment variables, background processes). Use when finished with a session or for cleanup. Always verify the session exists first with tmux_session_exists. Consider listing sessions first to confirm you are destroying the correct one.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'Session identifier to destroy. Must be exact match. Use tmux_list_sessions to verify correct session name',
                },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'tmux_session_exists',
            description: 'Check if a tmux session exists and is responsive. RECOMMENDED: Use this before shell_exec to understand session state, especially when resuming work or troubleshooting. Critical for session lifecycle management. Returns true if session exists and is healthy, false otherwise. Sessions persist across MCP client restarts.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'Session identifier to check for existence. Must be exact match',
                },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'tmux_session_info',
            description: 'Get detailed health and lifecycle information about a tmux session. Provides comprehensive session status including age, activity, health status, and cleanup recommendations. Essential for session management, troubleshooting, and understanding session state. Use this to monitor session health and decide when cleanup is needed.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'Session identifier to get detailed information about. Must be exact match',
                },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'tmux_cleanup_sessions',
            description: 'Perform intelligent cleanup of idle and unhealthy tmux sessions. Automatically removes sessions that have been idle for too long (30+ minutes) or are marked as unhealthy. Use this for session maintenance and resource cleanup. Returns list of cleaned sessions. Safe to run - only removes truly stale sessions.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
{
    name: 'shell_exec_interactive',
    description: 'Execute commands and return terminal snapshot immediately - NEVER HANGS on long-running commands. Unlike shell_exec which waits for completion, this returns after wait_ms with current terminal state while command continues running in background. PERFECT FOR: Servers (python -m http.server), interactive commands (python3, ssh), log monitoring (tail -f), or any command that might run indefinitely. WORKFLOW: Start command → Get snapshot → Use tmux_capture_terminal to monitor → Use tmux_send_input for interaction → Send Ctrl+C to stop.',
    inputSchema: {
        type: 'object',
        properties: {
            command: { type: 'string', description: 'Command to execute (sent as-is, no file redirection)' },
            session_id: { type: 'string', default: 'default' },
            wait_ms: { type: 'number', default: 100, description: 'Milliseconds to wait before capturing terminal (increase for slow commands)' }
        },
        required: ['command']
    }
},
{
    name: 'tmux_send_input',
    description: 'Send input to interactive commands that are waiting for user input. USE AFTER shell_exec_interactive when you see a prompt (e.g., "Enter password:", "Continue? (y/n)", ">>> "). This tool sends keystrokes to the terminal and immediately captures the result. SPECIAL: Use input="C-c" with press_enter=false to stop long-running commands like servers or tail -f. WORKFLOW: 1) Use shell_exec_interactive to start interactive command, 2) See prompt in output, 3) Use this tool to respond, 4) Repeat as needed.',
    inputSchema: {
        type: 'object', 
        properties: {
            input: { type: 'string', description: 'Text to type (password, y/n response, Python code, etc.)' },
            session_id: { type: 'string', default: 'default' },
            press_enter: { type: 'boolean', default: true, description: 'Whether to press Enter after typing (usually true)' }
        },
        required: ['input']
    }
},
{
    name: 'tmux_capture_terminal',
    description: 'Check current terminal state without running any commands. Shows exactly what is visible on screen including prompts, running processes, or command output. CRITICAL FOR MONITORING: After starting servers or long-running commands with shell_exec_interactive, use this to monitor progress, see new log entries, check if processes are still running, or verify current working directory. This is read-only - no commands executed. IDEAL FOR: Monitoring server logs, checking build progress, seeing if interactive prompts appeared.'.
    inputSchema: {
        type: 'object',
        properties: {
            session_id: { type: 'string', default: 'default' },
            pane_id: { type: 'number', default: 0, description: 'Pane number (usually 0 for main shell)' }
        }
    }
}
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'echo') {
        const message = args?.message || '';
        return {
          content: [
            {
              type: 'text',
              text: `Echo: ${message}`,
            },
          ],
        };
      }

      if (name === 'shell_exec') {
        if (!args) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No arguments provided',
              },
            ],
          };
        }

        const command = args.command || '';
        const sessionId = args.session_id || 'default';
        const timeout = args.timeout || 30;

        console.error(`Executing command '${command}' in session '${sessionId}'`);

        try {
          const result = await this.commandExecutor.executeCommand(
            command,
            sessionId,
            timeout
          );

          const responseText = `Command: ${command}
Session: ${result.session_id}
Exit Code: ${result.exit_code}

--- STDOUT ---
${result.stdout}

--- STDERR ---
${result.stderr}`;

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
          };
        } catch (error) {
          console.error(`Error executing command '${command}':`, error);
          
          // Provide enhanced error guidance
          let errorText = `Error executing command '${command}': ${error.message}`;
          
          if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: Install tmux with: sudo apt install tmux (Ubuntu/Debian) or brew install tmux (macOS)';
          } else if (error.message.includes('No tmux server running')) {
            errorText += '\n\nRECOVERY: Start tmux daemon by creating any session: tmux_create_session';
          } else if (error.message.includes('timed out')) {
            errorText += '\n\nRECOVERY: Increase timeout parameter for long-running commands. Example: shell_exec("long_command", "session", 120)';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

      if (name === 'tmux_list_sessions') {
        try {
          const sessions = await this.tmuxManager.listSessions();
          const sessionDetails = [];
          
          for (const sessionId of sessions) {
            const exists = await this.tmuxManager.sessionExists(sessionId);
            sessionDetails.push({
              session_id: sessionId,
              active: exists
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: `Active tmux sessions (${sessions.length}):\n${sessionDetails.map(s => `- ${s.session_id} (${s.active ? 'active' : 'inactive'})`).join('\n')}`,
              },
            ],
          };
        } catch (error) {
          let errorText = `Error listing sessions: ${error.message}`;
          
          if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: Install tmux first, then use tmux_create_session to start';
          } else if (error.message.includes('No tmux server running')) {
            errorText += '\n\nRECOVERY: No sessions exist yet. Use tmux_create_session to create your first session';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

      if (name === 'tmux_create_session') {
        try {
          const sessionId = args?.session_id || null;
          const createdSessionId = await this.tmuxManager.createSession(sessionId);
          
          return {
            content: [
              {
                type: 'text',
                text: `Created tmux session: ${createdSessionId}`,
              },
            ],
          };
        } catch (error) {
          let errorText = `Error creating session: ${error.message}`;
          
          if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: Install tmux with: sudo apt install tmux (Ubuntu/Debian) or brew install tmux (macOS)';
          } else if (error.message.includes('session name too long')) {
            errorText += '\n\nRECOVERY: Use a shorter session name (max ~250 characters)';
          } else if (error.message.includes('duplicate session')) {
            errorText += '\n\nRECOVERY: Session already exists. Use tmux_session_exists to check first, or choose a different name';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

      if (name === 'tmux_destroy_session') {
        if (!args?.session_id) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: session_id is required',
              },
            ],
          };
        }

        try {
          const success = await this.tmuxManager.destroySession(args.session_id);
          
          return {
            content: [
              {
                type: 'text',
                text: success ? `Destroyed session: ${args.session_id}` : `Failed to destroy session: ${args.session_id}`,
              },
            ],
          };
        } catch (error) {
          let errorText = `Error destroying session: ${error.message}`;
          
          if (error.message.includes('no such session')) {
            errorText += '\n\nRECOVERY: Session may have already been destroyed or never existed. Use tmux_list_sessions to see active sessions';
          } else if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: tmux not installed. If sessions exist, they will persist until system restart';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

      if (name === 'tmux_session_exists') {
        if (!args?.session_id) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: session_id is required',
              },
            ],
          };
        }

        try {
          const exists = await this.tmuxManager.sessionExists(args.session_id);
          
          return {
            content: [
              {
                type: 'text',
                text: `Session '${args.session_id}' ${exists ? 'exists' : 'does not exist'}`,
              },
            ],
          };
        } catch (error) {
          let errorText = `Error checking session: ${error.message}`;
          
          if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: Install tmux first to manage sessions';
          } else if (error.message.includes('No tmux server running')) {
            errorText += '\n\nRECOVERY: No tmux server running, so session does not exist';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

      if (name === 'tmux_session_info') {
        if (!args?.session_id) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: session_id is required',
              },
            ],
          };
        }

        try {
          const healthInfo = await this.tmuxManager.getSessionHealth(args.session_id);
          
          if (!healthInfo.exists) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Session '${args.session_id}' does not exist${healthInfo.error ? ': ' + healthInfo.error : ''}`,
                },
              ],
            };
          }

          let infoText = `Session Info: ${healthInfo.session_id}\n`;
          infoText += `Status: ${healthInfo.healthy ? 'Healthy' : 'Unhealthy'} (${healthInfo.health_status})\n`;
          infoText += `Purpose: ${healthInfo.purpose}\n`;
          infoText += `Age: ${healthInfo.age_minutes} minutes\n`;
          infoText += `Idle Time: ${healthInfo.idle_minutes} minutes\n`;
          infoText += `Commands Executed: ${healthInfo.command_count}\n`;
          infoText += `Working Directory: ${healthInfo.working_directory}\n`;
          infoText += `Last Health Check: ${healthInfo.last_health_check}\n`;
          
          if (healthInfo.needs_cleanup) {
            infoText += '\nRECOMMENDATION: Session has been idle for 30+ minutes and may be cleaned up automatically';
          }
          
          if (!healthInfo.healthy) {
            infoText += '\nWARNING: Session is marked as unhealthy and may need recreation';
          }

          return {
            content: [
              {
                type: 'text',
                text: infoText,
              },
            ],
          };
        } catch (error) {
          let errorText = `Error getting session info: ${error.message}`;
          
          if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: Install tmux first to manage sessions';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

      if (name === 'tmux_cleanup_sessions') {
        try {
          const cleanedSessions = await this.tmuxManager.performLifecycleCleanup();
          
          const resultText = cleanedSessions.length > 0 
            ? `Cleaned up ${cleanedSessions.length} sessions: ${cleanedSessions.join(', ')}`
            : 'No sessions required cleanup - all sessions are active and healthy';
          
          return {
            content: [
              {
                type: 'text',
                text: resultText,
              },
            ],
          };
        } catch (error) {
          let errorText = `Error during session cleanup: ${error.message}`;
          
          if (error.message.includes('tmux command not found')) {
            errorText += '\n\nRECOVERY: Install tmux first to manage sessions';
          }
          
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
          };
        }
      }

if (name === 'shell_exec_interactive') {
    const command = args.command;
    const sessionId = args.session_id || 'default';
    const waitMs = args.wait_ms || 100;
    
    const result = await this.commandExecutor.executeCommandWithCapture(
        command, sessionId, waitMs
    );
    
    return {
        content: [{ type: 'text', text: result.terminal_content }]
    };
}

if (name === 'tmux_send_input') {
    const input = args.input;
    const sessionId = args.session_id || 'default';
    const pressEnter = args.press_enter !== false;
    
    await this.tmuxManager.sendKeysToPane(sessionId, input, 0, pressEnter);
    
    // Capture result
    const capture = await this.tmuxManager.capturePaneContent(sessionId, 0);
    
    return {
        content: [{ type: 'text', text: capture.content }]
    };
}

if (name === 'tmux_capture_terminal') {
    const sessionId = args.session_id || 'default';
    const paneId = args.pane_id || 0;
    
    const capture = await this.tmuxManager.capturePaneContent(sessionId, paneId);
    
    return {
        content: [{ type: 'text', text: capture.content }]
    };
}
      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Tmux MCP Server running on stdio');
  }
}

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

export default TmuxMcpServer;
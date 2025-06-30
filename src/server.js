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
        version: '0.2.0',
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
            name: 'shell_exec',
            description: 'Execute a shell command and wait for it to complete. Provides a clean, interactive-like terminal view while ensuring reliable capture of the full output and exit code. This is the primary and most robust tool for command execution.',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'The shell command to execute.',
                },
                session_id: {
                  type: 'string',
                  description: 'A descriptive session identifier (e.g., \'frontend-dev\', \'database-work\'). A session will be created if it doesn\'t exist. Defaults to \'default\'.',
                  default: 'default',
                },
                timeout: {
                  type: 'number',
                  description: 'Command timeout in seconds. Increase for long operations like builds or installs. Defaults to 30s.',
                  default: 30,
                },
              },
              required: ['command'],
            },
          },
          {
            name: 'shell_exec_interactive',
            description: 'Starts a long-running or interactive command (e.g., a web server, REPL, or ssh session) and returns immediately. Use tmux_capture_terminal to monitor its output and tmux_send_input to interact with it.',
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The interactive command to start.' },
                    session_id: { type: 'string', default: 'default' },
                    wait_ms: { type: 'number', default: 250, description: 'Milliseconds to wait for initial output before returning. Increase for slow-starting commands.' }
                },
                required: ['command']
            }
          },
          {
            name: 'tmux_send_input',
            description: 'Send keystrokes to a running interactive command. Essential for responding to prompts (e.g., passwords, confirmations) or using REPLs. Use \'C-c\' to send a Ctrl+C sequence to stop a process.',
            inputSchema: {
                type: 'object', 
                properties: {
                    input: { type: 'string', description: 'Text or control sequence (e.g., \'C-c\') to send.' },
                    session_id: { type: 'string', default: 'default' },
                    press_enter: { type: 'boolean', default: true, description: 'Whether to press Enter after sending the input. Set to false for control sequences like \'C-c\'.' }
                },
                required: ['input']
            }
          },
          {
            name: 'tmux_capture_terminal',
            description: 'Capture and view the current content of a session window. Used to monitor running processes, check for new output, or see the current state of the terminal.',
            inputSchema: {
                type: 'object',
                properties: {
                    session_id: { type: 'string', default: 'default' },
                    window_name: { type: 'string', default: 'ui', description: 'The window to capture (either \'ui\' or \'exec\'). Defaults to \'ui\'.' }
                }
            }
          },
          {
            name: 'tmux_list_sessions',
            description: 'List all active tmux sessions managed by the server.',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'tmux_create_session',
            description: 'Explicitly create a new tmux session with the standard \'ui\' and \'exec\' windows. Not usually needed as other tools create sessions automatically.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'A unique and descriptive session identifier.',
                },
              },
            },
          },
          {
            name: 'tmux_destroy_session',
            description: 'Destroy a tmux session and all its windows, permanently removing its state and any running processes.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The identifier of the session to destroy.',
                },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'tmux_session_exists',
            description: 'Check if a tmux session is active and properly configured with \'ui\' and \'exec\' windows.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The session identifier to check.',
                },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'tmux_session_info',
            description: 'Get detailed health and lifecycle information about a tmux session, including its age, idle time, and command count.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The session identifier to inspect.',
                },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'tmux_cleanup_sessions',
            description: 'Perform intelligent cleanup of idle (30+ minutes) or unhealthy tmux sessions.',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'shell_exec') {
          const command = args.command || '';
          const sessionId = args.session_id || 'default';
          const timeout = args.timeout || 30;
          
          console.error(`Executing command '${command}' in session '${sessionId}'`);
          const result = await this.commandExecutor.executeCommand(command, sessionId, timeout);
          
          let responseText = `Session: ${result.session_id}\nWorking Directory: ${result.working_directory}\nExit Code: ${result.exit_code}\n\n--- OUTPUT ---\n${result.stdout || '(no output)'}`;
          if (result.stderr) {
              responseText += `\n\n--- STDERR ---\n${result.stderr}`;
          }
          return { content: [{ type: 'text', text: responseText }] };
        }

        if (name === 'shell_exec_interactive') {
            const command = args.command || '';
            const sessionId = args.session_id || 'default';
            const waitMs = args.wait_ms || 250;
            const result = await this.commandExecutor.executeCommandWithCapture(command, sessionId, waitMs);
            return { content: [{ type: 'text', text: result.terminal_content }] };
        }

        if (name === 'tmux_send_input') {
            const { input, session_id, press_enter } = args;
            await this.tmuxManager.sendKeysToWindow(session_id || 'default', 'exec', input, press_enter);
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for UI to update
            const capture = await this.tmuxManager.captureWindowContent(session_id || 'default', 'ui');
            return { content: [{ type: 'text', text: capture.content }] };
        }

        if (name === 'tmux_capture_terminal') {
            const sessionId = args.session_id || 'default';
            const windowName = args.window_name || 'ui';
            const capture = await this.tmuxManager.captureWindowContent(sessionId, windowName);
            return { content: [{ type: 'text', text: capture.content }] };
        }

        if (name === 'tmux_list_sessions') {
          const sessions = await this.tmuxManager.listSessions();
          const text = sessions.length > 0 ? `Active tmux sessions:\n- ${sessions.join('\n- ')}` : 'No active tmux sessions.';
          return { content: [{ type: 'text', text }] };
        }

        if (name === 'tmux_create_session') {
          const sessionId = await this.tmuxManager.createSession(args?.session_id);
          return { content: [{ type: 'text', text: `Created tmux session: ${sessionId}` }] };
        }

        if (name === 'tmux_destroy_session') {
          const success = await this.tmuxManager.destroySession(args.session_id);
          const text = success ? `Destroyed session: ${args.session_id}` : `Failed to destroy session: ${args.session_id}`;
          return { content: [{ type: 'text', text }] };
        }

        if (name === 'tmux_session_exists') {
          const exists = await this.tmuxManager.sessionExists(args.session_id);
          return { content: [{ type: 'text', text: `Session '${args.session_id}' ${exists ? 'exists and is properly configured' : 'does not exist or is misconfigured'}` }] };
        }

        if (name === 'tmux_session_info') {
          const info = await this.tmuxManager.getSessionHealth(args.session_id);
          if (!info.exists) {
            return { content: [{ type: 'text', text: `Session '${args.session_id}' does not exist.` }] };
          }
          const infoText = [
            `Session Info: ${info.session_id}`,
            `Status: ${info.healthy ? 'Healthy' : 'Unhealthy'} (${info.health_status})`,
            `Purpose: ${info.purpose}`,
            `Age: ${info.age_minutes} minutes`,
            `Idle Time: ${info.idle_minutes} minutes`,
            `Commands Executed: ${info.command_count}`,
            `Working Directory: ${info.working_directory}`,
            info.needs_cleanup ? 'RECOMMENDATION: Session is idle and may be cleaned up.' : ''
          ].filter(Boolean).join('\n');
          return { content: [{ type: 'text', text: infoText }] };
        }

        if (name === 'tmux_cleanup_sessions') {
          const cleaned = await this.tmuxManager.performLifecycleCleanup();
          const text = cleaned.length > 0 ? `Cleaned up ${cleaned.length} idle/unhealthy sessions: ${cleaned.join(', ')}` : 'No sessions required cleanup.';
          return { content: [{ type: 'text', text }] };
        }

      } catch (error) {
        console.error(`Error handling tool '${name}':`, error);
        let errorText = `Error: ${error.message}`;
        if (error.message.includes('tmux is not installed')) {
            errorText += '\n\nRECOVERY: Please install tmux on the system.';
        } else if (error.message.includes('Session not found')) {
            errorText += '\n\nRECOVERY: The session may have been destroyed or never existed. Use tmux_list_sessions to check.';
        }
        return { content: [{ type: 'text', text: errorText }] };
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

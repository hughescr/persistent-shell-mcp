#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import TmuxManager from './tmux-manager.js';

class TmuxMcpServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tmux-mcp-server',
        version: '1.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tmuxManager = new TmuxManager();

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'execute_command',
            description: 'Execute a shell command in the background \'exec\' window and return the output.',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'The shell command to execute',
                },
                workspace_id: {
                  type: 'string',
                  description: 'Workspace identifier. Defaults to "default"',
                  default: 'default',
                },
              },
              required: ['command'],
            },
          },
          {
            name: 'start_process',
            description: 'Start a long-running or interactive process. Defaults to the background `exec` window, but can target the `ui` window for interactive applications.',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string', description: 'Command to start' },
                workspace_id: { type: 'string', default: 'default' },
                target_window: {
                  type: 'string',
                  description: 'Window to run in: \'ui\' for interactive apps, \'exec\' for background processes. Example: `target_window: \'ui\'` to run \'vim\' visibly.',
                  default: 'exec'
                },
              },
              required: ['command']
            }
          },
          {
            name: 'get_output',
            description: 'Get current terminal output. Defaults to the `ui` window (what the user sees), but can check the `exec` window for background process status.',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { type: 'string', default: 'default' },
                window_name: {
                  type: 'string',
                  description: 'Window to capture: \'ui\' for user view, \'exec\' for background tasks. Example: `window_name: \'exec\'` to check a background build.',
                  default: 'ui'
                },
              }
            }
          },
          {
            name: 'send_input',
            description: 'Send input to a running process in a specified window.',
            inputSchema: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Text to send' },
                workspace_id: { type: 'string', default: 'default' },
                target_window: {
                  type: 'string',
                  description: 'Window to send input to: \'ui\' or \'exec\'.',
                  default: 'exec'
                },
              },
              required: ['text']
            }
          },
          {
            name: 'stop_process',
            description: 'Stop the currently running process in the exec window (sends Ctrl+C).',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { type: 'string', default: 'default' },
              }
            }
          },
          {
            name: 'create_workspace',
            description: 'Create a new isolated workspace for commands.',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { type: 'string', description: 'Unique workspace identifier' },
              },
              required: ['workspace_id']
            },
          },
          {
            name: 'destroy_workspace',
            description: 'Destroy a workspace and all its processes.',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { type: 'string', description: 'Workspace to destroy' },
              },
              required: ['workspace_id']
            },
          },
          {
            name: 'list_workspaces',
            description: 'List all active workspaces.',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'execute_command') {
          const { command, workspace_id } = args;
          await this.tmuxManager.createSession(workspace_id);
          await this.tmuxManager.sendKeys(workspace_id, 'exec', command, true);
          await new Promise(resolve => setTimeout(resolve, 500));
          const output = await this.tmuxManager.capturePane(workspace_id, 'exec');
          return { content: [{ type: 'text', text: output }] };
        }

        if (name === 'start_process') {
          const { command, workspace_id, target_window } = args;
          await this.tmuxManager.createSession(workspace_id);
          await this.tmuxManager.sendKeys(workspace_id, target_window, command, true);
          return { content: [{ type: 'text', text: `Process started in ${target_window}.` }] };
        }

        if (name === 'get_output') {
          const { workspace_id, window_name } = args;
          const output = await this.tmuxManager.capturePane(workspace_id, window_name);
          return { content: [{ type: 'text', text: output }] };
        }

        if (name === 'send_input') {
          const { text, workspace_id, target_window } = args;
          await this.tmuxManager.sendKeys(workspace_id, target_window, text, true);
          return { content: [{ type: 'text', text: `Input sent to ${target_window}.` }] };
        }

        if (name === 'stop_process') {
          const { workspace_id } = args;
          await this.tmuxManager.interrupt(workspace_id, 'exec');
          return { content: [{ type: 'text', text: 'Sent Ctrl+C to exec window.' }] };
        }

        if (name === 'create_workspace') {
          const { workspace_id } = args;
          await this.tmuxManager.createSession(workspace_id);
          return { content: [{ type: 'text', text: `Created workspace: ${workspace_id}` }] };
        }

        if (name === 'destroy_workspace') {
          const { workspace_id } = args;
          await this.tmuxManager.destroySession(workspace_id);
          return { content: [{ type: 'text', text: `Destroyed workspace: ${workspace_id}` }] };
        }

        if (name === 'list_workspaces') {
          const sessions = await this.tmuxManager.listSessions();
          const text = sessions.length > 0 ? `Active workspaces:\n- ${sessions.join('\n- ')}` : 'No active workspaces.';
          return { content: [{ type: 'text', text }] };
        }

      } catch (error) {
        console.error(`Error handling tool '${name}':`, error);
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
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

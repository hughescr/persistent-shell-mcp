#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import TmuxManager from './tmux-manager.js';

class TmuxMcpServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tmux-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.tmuxManager = new TmuxManager();

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'run_command',
            description: 'Start a command in a tmux window and return immediately. To stop a running command, use send_keys with ["C-c"].',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'The shell command to run',
                },
                workspace_id: {
                  type: 'string',
                  description: 'Workspace identifier',
                  default: 'default',
                },
                window_name: {
                  type: 'string',
                  description: 'Window name',
                  default: 'main',
                },
              },
              required: ['command'],
            },
          },
          {
            name: 'get_output',
            description: 'Capture terminal output. Use either lines mode OR search mode, not both.',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { 
                  type: 'string', 
                  description: 'Workspace identifier',
                  default: 'default' 
                },
                window_name: {
                  type: 'string',
                  description: 'Window name',
                  default: 'main'
                },
                lines: {
                  type: 'integer',
                  description: 'Number of scrollback lines to capture (optional, defaults to visible screen)',
                },
                search: {
                  type: 'object',
                  description: 'Search for patterns in output (cannot be used with lines)',
                  properties: {
                    pattern: {
                      type: 'string',
                      description: 'JavaScript regex pattern (no delimiters, e.g., "error|warning")'
                    },
                    context_lines: {
                      type: 'integer',
                      description: 'Lines before/after matches',
                      default: 2
                    },
                    include_line_numbers: {
                      type: 'boolean',
                      description: 'Include absolute line numbers from scrollback top',
                      default: true
                    }
                  },
                  required: ['pattern']
                }
              }
            }
          },
          {
            name: 'send_input',
            description: 'Send text to a window (automatically appends Enter).',
            inputSchema: {
              type: 'object',
              properties: {
                text: { 
                  type: 'string', 
                  description: 'Text to send' 
                },
                workspace_id: { 
                  type: 'string',
                  description: 'Workspace identifier', 
                  default: 'default' 
                },
                window_name: {
                  type: 'string',
                  description: 'Target window',
                  default: 'main'
                },
              },
              required: ['text']
            }
          },
          {
            name: 'send_keys',
            description: 'Send key sequences using tmux syntax. Common keys: C-c (interrupt), C-d (EOF), C-z (suspend), Up/Down/Left/Right, Enter, Tab, Escape.',
            inputSchema: {
              type: 'object',
              properties: {
                keys: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of keys to send. Examples: ["C-c"] for Ctrl+C, ["Up", "Enter"] for up arrow then enter'
                },
                workspace_id: { 
                  type: 'string',
                  description: 'Workspace identifier',
                  default: 'default' 
                },
                window_name: {
                  type: 'string',
                  description: 'Target window',
                  default: 'main'
                },
              },
              required: ['keys']
            }
          },
          {
            name: 'create_workspace',
            description: 'Create a new workspace with a "main" window.',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { 
                  type: 'string', 
                  description: 'Unique workspace identifier' 
                },
              },
              required: ['workspace_id']
            },
          },
          {
            name: 'destroy_workspace',
            description: 'Destroy a workspace and all its windows.',
            inputSchema: {
              type: 'object',
              properties: {
                workspace_id: { 
                  type: 'string', 
                  description: 'Workspace to destroy' 
                },
              },
              required: ['workspace_id']
            },
          },
          {
            name: 'list_workspaces',
            description: 'List all active workspaces and their windows.',
            inputSchema: { 
              type: 'object', 
              properties: {} 
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'run_command') {
          const { command, workspace_id = 'default', window_name = 'main' } = args;
          await this.tmuxManager.createSession(workspace_id);
          await this.tmuxManager.sendKeys(workspace_id, window_name, [...command, 'C-m']);
          return { content: [{ type: 'text', text: `Started command in ${workspace_id}:${window_name}` }] };
        }

        if (name === 'get_output') {
          const { workspace_id = 'default', window_name = 'main', lines, search } = args;
          
          // Validate that both lines and search aren't specified
          if (lines !== undefined && search !== undefined) {
            return { content: [{ type: 'text', text: 'Error: Cannot specify both lines and search' }] };
          }

          let output;
          if (lines !== undefined) {
            // Lines mode
            output = await this.tmuxManager.capturePane(workspace_id, window_name, lines);
          } else {
            // Get all output for search or default mode
            output = await this.tmuxManager.capturePane(workspace_id, window_name);
          }

          // If search mode, apply search
          if (search) {
            const searchResult = this.searchOutput(output, search);
            return { content: [{ type: 'text', text: searchResult }] };
          }

          return { content: [{ type: 'text', text: output }] };
        }

        if (name === 'send_input') {
          const { text, workspace_id = 'default', window_name = 'main' } = args;
          await this.tmuxManager.sendKeys(workspace_id, window_name, [...text, 'C-m']);
          return { content: [{ type: 'text', text: `Sent input to ${workspace_id}:${window_name}` }] };
        }

        if (name === 'send_keys') {
          const { keys, workspace_id = 'default', window_name = 'main' } = args;
          await this.tmuxManager.sendKeys(workspace_id, window_name, keys);
          return { content: [{ type: 'text', text: `Sent keys to ${workspace_id}:${window_name}` }] };
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
          const workspaces = await this.tmuxManager.listWorkspaces();
          const text = workspaces.length > 0 
            ? workspaces.map(ws => `${ws.workspace_id}: ${ws.windows.join(', ')}`).join('\n')
            : 'No active workspaces.';
          return { content: [{ type: 'text', text }] };
        }

      } catch (error) {
        console.error(`Error handling tool '${name}':`, error);
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  searchOutput(output, searchOptions) {
    const { pattern, context_lines = 2, include_line_numbers = true } = searchOptions;
    
    try {
      const regex = new RegExp(pattern, 'g');
      const lines = output.split('\n');
      const matches = [];
      const matchedLines = new Set();

      // Find all matching lines
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          // Add context lines
          for (let i = Math.max(0, index - context_lines); 
               i <= Math.min(lines.length - 1, index + context_lines); 
               i++) {
            matchedLines.add(i);
          }
        }
        // Reset regex lastIndex for next line
        regex.lastIndex = 0;
      });

      // Build result with grouping
      const sortedLines = Array.from(matchedLines).sort((a, b) => a - b);
      let lastLine = -1;
      let currentGroup = [];

      sortedLines.forEach(lineNum => {
        if (lastLine >= 0 && lineNum - lastLine > 1) {
          // Gap detected, flush current group
          matches.push(currentGroup.join('\n'));
          currentGroup = [];
        }
        
        const lineContent = lines[lineNum];
        const lineStr = include_line_numbers 
          ? `${lineNum + 1}: ${lineContent}`
          : lineContent;
        currentGroup.push(lineStr);
        lastLine = lineNum;
      });

      // Flush last group
      if (currentGroup.length > 0) {
        matches.push(currentGroup.join('\n'));
      }

      return matches.join('\n---\n') || 'No matches found';
    } catch (error) {
      return `Search error: ${error.message}`;
    }
  }

  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'tmux://keys-reference',
            name: 'Tmux Keys Reference',
            description: 'Common tmux key sequences and their meanings',
            mimeType: 'text/plain',
          },
          {
            uri: 'tmux://common-patterns', 
            name: 'Common Tmux Patterns',
            description: 'Common usage patterns and examples',
            mimeType: 'text/plain',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'tmux://keys-reference') {
        return {
          contents: [{
            uri: 'tmux://keys-reference',
            mimeType: 'text/plain',
            text: `Common tmux key sequences:

Control keys:
- C-c: Interrupt process (SIGINT)
- C-d: End of input (EOF)
- C-z: Suspend process (SIGTSTP)
- C-\\: Quit process (SIGQUIT)

Navigation keys:
- Up, Down, Left, Right: Arrow keys
- PageUp, PageDown: Page navigation
- Home, End: Line navigation

Other keys:
- Enter: Return key (can also use C-m)
- Tab: Tab completion
- Escape: Escape key
- Space: Space bar
- BSpace: Backspace

Examples:
- To stop a running process: send_keys(['C-c'])
- To navigate command history: send_keys(['Up', 'Up', 'Enter'])
- To send EOF to close input: send_keys(['C-d'])
- To background a process: send_keys(['C-z'])`,
          }],
        };
      }

      if (uri === 'tmux://common-patterns') {
        return {
          contents: [{
            uri: 'tmux://common-patterns',
            mimeType: 'text/plain', 
            text: `Common tmux usage patterns:

Running a command:
1. Use run_command to start the command
2. Use get_output to check the output
3. Use send_keys(['C-c']) to stop if needed

Interactive sessions:
1. Start with run_command (e.g., 'python3', 'node', 'mysql')
2. Use send_input to send commands
3. Use get_output to see results
4. Use send_keys(['C-d']) or send_input('exit') to quit

Monitoring long-running processes:
1. Start with run_command (e.g., 'npm run dev', 'docker compose up')
2. Periodically use get_output to check status
3. Use send_keys(['C-c']) to stop when done

Searching output:
1. Use get_output with search parameter
2. Pattern uses JavaScript regex syntax (no delimiters)
3. Example: search: { pattern: "error|warning", context_lines: 3 }

Managing multiple tasks:
1. Create different workspaces for different projects
2. Use window_name to organize related commands
3. Use list_workspaces to see what's running`,
          }],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
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
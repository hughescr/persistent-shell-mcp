import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import _ from 'lodash';

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

        // Set up handlers - they'll wait for initialization internally
        this.setupToolHandlers();
        this.setupResourceHandlers();
    }

    getToolDefinitions() {
        const tools = [];
        const useParentSession = this.tmuxManager.isUsingParentSession;

        // Helper to create schema with optional workspace_id
        const createSchema = (properties, required = []) => {
            const schema = {
                type: 'object',
                properties: { ...properties },
                required: [...required]
            };

            // Add workspace_id only if not using parent session
            if(!useParentSession) {
                schema.properties.workspace_id = {
                    type: 'string',
                    description: 'Workspace identifier',
                    'default': 'default'
                };
            }

            return schema;
        };

        // Tools that work with or without parent session
        tools.push({
            name: 'run_command',
            description: 'Start a command in a tmux window and return immediately. To stop a running command, use send_keys with ["C-c"].',
            inputSchema: createSchema({
                command: {
                    type: 'string',
                    description: 'The shell command to run',
                },
                window_name: {
                    type: 'string',
                    description: 'Window name',
                    'default': 'main',
                },
            }, ['command'])
        });

        tools.push({
            name: 'get_output',
            description: 'Capture terminal output. Use either lines mode OR search mode, not both.',
            inputSchema: createSchema({
                window_name: {
                    type: 'string',
                    description: 'Window name',
                    'default': 'main'
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
                            'default': 2
                        },
                        include_line_numbers: {
                            type: 'boolean',
                            description: 'Include absolute line numbers from scrollback top',
                            'default': true
                        }
                    },
                    required: ['pattern']
                }
            })
        });

        tools.push({
            name: 'send_input',
            description: 'Send text to a window (automatically appends Enter).',
            inputSchema: createSchema({
                text: {
                    type: 'string',
                    description: 'Text to send'
                },
                window_name: {
                    type: 'string',
                    description: 'Target window',
                    'default': 'main'
                },
            }, ['text'])
        });

        tools.push({
            name: 'send_keys',
            description: 'Send key sequences using tmux syntax. Common keys: C-c (interrupt), C-d (EOF), C-z (suspend), Up/Down/Left/Right, Enter, Tab, Escape.',
            inputSchema: createSchema({
                keys: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of keys to send. Examples: ["C-c"] for Ctrl+C, ["Up", "Enter"] for up arrow then enter'
                },
                window_name: {
                    type: 'string',
                    description: 'Target window',
                    'default': 'main'
                },
            }, ['keys'])
        });

        // Workspace management tools - only add if NOT using parent session
        if(!useParentSession) {
            tools.push({
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
            });

            tools.push({
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
            });
        }

        // List workspaces always available but behaves differently
        tools.push({
            name: 'list_workspaces',
            description: useParentSession
                ? 'List windows in the current tmux session.'
                : 'List all active workspaces and their windows.',
            inputSchema: {
                type: 'object',
                properties: {}
            },
        });

        return tools;
    }

    getResourceDefinitions() {
        return [
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
        ];
    }

    async handleRunCommand(args) {
        const isParentSession = this.tmuxManager.isUsingParentSession;
        const { command, workspace_id = 'default', window_name = 'main' } = args;
        const sessionId = isParentSession ? 'default' : workspace_id;

        await this.tmuxManager.createSession(sessionId);
        await this.tmuxManager.sendKeys(sessionId, window_name, [...command, 'C-m']);

        const location = isParentSession ? window_name : `${workspace_id}:${window_name}`;
        return { content: [{ type: 'text', text: `Started command in ${location}` }] };
    }

    async handleGetOutput(args) {
        const isParentSession = this.tmuxManager.isUsingParentSession;
        const { workspace_id = 'default', window_name = 'main', lines, search } = args;
        const sessionId = isParentSession ? 'default' : workspace_id;

        // Validate that both lines and search aren't specified
        if(lines !== undefined && search !== undefined) {
            return { content: [{ type: 'text', text: 'Error: Cannot specify both lines and search' }] };
        }

        let output;
        if(lines !== undefined) {
            // Lines mode
            output = await this.tmuxManager.capturePane(sessionId, window_name, lines);
        } else {
            // Get all output for search or default mode
            output = await this.tmuxManager.capturePane(sessionId, window_name);
        }

        // If search mode, apply search
        if(search) {
            const searchResult = this.searchOutput(output, search);
            return { content: [{ type: 'text', text: searchResult }] };
        }

        return { content: [{ type: 'text', text: output }] };
    }

    async handleSendInput(args) {
        const isParentSession = this.tmuxManager.isUsingParentSession;
        const { text, workspace_id = 'default', window_name = 'main' } = args;
        const sessionId = isParentSession ? 'default' : workspace_id;

        await this.tmuxManager.sendKeys(sessionId, window_name, [...text, 'C-m']);

        const location = isParentSession ? window_name : `${workspace_id}:${window_name}`;
        return { content: [{ type: 'text', text: `Sent input to ${location}` }] };
    }

    async handleSendKeys(args) {
        const isParentSession = this.tmuxManager.isUsingParentSession;
        const { keys, workspace_id = 'default', window_name = 'main' } = args;
        const sessionId = isParentSession ? 'default' : workspace_id;

        await this.tmuxManager.sendKeys(sessionId, window_name, keys);

        const location = isParentSession ? window_name : `${workspace_id}:${window_name}`;
        return { content: [{ type: 'text', text: `Sent keys to ${location}` }] };
    }

    async handleCreateWorkspace(args) {
        const { workspace_id } = args;
        await this.tmuxManager.createSession(workspace_id);
        return { content: [{ type: 'text', text: `Created workspace: ${workspace_id}` }] };
    }

    async handleDestroyWorkspace(args) {
        const { workspace_id } = args;
        await this.tmuxManager.destroySession(workspace_id);
        return { content: [{ type: 'text', text: `Destroyed workspace: ${workspace_id}` }] };
    }

    async handleListWorkspaces() {
        const isParentSession = this.tmuxManager.isUsingParentSession;

        if(isParentSession) {
            const windows = await this.tmuxManager.listWindows('default');
            const text = windows.length > 0
                ? `Windows in current session: ${windows.join(', ')}`
                : 'No windows in current session.';
            return { content: [{ type: 'text', text }] };
        }

        const workspaces = await this.tmuxManager.listWorkspaces();
        const text = workspaces.length > 0
            ? _.map(workspaces, ws => `${ws.workspace_id}: ${ws.windows.join(', ')}`).join('\n')
            : 'No active workspaces.';
        return { content: [{ type: 'text', text }] };
    }

    async handleToolCall(name, args) {
        try {
            // Workspace tools are not available when using parent session
            if(this.tmuxManager.isUsingParentSession &&
              (name === 'create_workspace' || name === 'destroy_workspace')) {
                return { content: [{ type: 'text', text: 'Error: Workspace management not available when using parent tmux session' }] };
            }

            switch(name) {
                case 'run_command':
                    return await this.handleRunCommand(args);
                case 'get_output':
                    return await this.handleGetOutput(args);
                case 'send_input':
                    return await this.handleSendInput(args);
                case 'send_keys':
                    return await this.handleSendKeys(args);
                case 'create_workspace':
                    return await this.handleCreateWorkspace(args);
                case 'destroy_workspace':
                    return await this.handleDestroyWorkspace(args);
                case 'list_workspaces':
                    return await this.handleListWorkspaces();
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch(error) {
            console.error(`Error handling tool '${name}':`, error);
            return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
        }
    }

    getResourceContent(uri) {
        if(uri === 'tmux://keys-reference') {
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

        if(uri === 'tmux://common-patterns') {
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
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            await this.tmuxManager.ensureInitialized();
            return { tools: this.getToolDefinitions() };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            await this.tmuxManager.ensureInitialized();
            const { name, arguments: args } = request.params;
            return await this.handleToolCall(name, args);
        });
    }

    searchOutput(output, searchOptions) {
        const { pattern, context_lines = 2, include_line_numbers = true } = searchOptions;

        try {
            const regex = new RegExp(pattern, 'g');
            const lines = _.split(output, '\n');
            const matches = [];
            const matchedLines = new Set();

            // Find all matching lines
            _.forEach(lines, (line, index) => {
                if(regex.test(line)) {
                    // Add context lines
                    for(let i = Math.max(0, index - context_lines);
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

            _.forEach(sortedLines, (lineNum) => {
                if(lastLine >= 0 && lineNum - lastLine > 1) {
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
            if(currentGroup.length > 0) {
                matches.push(currentGroup.join('\n'));
            }

            return matches.join('\n---\n') || 'No matches found';
        } catch(error) {
            return `Search error: ${error.message}`;
        }
    }

    setupResourceHandlers() {
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            return { resources: this.getResourceDefinitions() };
        });

        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            return this.getResourceContent(uri);
        });
    }

    async run() {
    // Ensure initialization is complete before starting
        await this.tmuxManager.ensureInitialized();

        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Tmux MCP Server running on stdio');
    }
}

async function main() {
    const server = new TmuxMcpServer();
    await server.run();
}

if(import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('Failed to start server:', error);
        throw error;
    });
}

export default TmuxMcpServer;

# Basic project information

## Project Overview

This is a Model Context Protocol (MCP) server that provides persistent shell execution through tmux sessions. It enables AI assistants to execute commands in persistent shell environments with flexible window management.

## Key Architecture

### Core Components

- **server.js**: Main MCP server implementation with tool definitions and resource handlers
- **tmux-manager.js**: Handles all tmux session and window management
- **index.js**: Entry point that initializes and runs the server

### Simplified Design

Each workspace is a tmux session that can contain multiple named windows:
- Workspaces provide isolation between different projects
- Windows organize related commands within a workspace
- All commands run asynchronously without blocking

## Development Commands

### Running the Server

```bash
# Start the MCP server
bun start
# or
./bin/tmux-mcp-server
```

### Installation from Source

```bash
bun install
bun link
```

## Available MCP Tools

1. **run_command**: Start a command and return immediately
2. **get_output**: Capture terminal output (with optional search)
3. **send_input**: Send text to running processes (auto-appends Enter)
4. **send_keys**: Send special key sequences (Ctrl+C, arrow keys, etc.)
5. **create_workspace**: Create new isolated workspace
6. **destroy_workspace**: Destroy workspace and all windows
7. **list_workspaces**: List all active workspaces and their windows

## Available MCP Resources

1. **tmux://keys-reference**: Common tmux key sequences and meanings
2. **tmux://common-patterns**: Usage patterns and examples

## Important Implementation Details

- All tmux operations are handled through `_runTmuxCommand` in tmux-manager.js
- Session names are stored with "-MCP" suffix for identification
- Default timeout for tmux commands is 10 seconds
- Each workspace starts with a "main" window
- Windows are created automatically when referenced
- The server uses Node.js ESM modules (type: "module" in package.json)
- Search uses JavaScript regex syntax without delimiters
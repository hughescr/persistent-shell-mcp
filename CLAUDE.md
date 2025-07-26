# Basic project information

## Project Overview

This is a Model Context Protocol (MCP) server that provides persistent shell execution through tmux sessions. It enables AI assistants to execute commands in persistent shell environments with dual-window architecture for clean UI management.

## Key Architecture

### Core Components

- **server.js**: Main MCP server implementation with tool definitions
- **tmux-manager.js**: Handles all tmux session and window management
- **index.js**: Entry point that initializes and runs the server

### Dual-Window Design

Each workspace has two tmux windows:
- `exec` window: Raw shell for command execution and background processes
- `ui` window: Clean output display for interactive applications

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

1. **execute_command**: Execute commands that complete quickly and return output
2. **start_process**: Start long-running or interactive processes
3. **get_output**: Capture current terminal output from either window
4. **send_input**: Send input to running processes
5. **stop_process**: Stop running process (sends Ctrl+C)
6. **create_workspace**: Create new isolated workspace
7. **destroy_workspace**: Destroy workspace and all processes
8. **list_workspaces**: List all active workspaces

## Important Implementation Details

- All tmux operations are handled through `_runTmuxCommand` in tmux-manager.js
- Session names are stored with "-MCP" suffix for identification
- Default timeout for commands is 10 seconds
- Each workspace maintains independent working directories
- The server uses Node.js ESM modules (type: "module" in package.json)

**This is experimental software intended for testing and development purposes only. Do not use in production environments or with sensitive data.**

A Model Context Protocol (MCP) server that provides persistent shell execution through tmux sessions. This server enables AI assistants to execute commands in persistent shells that maintain state across multiple interactions.

## Table of Contents

- [Fork Acknowledgment](#fork-acknowledgment)
- [Features](#features)
- [Installation](#installation)
- 🚨🚨[Security](#security)🚨🚨
- [Usage](#usage)
- [Available Tools](#available-tools)
- [Available Resources](#available-resources)
- [Scrollback Buffer Management](#scrollback-buffer-management)
- [Examples](#examples)
- [Common Workflows](#common-workflows)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Fork Acknowledgment

This project is a fork of the original [persistent-shell-mcp](https://github.com/TNTisdial/persistent-shell-mcp) by TNTisdial. The fork has been enhanced with parent tmux session detection and other improvements.

## Features

- **Persistent Shell Sessions**: Execute commands in tmux sessions that persist across MCP client restarts
- **Multiple Workspaces**: Create isolated workspaces for different projects or tasks
- **Flexible Window Management**: Organize commands in named windows within workspaces
- **Interactive Process Support**: Handle long-running processes, REPLs, and interactive commands
- **Output Search**: Search through terminal output with regex patterns and context
- **Non-blocking Execution**: All commands run asynchronously, allowing parallel operations
- **Parent Session Detection**: When started from within tmux, automatically uses the parent session instead of creating new ones

## Installation

**🚨 SECURITY WARNING: This software allows AI assistants to execute arbitrary shell commands on your system. Only install and use in isolated testing environments. Never use on systems with sensitive data or in production environments.**

### Prerequisites

- Node.js 18.0.0 or higher (I use bun myself)
- tmux installed on your system
  - Ubuntu/Debian: `sudo apt install tmux`
  - macOS: `brew install tmux`
  - CentOS/RHEL: `sudo yum install tmux`

## Security

**⚠️ IMPORTANT SECURITY NOTICE ⚠️**

This MCP server executes arbitrary shell commands with your user privileges. Please review the comprehensive security documentation before use:

**[📋 Read SECURITY.md](SECURITY.md)** - Complete security guide covering:
- Security risks and threat model
- Input validation and command injection prevention
- Workspace isolation and access controls
- Secure deployment practices
- Monitoring and incident response
- Best practices for safe usage

Key security considerations:
- Commands run with full user privileges
- No built-in sandboxing or command filtering
- All command output is accessible
- File system and network access available
- Resource exhaustion possible

**Recommended for security-conscious users:**
- Use dedicated user accounts with limited privileges
- Deploy in containers or isolated environments
- Implement monitoring and logging
- Review all commands before execution
- Avoid use with sensitive data or production systems

## Usage

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "tmux-shell": {
      "command": "bunx",
      "args": ["--bunx", "@hughescr/tmux-mcp-server"]
    }
  }
}
```

or if you prefer npm/npx:

```json
{
  "mcpServers": {
    "tmux-shell": {
      "command": "npx",
      "args": ["@hughescr/tmux-mcp-server"]
    }
  }
}
```

## Available Tools

### Quick Reference

| Tool Name | Description | Link to Section |
|-----------|-------------|-----------------|
| `run_command` | Start a command in a tmux window and return immediately | [run_command](#run_command) |
| `get_output` | Capture terminal output with lines or search mode | [get_output](#get_output) |
| `send_input` | Send text to a window (automatically appends Enter) | [send_input](#send_input) |
| `send_keys` | Send special key sequences using tmux syntax | [send_keys](#send_keys) |
| `scrollback_size` | Get or set scrollback buffer size for workspace/session | [scrollback_size](#scrollback_size) |
| `create_workspace` | Create a new workspace with a "main" window | [create_workspace](#create_workspace) |
| `destroy_workspace` | Destroy a workspace and all its windows | [destroy_workspace](#destroy_workspace) |
| `list_workspaces` | List all active workspaces and their windows | [list_workspaces](#list_workspaces) |

### `run_command`
Start a command in a tmux window and return immediately.

```javascript
run_command({
  command: "npm run dev",
  workspace_id: "my-project",  // optional, defaults to "default" - workspace_id not available if MCP server running inside tmux already
  window_name: "server"        // optional, defaults to "main"
})
```

To stop a running command, use `send_keys` with `["C-c"]`.

### `get_output`
Capture terminal output with two modes:

**Lines mode** - Get a specific number of lines:
```javascript
get_output({
  workspace_id: "my-project", // workspace_id not available if MCP server running inside tmux already
  window_name: "server",
  lines: 50  // optional, defaults to all scrollback history
})
```

**Search mode** - Search for patterns in output:
```javascript
get_output({
  workspace_id: "my-project", // workspace_id not available if MCP server running inside tmux already
  window_name: "server",
  search: {
    pattern: "error|warning",     // JavaScript regex (no delimiters)
    context_lines: 2,            // lines before/after matches (default: 2)
    include_line_numbers: true   // include absolute line numbers (default: true)
  }
})
```

### `send_input`
Send text to a window (automatically appends Enter).

```javascript
send_input({
  text: "print('Hello, World!')",
  workspace_id: "my-project", // workspace_id not available if MCP server running inside tmux already
  window_name: "python"
})
```

### `send_keys`
Send special key sequences using tmux syntax.

```javascript
send_keys({
  keys: ["C-c"],  // Ctrl+C to interrupt
  workspace_id: "my-project", // workspace_id not available if MCP server running inside tmux already
  window_name: "server"
})
```

Common keys: `C-c` (interrupt), `C-d` (EOF), `Up`/`Down` (history), `Tab` (completion)

### `create_workspace`
Create a new workspace with a "main" window.

```javascript
create_workspace({ // tool not available if MCP server running inside tmux already
  workspace_id: "new-project"
})
```

### `destroy_workspace`
Destroy a workspace and all its windows.

```javascript
destroy_workspace({ // tool not available if MCP server running inside tmux already
  workspace_id: "old-project"
})
```

### `list_workspaces`
List all active workspaces and their windows.

```javascript
list_workspaces() // If MCP server running inside tmux already, only lists the windows of the current session
// Returns: "project1: main, server, database\nproject2: main"
```

### `scrollback_size`
Get or set the scrollback buffer size for the entire workspace/session. This setting only applies to NEW windows created AFTER the change - existing windows keep their original scrollback size.

```javascript
// Get current scrollback size
scrollback_size({
  workspace_id: "my-project" // workspace_id not available if MCP server running inside tmux already
})

// Set new scrollback size for future windows
scrollback_size({
  workspace_id: "my-project", // workspace_id not available if MCP server running inside tmux already
  lines: 10000  // Set to 10,000 lines, or 0 for unlimited (use with caution)
})
```

## Available Resources

The server provides two MCP resources with helpful reference information:

### `tmux://keys-reference`
Common tmux key sequences and their meanings, including:
- Control keys (C-c, C-d, C-z)
- Navigation keys (arrows, page up/down)
- Other special keys

### `tmux://common-patterns`
Common usage patterns and examples for:
- Running commands
- Interactive sessions
- Monitoring long-running processes
- Searching output
- Managing multiple tasks

## Scrollback Buffer Management

Scrollback buffers store terminal history and are managed per-session in tmux. The `scrollback_size` tool sets the session-level `history-limit` option which controls the buffer size for NEW windows created after the setting is changed. Existing windows keep their original scrollback size and cannot be modified. The MCP server automatically sets workspaces to 50,000 lines of history (compared to tmux's default of 2,000 lines) to provide more context for AI assistants.

### Memory Usage Estimates

| Buffer Size | Memory per 80-column window | Notes |
|-------------|----------------------------|-------|
| 2,000 lines | ~1 MB | tmux default |
| 10,000 lines | ~5 MB | More limited memory consumption |
| 50,000 lines | ~24 MB | MCP server default |
| 250,000 lines | ~120 MB | Very long-running or verbose processes |

**Important considerations:**
- The `scrollback_size` tool sets the session-level `history-limit` option
- This setting only affects NEW windows created AFTER the change
- Existing windows keep their original scrollback size and cannot be modified
- You must set the scrollback size BEFORE creating windows that need larger buffers
- Every window carries its own ring buffer in memory
- Plain ASCII text uses approximately 0.5 kB per 80-column line
- Rich content (colored Unicode, complex formatting) can use up to 4x more memory
- Setting lines to 0 means unlimited scrollback (use with caution on long-running processes)

### Practical Recommendations

**For development work:** 10,000-50,000 lines provides good context without excessive memory usage.

**For log monitoring:** Consider lower values (2,000-5,000 lines) if monitoring high-volume logs.

**For interactive workspaces:** Higher values (50,000+ lines) help maintain context across long sessions.

### Examples

```javascript
// Check current scrollback size for workspace
scrollback_size({ workspace_id: "my-project" })

// Set conservative size for future windows in workspace (do this BEFORE creating windows)
scrollback_size({
  workspace_id: "my-project",
  lines: 2000
})
// Now create windows that will use the 2000-line buffer
run_command({ command: "tail -f /var/log/nginx/access.log", workspace_id: "my-project", window_name: "logs" })

// Set larger buffer for development workspace (do this BEFORE creating windows)
scrollback_size({
  workspace_id: "dev-project",
  lines: 50000
})
// Now create windows that will use the 50000-line buffer
run_command({ command: "npm run dev", workspace_id: "dev-project", window_name: "server" })

// Set unlimited history for important workspace (use carefully, do this BEFORE creating windows)
scrollback_size({
  workspace_id: "important-project",
  lines: 0
})
```

**Memory monitoring tip:** Use `get_output` with the `lines` parameter to limit how much history you retrieve, even if the buffer is larger.

## Examples

For comprehensive examples of using the tmux MCP server, see [EXAMPLES.md](EXAMPLES.md). The examples cover:
- Basic command execution
- Interactive development workflows (Python, Node.js, etc.)
- Server management (dev servers, databases)
- Log monitoring
- Testing and CI/CD
- SSH and remote operations
- Workspace organization
- And more practical use cases

## Common Workflows

### Running a Development Server

```javascript
// Start the server
run_command({ command: "bun run dev", workspace_id: "myapp", window_name: "server" })

// Check server output
get_output({ workspace_id: "myapp", window_name: "server" })

// Search for errors
get_output({
  workspace_id: "myapp",
  window_name: "server",
  search: { pattern: "error|failed", context_lines: 3 }
})

// Stop the server
send_keys({ keys: ["C-c"], workspace_id: "myapp", window_name: "server" })
```

### Interactive Python Session

```javascript
// Start Python REPL
run_command({ command: "python3", workspace_id: "data", window_name: "python" })

// Send Python commands
send_input({ text: "import pandas as pd", workspace_id: "data", window_name: "python" })
send_input({ text: "df = pd.read_csv('data.csv')", workspace_id: "data", window_name: "python" })

// Check output
get_output({ workspace_id: "data", window_name: "python" })

// Exit Python
send_keys({ keys: ["C-d"], workspace_id: "data", window_name: "python" })
```

### Managing Multiple Projects

```javascript
// Create workspaces for different projects
create_workspace({ workspace_id: "frontend" })
create_workspace({ workspace_id: "backend" })
create_workspace({ workspace_id: "database" })

// Run commands in each
run_command({ command: "npm run dev", workspace_id: "frontend" })
run_command({ command: "python app.py", workspace_id: "backend" })
run_command({ command: "docker compose up", workspace_id: "database" })

// Check what's running
list_workspaces()
```

## Architecture

Each workspace is a tmux session that can contain multiple named windows. This allows you to:
- Organize related commands together
- Maintain separate environments for different projects
- Keep processes running independently
- Switch between tasks without losing state

### Parent Session Detection

When the MCP server is launched from within an existing tmux session, it automatically detects and uses that session instead of creating new ones. This provides seamless integration when running Claude or other MCP clients inside tmux.

**Behavior when parent session is detected:**
- All commands run in the parent tmux session
- `workspace_id` parameter is removed from all tools
- Workspace management tools (`create_workspace`, `destroy_workspace`) are disabled
- The server prevents sending commands to its own window for safety
- Windows created by the server appear alongside your existing tmux windows

**Example usage in parent session mode:**
```javascript
// No workspace_id needed - uses parent session
run_command({ command: "bun test", window_name: "tests" })
get_output({ window_name: "tests" })
send_keys({ keys: ["C-c"], window_name: "tests" })
```

### Running Claude Code in tmux with Control Mode

You can run Claude Code inside tmux with control mode enabled (`-CC` flag) to monitor the windows that the MCP server creates in your terminal application. This provides a visual way to see what commands are running:

```bash
# Start or attach to a tmux session with control mode
tmux -CC new -A -n Claude -s persistent-shell bunx --bun @anthropic-ai/claude-code@latest --mcp-config ~/.claude/mcp.json
```

This command:
- `-CC`: Enables tmux control mode for terminal integration
- `new -A`: Creates a new session or attaches to existing one
- `-n Claude`: Names the initial window "Claude"
- `-s persistent-shell`: Names the session "persistent-shell"
- Runs Claude Code with your MCP configuration

When using this setup, the tmux MCP server will detect it's running inside the "persistent-shell" session and automatically use that session for all operations. New windows created by the MCP server will appear in your terminal's tab bar or window list (assuming you're using something like iTerm with `tmux -CC` support).

## Troubleshooting

### Tmux Not Found
```
Error: tmux command not found
```
Install tmux using your system's package manager.

### Command Not Responding
Use `get_output` to check the current state, then `send_keys(['C-c'])` to interrupt if needed.

### Checking Process State
Use `get_output` with search to look for specific patterns:
```javascript
get_output({
  workspace_id: "myapp",
  search: { pattern: "listening on|started|ready" }
})
```

## License

MIT

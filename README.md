# Tmux MCP Server

⚠️ **WARNING: EXPERIMENTAL SOFTWARE - NOT FOR PRODUCTION USE** ⚠️

**This is experimental software intended for testing and development purposes only. Do not use in production environments or with sensitive data.**

A Model Context Protocol (MCP) server that provides persistent shell execution through tmux sessions. This server enables AI assistants to execute shell commands with session persistence, interactive command support, and real-time terminal monitoring.

## Features

- **Persistent Sessions**: Execute commands in tmux sessions that persist across MCP client restarts
- **Interactive Commands**: Support for interactive commands like `python3`, `ssh`, `mysql` that require user input
- **Long-running Processes**: Handle servers and background processes without hanging
- **Real-time Monitoring**: Monitor terminal output in real-time for logs, build processes, etc.
- **Session Management**: Create, list, destroy, and monitor tmux sessions
- **Automatic Cleanup**: Intelligent cleanup of idle sessions

## Installation

**🚨 SECURITY WARNING: This software allows AI assistants to execute arbitrary shell commands on your system. Only install and use in isolated testing environments. Never use on systems with sensitive data or in production environments.**

### Prerequisites

- Node.js 18.0.0 or higher
- tmux installed on your system
  - Ubuntu/Debian: `sudo apt install tmux`
  - macOS: `brew install tmux`
  - CentOS/RHEL: `sudo yum install tmux`

### Install from npm

```bash
npm install -g persistent-shell-mcp
```

### Install from source

```bash
git clone https://github.com/TNTisdial/persistent-shell-mcp.git
cd persistent-shell-mcp
npm install
npm link
```

### Automatic tmux Installation Check

The server automatically detects if tmux is installed and provides helpful installation instructions if it's missing. When tmux is not found, you'll see platform-specific installation commands:

- **Ubuntu/Debian**: `sudo apt update && sudo apt install tmux`
- **macOS**: `brew install tmux`
- **CentOS/RHEL**: `sudo yum install tmux`
- **Arch Linux**: `sudo pacman -S tmux`

## Usage

### Basic MCP Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "tmux-shell": {
      "command": "persistent-shell-mcp"
    }
  }
}
```

### MCP Client Configuration

Add to your MCP client configuration file:

```json
{
  "mcpServers": {
    "tmux-shell": {
      "command": "persistent-shell-mcp"
    }
  }
}
```

## Available Tools

### Core Execution Tools

#### `shell_exec`
Execute commands that complete quickly. Waits for completion and returns full output.

```javascript
// Good for: ls, grep, build scripts, npm install
shell_exec("ls -la", "my-project", 30)
```

#### `shell_exec_interactive`
Execute commands and return immediately with terminal snapshot. Perfect for long-running processes.

```javascript
// Good for: servers, interactive commands, log monitoring
shell_exec_interactive("python -m http.server 8000", "dev-server", 100)
```

#### `tmux_send_input`
Send input to interactive commands waiting for user input.

```javascript
// Respond to prompts, send commands to Python REPL, etc.
tmux_send_input("print('Hello World')", "python-session", true)
```

#### `tmux_capture_terminal`
Check current terminal state without executing commands.

```javascript
// Monitor server logs, check build progress, see prompts
tmux_capture_terminal("dev-server", 0)
```

### Session Management Tools

#### `tmux_list_sessions`
List all active tmux sessions.

#### `tmux_create_session`
Create a new tmux session explicitly.

#### `tmux_destroy_session`
Destroy a tmux session and clean up resources.

#### `tmux_session_exists`
Check if a session exists and is responsive.

#### `tmux_session_info`
Get detailed health and lifecycle information about a session.

#### `tmux_cleanup_sessions`
Automatically clean up idle and unhealthy sessions.

## Common Workflows

### Running a Development Server

```javascript
// Start the server (doesn't hang)
shell_exec_interactive("npm run dev", "dev-server")

// Monitor the server logs
tmux_capture_terminal("dev-server")

// Stop the server
tmux_send_input("C-c", "dev-server", false)
```

### Interactive Python Development

```javascript
// Start Python REPL
shell_exec_interactive("python3", "python-dev")

// Send Python commands
tmux_send_input("import numpy as np", "python-dev")
tmux_send_input("print(np.array([1, 2, 3]))", "python-dev")

// Exit Python
tmux_send_input("exit()", "python-dev")
```

### Log Monitoring

```javascript
// Start monitoring logs
shell_exec_interactive("tail -f /var/log/nginx/access.log", "log-monitor")

// Check for new entries
tmux_capture_terminal("log-monitor")

// Stop monitoring
tmux_send_input("C-c", "log-monitor", false)
```

### Build Process Monitoring

```javascript
// Start build (doesn't hang on long builds)
shell_exec_interactive("npm run build", "build-process")

// Check build progress
tmux_capture_terminal("build-process")

// Build completes automatically, check final status
tmux_capture_terminal("build-process")
```

## Key Advantages

### Never Hangs on Long-running Commands
Unlike traditional shell tools that hang on servers or interactive commands, this implementation:
- Returns immediately with terminal snapshots
- Allows monitoring of long-running processes
- Supports proper process termination

### Session Persistence
- Sessions survive MCP client restarts
- Working directory and environment preserved
- Multiple sessions for different projects

### Interactive Command Support
- Handle prompts and user input
- Support for REPLs (Python, Node.js, etc.)
- SSH connections and database clients

## Architecture

The server uses tmux's `capture-pane` functionality instead of temporary files, providing:
- Real-time terminal content capture
- No file system dependencies
- Proper handling of terminal control sequences
- Support for interactive applications

## Development

### Running Tests

```bash
npm test
```

### Development Mode

```bash
npm start
```

### Project Structure

```
tmux-mcp-server/
├── src/
│   ├── server.js           # Main MCP server and tool definitions
│   ├── tmux-manager.js     # Tmux session management
│   ├── command-executor.js # Command execution logic
│   └── index.js           # Entry point
├── bin/
│   └── tmux-mcp-server    # Executable script
└── package.json
```

## Troubleshooting

### Tmux Not Found
```
Error: tmux command not found
```
Install tmux: `sudo apt install tmux` (Ubuntu/Debian) or `brew install tmux` (macOS)

### No Sessions Available
```
Error: No tmux server running
```
Create your first session: `tmux_create_session("default")`

### Commands Timeout
```
Error: Command timed out
```
Use `shell_exec_interactive` for long-running commands instead of `shell_exec`

## License

MIT


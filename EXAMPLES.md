# Tmux MCP Server Examples

This document provides practical examples of how to use the Tmux MCP Server tools effectively.

## Basic Command Execution

### Simple Commands
```javascript
// List files in current directory
run_command({ command: "ls -la" })

// Check system information
run_command({ command: "uname -a" })

// Install dependencies in a specific workspace and window
run_command({ command: "bun install", window_name: "setup", workspace_id: "project-dev" })
```

## Understanding get_output Parameters

The `get_output` function has several important behaviors depending on the parameters provided:

### Lines Parameter Behavior
```javascript
// When lines parameter is omitted - returns ALL scrollback history
get_output({ window_name: "my-window", workspace_id: "my-workspace" })

// When lines parameter is specified - returns only the last N lines
get_output({ window_name: "my-window", workspace_id: "my-workspace", lines: 20 })

// Combine with search to filter the output
get_output({ window_name: "my-window", workspace_id: "my-workspace", lines: 50, search: "error|warn" })

// Search across all scrollback history (no lines limit)
get_output({ window_name: "my-window", workspace_id: "my-workspace", search: "specific-text" })
```

### Practical Examples
```javascript
// Start a long-running process that generates lots of output
run_command({ command: "bun run build", window_name: "build", workspace_id: "my-project" })

// Get all build output (entire scrollback history)
get_output({ window_name: "build", workspace_id: "my-project" })

// Get just the most recent 10 lines to see current status
get_output({ window_name: "build", workspace_id: "my-project", lines: 10 })

// Search for errors in the last 100 lines
get_output({ window_name: "build", workspace_id: "my-project", lines: 100, search: "error|failed" })

// Search for warnings across all output history
get_output({ window_name: "build", workspace_id: "my-project", search: "warning|warn" })
```

**Key Points:**
- **No `lines` parameter**: Returns complete scrollback history (can be very large for long-running processes)
- **With `lines` parameter**: Returns only the specified number of most recent lines
- **Search parameter**: Works with both full history and limited lines
- **Performance**: Limiting lines improves performance for processes with extensive output

## Interactive Development Workflows

### Python Development
```javascript
// Start Python REPL in a dedicated window
run_command({ command: "python3", window_name: "python-repl", workspace_id: "dev-workspace" })

// Send Python code
send_input({ text: "import pandas as pd", window_name: "python-repl", workspace_id: "dev-workspace" })
send_input({ text: "df = pd.DataFrame({'A': [1, 2, 3], 'B': [4, 5, 6]})", window_name: "python-repl", workspace_id: "dev-workspace" })
send_input({ text: "print(df)", window_name: "python-repl", workspace_id: "dev-workspace" })

// Check output (returns all scrollback history)
get_output({ window_name: "python-repl", workspace_id: "dev-workspace" })

// Exit Python
send_input({ text: "exit()", window_name: "python-repl", workspace_id: "dev-workspace" })
```

### Bun REPL
```javascript
// Start Bun REPL
run_command({ command: "bun repl", window_name: "bun-repl" })

// Send JavaScript code
send_input({ text: "const arr = [1, 2, 3, 4, 5]", window_name: "bun-repl" })
send_input({ text: "console.log(arr.map(x => x * 2))", window_name: "bun-repl" })

// Check output (returns all scrollback history)
get_output({ window_name: "bun-repl" })

// Exit Bun repl
send_input({ text: ".exit", window_name: "bun-repl" })
```

## Server Management

### Development Server
```javascript
// Start a development server
run_command({ command: "bun run dev", window_name: "dev-server", workspace_id: "web-project" })

// Check server status (returns all scrollback history)
get_output({ window_name: "dev-server", workspace_id: "web-project" })

// Server is running, check logs with search (last 50 lines)
get_output({ window_name: "dev-server", workspace_id: "web-project", lines: 50, search: "error|warn" })

// Stop the server using special keys
send_keys({ keys: "C-c", window_name: "dev-server", workspace_id: "web-project" })
```

### HTTP Server
```javascript
// Start Python HTTP server
run_command({ command: "python -m http.server 8000", window_name: "http-server", workspace_id: "demo-workspace" })

// Verify server started (returns all scrollback history)
get_output({ window_name: "http-server", workspace_id: "demo-workspace" })

// Stop server
send_keys({ keys: "C-c", window_name: "http-server", workspace_id: "demo-workspace" })
```

### Database Server
```javascript
// Start local database
run_command({ command: "mongod --dbpath ./data", window_name: "mongo-server", workspace_id: "db-workspace" })

// Monitor database logs (last 30 lines)
get_output({ window_name: "mongo-server", workspace_id: "db-workspace", lines: 30 })

// Stop database
send_keys({ keys: "C-c", window_name: "mongo-server", workspace_id: "db-workspace" })
```

## Log Monitoring

### System Logs
```javascript
// Monitor system logs
run_command({ command: "tail -f /var/log/syslog", window_name: "system-logs", workspace_id: "monitoring" })

// Check for new entries with search (last 20 lines)
get_output({ window_name: "system-logs", workspace_id: "monitoring", lines: 20, search: "error" })

// Stop monitoring
send_keys({ keys: "C-c", window_name: "system-logs", workspace_id: "monitoring" })
```

### Application Logs
```javascript
// Monitor application logs
run_command({ command: "tail -f logs/app.log", window_name: "app-logs", workspace_id: "monitoring" })

// Check recent entries (last 15 lines)
get_output({ window_name: "app-logs", workspace_id: "monitoring", lines: 15 })

// Stop monitoring
send_keys({ keys: "C-c", window_name: "app-logs", workspace_id: "monitoring" })
```

## Build and Deployment

### Long-running Builds
```javascript
// Start build process
run_command({ command: "bun run build", window_name: "build-process", workspace_id: "build-workspace" })

// Check build progress (returns all scrollback history)
get_output({ window_name: "build-process", workspace_id: "build-workspace" })

// Wait and check again (last 10 lines)
get_output({ window_name: "build-process", workspace_id: "build-workspace", lines: 10 })

// Build completes automatically
```

### Docker Operations
```javascript
// Build Docker image
run_command({ command: "docker build -t myapp .", window_name: "docker-build", workspace_id: "docker-workspace" })

// Monitor build progress (last 20 lines)
get_output({ window_name: "docker-build", workspace_id: "docker-workspace", lines: 20 })

// Run container in different window
run_command({ command: "docker run -p 3000:3000 myapp", window_name: "docker-run", workspace_id: "docker-workspace" })

// Check container logs (returns all scrollback history)
get_output({ window_name: "docker-run", workspace_id: "docker-workspace" })

// Stop container
send_keys({ keys: "C-c", window_name: "docker-run", workspace_id: "docker-workspace" })
```

## Database Interactions

### MySQL
```javascript
// Connect to MySQL
run_command({ command: "mysql -u user -p", window_name: "mysql-session", workspace_id: "db-workspace" })

// Enter password when prompted
send_input({ text: "your_password", window_name: "mysql-session", workspace_id: "db-workspace" })

// Run SQL commands
send_input({ text: "SHOW DATABASES;", window_name: "mysql-session", workspace_id: "db-workspace" })
send_input({ text: "USE mydb;", window_name: "mysql-session", workspace_id: "db-workspace" })
send_input({ text: "SELECT * FROM users LIMIT 10;", window_name: "mysql-session", workspace_id: "db-workspace" })

// Check query results (returns all scrollback history)
get_output({ window_name: "mysql-session", workspace_id: "db-workspace" })

// Exit MySQL
send_input({ text: "EXIT;", window_name: "mysql-session", workspace_id: "db-workspace" })
```

### PostgreSQL
```javascript
// Connect to PostgreSQL
run_command({ command: "psql -U user -d database", window_name: "postgres-session", workspace_id: "db-workspace" })

// Run SQL commands
send_input({ text: "\\dt", window_name: "postgres-session", workspace_id: "db-workspace" })  // List tables
send_input({ text: "SELECT version();", window_name: "postgres-session", workspace_id: "db-workspace" })

// Check results (returns all scrollback history)
get_output({ window_name: "postgres-session", workspace_id: "db-workspace" })

// Exit PostgreSQL
send_input({ text: "\\q", window_name: "postgres-session", workspace_id: "db-workspace" })
```

## SSH and Remote Operations

### SSH Connection
```javascript
// Connect via SSH
run_command({ command: "ssh user@server.com", window_name: "ssh-session", workspace_id: "remote-workspace" })

// Accept host key if prompted
send_input({ text: "yes", window_name: "ssh-session", workspace_id: "remote-workspace" })

// Enter password
send_input({ text: "your_password", window_name: "ssh-session", workspace_id: "remote-workspace" })

// Run remote commands
send_input({ text: "ls -la", window_name: "ssh-session", workspace_id: "remote-workspace" })
send_input({ text: "top", window_name: "ssh-session", workspace_id: "remote-workspace" })

// Exit top
send_input({ text: "q", window_name: "ssh-session", workspace_id: "remote-workspace" })

// Check output (returns all scrollback history)
get_output({ window_name: "ssh-session", workspace_id: "remote-workspace" })

// Exit SSH
send_input({ text: "exit", window_name: "ssh-session", workspace_id: "remote-workspace" })
```

## Workspace Management

### Multiple Projects
```javascript
// Create workspaces for different projects
create_workspace({ workspace_id: "frontend-dev" })
create_workspace({ workspace_id: "backend-dev" })
create_workspace({ workspace_id: "database-work" })

// List all workspaces and their windows
list_workspaces()

// Work in different windows within a workspace
run_command({ command: "bun start", window_name: "server", workspace_id: "frontend-dev" })
run_command({ command: "bun run test:watch", window_name: "tests", workspace_id: "frontend-dev" })
run_command({ command: "bun run build", window_name: "build", workspace_id: "frontend-dev" })

// Clean up when done
destroy_workspace({ workspace_id: "database-work" })
```

### Workspace Organization
```javascript
// Create a workspace for a complex project
create_workspace({ workspace_id: "fullstack-project" })

// Set up different windows for different tasks
run_command({ command: "bun run dev", window_name: "frontend", workspace_id: "fullstack-project" })
run_command({ command: "bun run server", window_name: "backend", workspace_id: "fullstack-project" })
run_command({ command: "docker-compose up", window_name: "database", workspace_id: "fullstack-project" })
run_command({ command: "bun test -- --watch", window_name: "tests", workspace_id: "fullstack-project" })

// Monitor all components (last 10 lines each)
get_output({ window_name: "frontend", workspace_id: "fullstack-project", lines: 10 })
get_output({ window_name: "backend", workspace_id: "fullstack-project", lines: 10 })
get_output({ window_name: "database", workspace_id: "fullstack-project", lines: 10 })
```

## Testing and CI/CD

### Running Tests
```javascript
// Run test suite
run_command({ command: "bun test", window_name: "test-runner", workspace_id: "test-workspace" })

// Monitor test progress (returns all scrollback history)
get_output({ window_name: "test-runner", workspace_id: "test-workspace" })

// Run specific test in another window
run_command({ command: "bun test -- --grep 'user authentication'", window_name: "specific-test", workspace_id: "test-workspace" })

// Check results (returns all scrollback history)
get_output({ window_name: "specific-test", workspace_id: "test-workspace" })
```

### CI/CD Pipeline
```javascript
// Start CI pipeline
run_command({ command: "./ci-pipeline.sh", window_name: "ci-pipeline", workspace_id: "ci-workspace" })

// Monitor pipeline progress (last 50 lines)
get_output({ window_name: "ci-pipeline", workspace_id: "ci-workspace", lines: 50 })

// Check for errors (last 100 lines with search)
get_output({ window_name: "ci-pipeline", workspace_id: "ci-workspace", lines: 100, search: "error|failed" })
```

## Troubleshooting Scenarios

### Debugging Hanging Process
```javascript
// Start potentially problematic command
run_command({ command: "problematic-command", window_name: "debug-window", workspace_id: "debug-workspace" })

// Check if it's running (returns all scrollback history)
get_output({ window_name: "debug-window", workspace_id: "debug-workspace" })

// If stuck, terminate
send_keys({ keys: "C-c", window_name: "debug-window", workspace_id: "debug-workspace" })

// Check final state (returns all scrollback history)
get_output({ window_name: "debug-window", workspace_id: "debug-workspace" })
```

### Process Recovery
```javascript
// Check workspace status
list_workspaces()

// Check terminal state (returns all scrollback history)
get_output({ window_name: "problematic-window", workspace_id: "my-workspace" })

// Restart process if needed
send_keys({ keys: "C-c", window_name: "problematic-window", workspace_id: "my-workspace" })
run_command({ command: "restart-command", window_name: "problematic-window", workspace_id: "my-workspace" })
```

## Advanced Patterns

### Command Chaining
```javascript
// Start first command
run_command({ command: "command1", window_name: "chain-window", workspace_id: "chain-workspace" })

// Wait for completion and check result (returns all scrollback history)
get_output({ window_name: "chain-window", workspace_id: "chain-workspace" })

// Start second command based on first result
send_input({ text: "command2", window_name: "chain-window", workspace_id: "chain-workspace" })

// Continue chain (returns all scrollback history)
get_output({ window_name: "chain-window", workspace_id: "chain-workspace" })
```

### Parallel Processing
```javascript
// Create workspace for parallel work
create_workspace({ workspace_id: "parallel-work" })

// Start multiple processes in different windows
run_command({ command: "process1", window_name: "worker-1", workspace_id: "parallel-work" })
run_command({ command: "process2", window_name: "worker-2", workspace_id: "parallel-work" })
run_command({ command: "process3", window_name: "worker-3", workspace_id: "parallel-work" })

// Monitor all processes (last 10 lines each)
get_output({ window_name: "worker-1", workspace_id: "parallel-work", lines: 10 })
get_output({ window_name: "worker-2", workspace_id: "parallel-work", lines: 10 })
get_output({ window_name: "worker-3", workspace_id: "parallel-work", lines: 10 })
```

## MCP Resources

### Key Reference
```javascript
// Access tmux key sequences reference
// Resource: tmux://keys-reference
// Contains common key combinations like:
// - C-c: Interrupt (Ctrl+C)
// - C-z: Suspend (Ctrl+Z)
// - C-d: End of file (Ctrl+D)
// - Up/Down/Left/Right: Arrow keys
// - Enter: Return key
// - Tab: Tab key
// - Escape: Escape key
```

### Common Patterns
```javascript
// Access usage patterns and examples
// Resource: tmux://common-patterns
// Contains examples of:
// - Starting and managing long-running processes
// - Interactive shell sessions
// - Database connections
// - SSH sessions
// - Development workflows
// - Testing patterns
```

## Best Practices

1. **Use descriptive workspace and window names** that indicate purpose
2. **Organize related tasks** in windows within the same workspace
3. **Monitor long-running processes** with `get_output`
4. **Clean up workspaces** when done with `destroy_workspace`
5. **Use `send_input` for text** and `send_keys` for special key sequences
6. **Search output efficiently** using the search parameter in `get_output`
7. **Terminate processes cleanly** with Ctrl+C (`C-c`) when needed
8. **Use `list_workspaces`** to keep track of active workspaces and windows

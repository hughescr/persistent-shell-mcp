# Tmux MCP Server Examples

This document provides practical examples of how to use the Tmux MCP Server tools effectively.

## Basic Command Execution

### Simple Commands
```javascript
// List files in current directory
run_command("ls -la")

// Check system information
run_command("uname -a")

// Install dependencies in a specific workspace and window
run_command("bun install", "setup", "project-dev")
```

## Interactive Development Workflows

### Python Development
```javascript
// Start Python REPL in a dedicated window
run_command("python3", "python-repl", "dev-workspace")

// Send Python code
send_input("import pandas as pd", "python-repl", "dev-workspace")
send_input("df = pd.DataFrame({'A': [1, 2, 3], 'B': [4, 5, 6]})", "python-repl", "dev-workspace")
send_input("print(df)", "python-repl", "dev-workspace")

// Check output
get_output("python-repl", "dev-workspace")

// Exit Python
send_input("exit()", "python-repl", "dev-workspace")
```

### Bun REPL
```javascript
// Start Bun REPL
run_command("bun repl", "bun-repl")

// Send JavaScript code
send_input("const arr = [1, 2, 3, 4, 5]", "bun-repl")
send_input("console.log(arr.map(x => x * 2))", "bun-repl")

// Check output
get_output("node-repl")

// Exit Bun repl
send_input(".exit", "node-repl")
```

## Server Management

### Development Server
```javascript
// Start a development server
run_command("bun run dev", "dev-server", "web-project")

// Check server status
get_output("dev-server", "web-project")

// Server is running, check logs with search
get_output("dev-server", "web-project", 50, "error|warn")

// Stop the server using special keys
send_keys("C-c", "dev-server", "web-project")
```

### HTTP Server
```javascript
// Start Python HTTP server
run_command("python -m http.server 8000", "http-server", "demo-workspace")

// Verify server started
get_output("http-server", "demo-workspace")

// Stop server
send_keys("C-c", "http-server", "demo-workspace")
```

### Database Server
```javascript
// Start local database
run_command("mongod --dbpath ./data", "mongo-server", "db-workspace")

// Monitor database logs
get_output("mongo-server", "db-workspace", 30)

// Stop database
send_keys("C-c", "mongo-server", "db-workspace")
```

## Log Monitoring

### System Logs
```javascript
// Monitor system logs
run_command("tail -f /var/log/syslog", "system-logs", "monitoring")

// Check for new entries with search
get_output("system-logs", "monitoring", 20, "error")

// Stop monitoring
send_keys("C-c", "system-logs", "monitoring")
```

### Application Logs
```javascript
// Monitor application logs
run_command("tail -f logs/app.log", "app-logs", "monitoring")

// Check recent entries
get_output("app-logs", "monitoring", 15)

// Stop monitoring
send_keys("C-c", "app-logs", "monitoring")
```

## Build and Deployment

### Long-running Builds
```javascript
// Start build process
run_command("bun run build", "build-process", "build-workspace")

// Check build progress
get_output("build-process", "build-workspace")

// Wait and check again
get_output("build-process", "build-workspace", 10)

// Build completes automatically
```

### Docker Operations
```javascript
// Build Docker image
run_command("docker build -t myapp .", "docker-build", "docker-workspace")

// Monitor build progress
get_output("docker-build", "docker-workspace", 20)

// Run container in different window
run_command("docker run -p 3000:3000 myapp", "docker-run", "docker-workspace")

// Check container logs
get_output("docker-run", "docker-workspace")

// Stop container
send_keys("C-c", "docker-run", "docker-workspace")
```

## Database Interactions

### MySQL
```javascript
// Connect to MySQL
run_command("mysql -u user -p", "mysql-session", "db-workspace")

// Enter password when prompted
send_input("your_password", "mysql-session", "db-workspace")

// Run SQL commands
send_input("SHOW DATABASES;", "mysql-session", "db-workspace")
send_input("USE mydb;", "mysql-session", "db-workspace")
send_input("SELECT * FROM users LIMIT 10;", "mysql-session", "db-workspace")

// Check query results
get_output("mysql-session", "db-workspace")

// Exit MySQL
send_input("EXIT;", "mysql-session", "db-workspace")
```

### PostgreSQL
```javascript
// Connect to PostgreSQL
run_command("psql -U user -d database", "postgres-session", "db-workspace")

// Run SQL commands
send_input("\\dt", "postgres-session", "db-workspace")  // List tables
send_input("SELECT version();", "postgres-session", "db-workspace")

// Check results
get_output("postgres-session", "db-workspace")

// Exit PostgreSQL
send_input("\\q", "postgres-session", "db-workspace")
```

## SSH and Remote Operations

### SSH Connection
```javascript
// Connect via SSH
run_command("ssh user@server.com", "ssh-session", "remote-workspace")

// Accept host key if prompted
send_input("yes", "ssh-session", "remote-workspace")

// Enter password
send_input("your_password", "ssh-session", "remote-workspace")

// Run remote commands
send_input("ls -la", "ssh-session", "remote-workspace")
send_input("top", "ssh-session", "remote-workspace")

// Exit top
send_input("q", "ssh-session", "remote-workspace")

// Check output
get_output("ssh-session", "remote-workspace")

// Exit SSH
send_input("exit", "ssh-session", "remote-workspace")
```

## Workspace Management

### Multiple Projects
```javascript
// Create workspaces for different projects
create_workspace("frontend-dev")
create_workspace("backend-dev")
create_workspace("database-work")

// List all workspaces and their windows
list_workspaces()

// Work in different windows within a workspace
run_command("bun start", "server", "frontend-dev")
run_command("bun run test:watch", "tests", "frontend-dev")
run_command("bun run build", "build", "frontend-dev")

// Clean up when done
destroy_workspace("database-work")
```

### Workspace Organization
```javascript
// Create a workspace for a complex project
create_workspace("fullstack-project")

// Set up different windows for different tasks
run_command("bun run dev", "frontend", "fullstack-project")
run_command("bun run server", "backend", "fullstack-project")
run_command("docker-compose up", "database", "fullstack-project")
run_command("bun test -- --watch", "tests", "fullstack-project")

// Monitor all components
get_output("frontend", "fullstack-project", 10)
get_output("backend", "fullstack-project", 10)
get_output("database", "fullstack-project", 10)
```

## Testing and CI/CD

### Running Tests
```javascript
// Run test suite
run_command("bun test", "test-runner", "test-workspace")

// Monitor test progress
get_output("test-runner", "test-workspace")

// Run specific test in another window
run_command("bun test -- --grep 'user authentication'", "specific-test", "test-workspace")

// Check results
get_output("specific-test", "test-workspace")
```

### CI/CD Pipeline
```javascript
// Start CI pipeline
run_command("./ci-pipeline.sh", "ci-pipeline", "ci-workspace")

// Monitor pipeline progress
get_output("ci-pipeline", "ci-workspace", 50)

// Check for errors
get_output("ci-pipeline", "ci-workspace", 100, "error|failed")
```

## Troubleshooting Scenarios

### Debugging Hanging Process
```javascript
// Start potentially problematic command
run_command("problematic-command", "debug-window", "debug-workspace")

// Check if it's running
get_output("debug-window", "debug-workspace")

// If stuck, terminate
send_keys("C-c", "debug-window", "debug-workspace")

// Check final state
get_output("debug-window", "debug-workspace")
```

### Process Recovery
```javascript
// Check workspace status
list_workspaces()

// Check terminal state
get_output("problematic-window", "my-workspace")

// Restart process if needed
send_keys("C-c", "problematic-window", "my-workspace")
run_command("restart-command", "problematic-window", "my-workspace")
```

## Advanced Patterns

### Command Chaining
```javascript
// Start first command
run_command("command1", "chain-window", "chain-workspace")

// Wait for completion and check result
get_output("chain-window", "chain-workspace")

// Start second command based on first result
send_input("command2", "chain-window", "chain-workspace")

// Continue chain
get_output("chain-window", "chain-workspace")
```

### Parallel Processing
```javascript
// Create workspace for parallel work
create_workspace("parallel-work")

// Start multiple processes in different windows
run_command("process1", "worker-1", "parallel-work")
run_command("process2", "worker-2", "parallel-work")
run_command("process3", "worker-3", "parallel-work")

// Monitor all processes
get_output("worker-1", "parallel-work", 10)
get_output("worker-2", "parallel-work", 10)
get_output("worker-3", "parallel-work", 10)
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

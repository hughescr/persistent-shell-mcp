# Tmux MCP Server Examples

This document provides practical examples of how to use the Tmux MCP Server tools effectively.

## Basic Command Execution

### Simple Commands
```javascript
// List files in current directory
shell_exec("ls -la")

// Check system information
shell_exec("uname -a")

// Install dependencies
shell_exec("npm install", "project-setup", 60)
```

## Interactive Development Workflows

### Python Development
```javascript
// Start Python REPL
shell_exec_interactive("python3", "python-session")

// Send Python code
tmux_send_input("import pandas as pd", "python-session")
tmux_send_input("df = pd.DataFrame({'A': [1, 2, 3], 'B': [4, 5, 6]})", "python-session")
tmux_send_input("print(df)", "python-session")

// Check output
tmux_capture_terminal("python-session")

// Exit Python
tmux_send_input("exit()", "python-session")
```

### Node.js REPL
```javascript
// Start Node.js REPL
shell_exec_interactive("node", "node-session")

// Send JavaScript code
tmux_send_input("const arr = [1, 2, 3, 4, 5]", "node-session")
tmux_send_input("console.log(arr.map(x => x * 2))", "node-session")

// Exit Node.js
tmux_send_input(".exit", "node-session")
```

## Server Management

### Development Server
```javascript
// Start a development server (doesn't hang)
shell_exec_interactive("npm run dev", "dev-server")

// Check server status
tmux_capture_terminal("dev-server")

// Server is running, check logs periodically
tmux_capture_terminal("dev-server")

// Stop the server
tmux_send_input("C-c", "dev-server", false)
```

### HTTP Server
```javascript
// Start Python HTTP server
shell_exec_interactive("python -m http.server 8000", "http-server")

// Verify server started
tmux_capture_terminal("http-server")

// Stop server
tmux_send_input("C-c", "http-server", false)
```

### Database Server
```javascript
// Start local database
shell_exec_interactive("mongod --dbpath ./data", "mongo-server")

// Monitor database logs
tmux_capture_terminal("mongo-server")

// Stop database
tmux_send_input("C-c", "mongo-server", false)
```

## Log Monitoring

### System Logs
```javascript
// Monitor system logs
shell_exec_interactive("tail -f /var/log/syslog", "system-logs")

// Check for new entries
tmux_capture_terminal("system-logs")

// Stop monitoring
tmux_send_input("C-c", "system-logs", false)
```

### Application Logs
```javascript
// Monitor application logs
shell_exec_interactive("tail -f logs/app.log", "app-logs")

// Check recent entries
tmux_capture_terminal("app-logs")

// Stop monitoring
tmux_send_input("C-c", "app-logs", false)
```

## Build and Deployment

### Long-running Builds
```javascript
// Start build process (doesn't hang)
shell_exec_interactive("npm run build", "build-process")

// Check build progress
tmux_capture_terminal("build-process")

// Wait a bit and check again
tmux_capture_terminal("build-process")

// Build completes automatically
```

### Docker Operations
```javascript
// Build Docker image
shell_exec_interactive("docker build -t myapp .", "docker-build")

// Monitor build progress
tmux_capture_terminal("docker-build")

// Run container
shell_exec_interactive("docker run -p 3000:3000 myapp", "docker-run")

// Check container logs
tmux_capture_terminal("docker-run")

// Stop container
tmux_send_input("C-c", "docker-run", false)
```

## Database Interactions

### MySQL
```javascript
// Connect to MySQL
shell_exec_interactive("mysql -u user -p", "mysql-session")

// Enter password when prompted
tmux_send_input("your_password", "mysql-session")

// Run SQL commands
tmux_send_input("SHOW DATABASES;", "mysql-session")
tmux_send_input("USE mydb;", "mysql-session")
tmux_send_input("SELECT * FROM users LIMIT 10;", "mysql-session")

// Exit MySQL
tmux_send_input("EXIT;", "mysql-session")
```

### PostgreSQL
```javascript
// Connect to PostgreSQL
shell_exec_interactive("psql -U user -d database", "postgres-session")

// Run SQL commands
tmux_send_input("\\dt", "postgres-session")  // List tables
tmux_send_input("SELECT version();", "postgres-session")

// Exit PostgreSQL
tmux_send_input("\\q", "postgres-session")
```

## SSH and Remote Operations

### SSH Connection
```javascript
// Connect via SSH
shell_exec_interactive("ssh user@server.com", "ssh-session")

// Accept host key if prompted
tmux_send_input("yes", "ssh-session")

// Enter password
tmux_send_input("your_password", "ssh-session")

// Run remote commands
tmux_send_input("ls -la", "ssh-session")
tmux_send_input("top", "ssh-session")

// Exit top
tmux_send_input("q", "ssh-session")

// Exit SSH
tmux_send_input("exit", "ssh-session")
```

## Session Management

### Multiple Projects
```javascript
// Create sessions for different projects
tmux_create_session("frontend-dev")
tmux_create_session("backend-dev")
tmux_create_session("database-work")

// List all sessions
tmux_list_sessions()

// Check session status
tmux_session_exists("frontend-dev")
tmux_session_info("frontend-dev")

// Clean up idle sessions
tmux_cleanup_sessions()
```

### Session Monitoring
```javascript
// Get detailed session information
tmux_session_info("my-session")

// Check if session is healthy
tmux_session_exists("my-session")

// Destroy session when done
tmux_destroy_session("my-session")
```

## Testing and CI/CD

### Running Tests
```javascript
// Run test suite
shell_exec_interactive("npm test", "test-session")

// Monitor test progress
tmux_capture_terminal("test-session")

// Run specific test
tmux_send_input("npm test -- --grep 'user authentication'", "test-session")
```

### CI/CD Pipeline
```javascript
// Start CI pipeline
shell_exec_interactive("./ci-pipeline.sh", "ci-pipeline")

// Monitor pipeline progress
tmux_capture_terminal("ci-pipeline")

// Pipeline completes automatically
```

## Troubleshooting Scenarios

### Debugging Hanging Process
```javascript
// Start potentially problematic command
shell_exec_interactive("problematic-command", "debug-session")

// Check if it's running
tmux_capture_terminal("debug-session")

// If stuck, terminate
tmux_send_input("C-c", "debug-session", false)

// Check final state
tmux_capture_terminal("debug-session")
```

### Process Recovery
```javascript
// Check session health
tmux_session_info("my-session")

// If unhealthy, check terminal state
tmux_capture_terminal("my-session")

// Restart process if needed
tmux_send_input("C-c", "my-session", false)
shell_exec_interactive("restart-command", "my-session")
```

## Advanced Patterns

### Command Chaining
```javascript
// Start first command
shell_exec_interactive("command1", "chain-session")

// Wait for completion and check result
tmux_capture_terminal("chain-session")

// Start second command
tmux_send_input("command2", "chain-session")

// Continue chain
tmux_capture_terminal("chain-session")
```

### Parallel Processing
```javascript
// Start multiple processes in different sessions
shell_exec_interactive("process1", "worker-1")
shell_exec_interactive("process2", "worker-2")
shell_exec_interactive("process3", "worker-3")

// Monitor all processes
tmux_capture_terminal("worker-1")
tmux_capture_terminal("worker-2")
tmux_capture_terminal("worker-3")
```

## Best Practices

1. **Use descriptive session names** that indicate purpose
2. **Monitor long-running processes** with `tmux_capture_terminal`
3. **Clean up sessions** when done with `tmux_destroy_session`
4. **Use appropriate timeouts** for `shell_exec` based on expected runtime
5. **Handle interactive prompts** properly with `tmux_send_input`
6. **Terminate processes cleanly** with Ctrl+C (`C-c`) when needed
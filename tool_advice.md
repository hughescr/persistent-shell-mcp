# Tmux MCP Tool Usage Guide

This guide provides essential tips and best practices for using the tmux-mcp tools effectively, especially for first-time users.

## Core Concepts

### Session Architecture
- Each session has **two windows**: `exec` (raw shell) and `ui` (clean display)
- Sessions persist across tool calls - working directory, environment variables, and processes are maintained
- Use unique session IDs to isolate different workflows

### Command Types
- **shell_exec**: For commands that complete and return results (ls, pwd, grep, etc.)
- **shell_exec_interactive**: For long-running processes, REPLs, or interactive commands (python, vim, tail -f)

## Common Issues & Solutions

### 1. Shell Prompt Timing
**Problem**: Commands fail with parse errors or timeouts
**Cause**: Command sent before shell prompt is fully ready
**Solution**: Wait a moment and retry. The system has built-in delays but complex shell configurations may need more time.

```
❯ ( command ) 2>&1 | tee file.txt )
zsh: parse error near ')'
```

### 2. Exit Code Limitations
**Issue**: Exit codes may not reflect the original command's exit status
**Reason**: Output capture mechanisms (tee) can mask original exit codes
**Workaround**: Rely on error messages in the output rather than exit codes for failure detection

### 3. Interactive Process Management
**Stuck Process**: Use `tmux_send_input` with `"C-c"` and `press_enter=false` to interrupt
**REPL Usage**: Send commands line by line, check output with `tmux_capture_terminal`

## Best Practices

### Session Management
- Use descriptive session IDs: `"frontend-dev"`, `"database-work"`, `"testing"`
- Clean up sessions periodically with `tmux_cleanup_sessions`
- Destroy specific sessions with `tmux_destroy_session` when done

### Timeout Configuration
- Default timeout: 30 seconds
- Increase for long operations: builds, installs, large file processing
- Example: `shell_exec command="npm install" timeout=300`

### Debugging Commands
- Use `tmux_capture_terminal window_name="exec"` to see raw shell with capture commands
- Use `tmux_capture_terminal window_name="ui"` to see clean output display
- Check `tmux_session_info` for session health and command count

### Error Recovery
1. **Command Stuck**: Send `C-c` to interrupt
2. **Parse Errors**: Wait and retry (shell prompt timing)
3. **Session Issues**: Destroy and recreate session
4. **Timeout**: Increase timeout parameter or break into smaller commands

## Tool-Specific Tips

### shell_exec
- Good for: File operations, system commands, quick scripts
- Returns: Complete output, working directory, exit code
- Timeout: Configurable (default 30s)

### shell_exec_interactive  
- Good for: REPLs (python, node), editors, monitoring commands
- Returns: Initial output only
- Follow up: Use `tmux_send_input` and `tmux_capture_terminal`

### tmux_send_input
- Use `press_enter=true` for normal commands
- Use `press_enter=false` for control sequences (`C-c`, `C-d`)
- Send commands one at a time for REPLs

### tmux_capture_terminal
- `window_name="ui"`: Clean output (default)
- `window_name="exec"`: Raw shell with capture commands
- Useful for debugging and monitoring interactive processes

## Example Workflows

### Python Development
```
1. shell_exec_interactive command="python3" session_id="python-dev"
2. tmux_send_input input="import os" session_id="python-dev"
3. tmux_send_input input="print(os.getcwd())" session_id="python-dev"
4. tmux_capture_terminal session_id="python-dev"
5. tmux_send_input input="exit()" session_id="python-dev"
```

### Build Process
```
1. shell_exec command="npm install" timeout=300 session_id="build"
2. shell_exec command="npm run build" timeout=180 session_id="build"
3. shell_exec command="npm test" session_id="build"
```

### File Operations
```
1. shell_exec command="mkdir project && cd project" session_id="files"
2. shell_exec command="pwd" session_id="files"  # Verify directory change
3. shell_exec command="ls -la" session_id="files"
```

## Troubleshooting

### Session Not Responding
- Check: `tmux_session_info session_id="your-session"`
- Fix: `tmux_destroy_session session_id="your-session"` and recreate

### Command Output Missing
- Check: `tmux_capture_terminal window_name="exec"` for raw output
- Verify: Command completed (look for shell prompt)

### Parse Errors
- Cause: Usually shell prompt timing or complex command syntax
- Fix: Simplify command or add delay before retry

### Memory/Performance
- Monitor: Active sessions with `tmux_list_sessions`
- Cleanup: Use `tmux_cleanup_sessions` for idle sessions (30+ minutes)

## Advanced Usage

### Multiple Parallel Sessions
Use different session IDs for concurrent workflows:
- `"frontend"` - UI development
- `"backend"` - API development  
- `"testing"` - Test execution
- `"monitoring"` - Log watching

### Long-Running Monitoring
```
shell_exec_interactive command="tail -f /var/log/app.log" session_id="monitor"
# Check periodically with:
tmux_capture_terminal session_id="monitor"
```

### Complex Shell Operations
For complex shell scripts, consider:
1. Writing to a temporary file first
2. Making it executable
3. Running the file instead of inline commands

This approach avoids shell parsing issues with complex syntax.
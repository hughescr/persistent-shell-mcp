import { vi } from 'bun:test';
import { EventEmitter } from 'events';

export class MockChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = new EventEmitter();
    this.killed = false;
  }

  kill(signal) {
    this.killed = true;
    this.emit('close', signal === 'SIGTERM' ? 143 : 0);
  }
}

export function createMockSpawn(responses = {}) {
  return vi.fn((command, args) => {
    const process = new MockChildProcess();
    const argsStr = args.join(' ');
    
    // Default to success if not specified
    const response = responses[argsStr] || { stdout: '', code: 0 };
    
    // Simulate async behavior
    setTimeout(() => {
      if (response.error) {
        process.emit('error', response.error);
      } else {
        if (response.stdout) {
          process.stdout.emit('data', Buffer.from(response.stdout));
        }
        if (response.stderr) {
          process.stderr.emit('data', Buffer.from(response.stderr));
        }
        process.emit('close', response.code || 0);
      }
    }, 0);
    
    return process;
  });
}

export function createMockMcpServer() {
  const handlers = new Map();
  
  return {
    setRequestHandler: vi.fn((schema, handler) => {
      handlers.set(schema, handler);
    }),
    connect: vi.fn(),
    handlers,
    // Helper to simulate requests
    async simulateRequest(schema, params) {
      const handler = handlers.get(schema);
      if (!handler) {
        throw new Error(`No handler for schema: ${schema}`);
      }
      return await handler({ params });
    }
  };
}

export function createMockTransport() {
  const messages = [];
  
  return {
    messages,
    send: vi.fn((message) => {
      messages.push(message);
    }),
    close: vi.fn(),
    // Helper to simulate incoming messages
    simulateMessage(message) {
      this.emit('message', message);
    }
  };
}

// Helper to create a mock stdio transport for e2e tests
export function createMockStdioTransport() {
  const stdin = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  
  stdin.setEncoding = vi.fn();
  stdout.write = vi.fn();
  stderr.write = vi.fn();
  
  return {
    stdin,
    stdout,
    stderr,
    // Helper to simulate stdin input
    simulateInput(data) {
      stdin.emit('data', JSON.stringify(data) + '\n');
    },
    // Helper to get stdout output
    getOutput() {
      return stdout.write.mock.calls.map(call => call[0]);
    }
  };
}

// Helper to wait for async operations
export function waitFor(condition, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for condition'));
      }
    }, 10);
  });
}

// Helper to clean up tmux sessions after tests
export async function cleanupTmuxSessions() {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve) => {
    const process = spawn('tmux', ['ls', '-F', '#S']);
    let stdout = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.on('close', async () => {
      const sessions = stdout
        .trim()
        .split('\n')
        .filter(name => name.endsWith('-MCP'));
      
      for (const session of sessions) {
        try {
          await new Promise((res) => {
            const kill = spawn('tmux', ['kill-session', '-t', session]);
            kill.on('close', res);
          });
        } catch (e) {
          // Ignore errors
        }
      }
      
      resolve();
    });
    
    process.on('error', () => {
      // No tmux or no sessions, that's fine
      resolve();
    });
  });
}
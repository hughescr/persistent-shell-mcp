import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, spyOn } from 'bun:test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../../src/index.js');

// Simple cleanup function that doesn't fail if tmux isn't available
async function cleanupTmuxSessions() {
  try {
    const process = spawn('tmux', ['ls', '-F', '#S']);
    let stdout = '';
    
    await new Promise((resolve) => {
      process.stdout?.on('data', (data) => {
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
              kill.on('error', res);
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
  } catch (e) {
    // Ignore all errors
  }
}

describe('MCP Interface E2E Tests', () => {
  let serverProcess;
  let messages = [];
  let messageId = 1;
  let consoleErrorSpy;
  
  beforeAll(async () => {
    await cleanupTmuxSessions();
  });
  
  afterAll(async () => {
    await cleanupTmuxSessions();
  });
  
  beforeEach(() => {
    messages = [];
    messageId = 1;
    
    // Mock console.error to suppress error output during tests
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    // Start the MCP server
    serverProcess = spawn('bun', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Capture server output
    serverProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          messages.push(message);
        } catch (e) {
          // Ignore non-JSON output
        }
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // Only log actual errors, not the startup message
      if (!message.includes('Tmux MCP Server running on stdio')) {
        console.error('Server error:', message);
      }
    });
  });
  
  afterEach(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      await new Promise((resolve) => {
        serverProcess.on('close', resolve);
      });
    }
    
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });
  
  function sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: messageId++,
      method,
      params
    };
    
    serverProcess.stdin.write(JSON.stringify(request) + '\n');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, 5000);
      
      const interval = setInterval(() => {
        const response = messages.find(msg => msg.id === request.id);
        if (response) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(response);
        }
      }, 10);
    });
  }
  
  test('server starts and responds to initialize', async () => {
    const response = await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });
    
    expect(response.result.protocolVersion).toBeDefined();
    expect(response.result.serverInfo.name).toBe('tmux-mcp-server');
    expect(response.result.serverInfo.version).toBe('2.0.0');
  });
  
  test('lists available tools', async () => {
    // Initialize first
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    const response = await sendRequest('tools/list');
    
    expect(response.result.tools).toHaveLength(7);
    const toolNames = response.result.tools.map(t => t.name);
    expect(toolNames).toContain('run_command');
    expect(toolNames).toContain('get_output');
    expect(toolNames).toContain('send_input');
    expect(toolNames).toContain('send_keys');
    expect(toolNames).toContain('create_workspace');
    expect(toolNames).toContain('destroy_workspace');
    expect(toolNames).toContain('list_workspaces');
  });
  
  test('lists available resources', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    const response = await sendRequest('resources/list');
    
    expect(response.result.resources).toHaveLength(2);
    const resourceUris = response.result.resources.map(r => r.uri);
    expect(resourceUris).toContain('tmux://keys-reference');
    expect(resourceUris).toContain('tmux://common-patterns');
  });
  
  test('reads a resource', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    const response = await sendRequest('resources/read', {
      uri: 'tmux://keys-reference'
    });
    
    expect(response.result.contents[0].text).toContain('Common tmux key sequences');
    expect(response.result.contents[0].mimeType).toBe('text/plain');
  });
  
  test('executes run_command tool', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    const response = await sendRequest('tools/call', {
      name: 'run_command',
      arguments: {
        command: 'echo "Hello from E2E test"',
        workspace_id: 'e2e-test'
      }
    });
    
    expect(response.result.content[0].text).toBe('Started command in e2e-test:main');
  });
  
  test('full workflow: create workspace, run command, get output', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    // Create workspace
    const createResponse = await sendRequest('tools/call', {
      name: 'create_workspace',
      arguments: { workspace_id: 'e2e-workflow' }
    });
    expect(createResponse.result.content[0].text).toBe('Created workspace: e2e-workflow');
    
    // Run command
    const runResponse = await sendRequest('tools/call', {
      name: 'run_command',
      arguments: {
        command: 'echo "Testing 123"',
        workspace_id: 'e2e-workflow'
      }
    });
    expect(runResponse.result.content[0].text).toBe('Started command in e2e-workflow:main');
    
    // Wait a bit for command to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get output
    const outputResponse = await sendRequest('tools/call', {
      name: 'get_output',
      arguments: {
        workspace_id: 'e2e-workflow'
      }
    });
    expect(outputResponse.result.content[0].text).toContain('Testing 123');
    
    // List workspaces
    const listResponse = await sendRequest('tools/call', {
      name: 'list_workspaces',
      arguments: {}
    });
    expect(listResponse.result.content[0].text).toContain('e2e-workflow: main');
    
    // Destroy workspace
    const destroyResponse = await sendRequest('tools/call', {
      name: 'destroy_workspace',
      arguments: { workspace_id: 'e2e-workflow' }
    });
    expect(destroyResponse.result.content[0].text).toBe('Destroyed workspace: e2e-workflow');
  });
  
  test('handles interactive session with send_input', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    // Start Python interactive session
    await sendRequest('tools/call', {
      name: 'run_command',
      arguments: {
        command: 'python3',
        workspace_id: 'e2e-python',
        window_name: 'repl'
      }
    });
    
    // Wait for Python to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send Python command
    await sendRequest('tools/call', {
      name: 'send_input',
      arguments: {
        text: 'print("Hello from Python")',
        workspace_id: 'e2e-python',
        window_name: 'repl'
      }
    });
    
    // Wait for execution
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get output
    const outputResponse = await sendRequest('tools/call', {
      name: 'get_output',
      arguments: {
        workspace_id: 'e2e-python',
        window_name: 'repl'
      }
    });
    
    expect(outputResponse.result.content[0].text).toContain('Hello from Python');
    
    // Send exit
    await sendRequest('tools/call', {
      name: 'send_keys',
      arguments: {
        keys: ['C-d'],
        workspace_id: 'e2e-python',
        window_name: 'repl'
      }
    });
    
    // Cleanup
    await sendRequest('tools/call', {
      name: 'destroy_workspace',
      arguments: { workspace_id: 'e2e-python' }
    });
  });
  
  test('search functionality', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    // Run command that produces searchable output
    await sendRequest('tools/call', {
      name: 'run_command',
      arguments: {
        command: 'echo "Line 1" && echo "Line 2" && echo "ERROR: Test error" && echo "More lines" && echo "WARNING: Test warning"',
        workspace_id: 'e2e-search'
      }
    });
    
    // Wait for command to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Search for error and warning
    const searchResponse = await sendRequest('tools/call', {
      name: 'get_output',
      arguments: {
        workspace_id: 'e2e-search',
        search: {
          pattern: 'ERROR|WARNING',
          context_lines: 1,
          include_line_numbers: true
        }
      }
    });
    
    expect(searchResponse.result.content[0].text).toContain('ERROR: Test error');
    expect(searchResponse.result.content[0].text).toContain('WARNING: Test warning');
    
    // Cleanup
    await sendRequest('tools/call', {
      name: 'destroy_workspace',
      arguments: { workspace_id: 'e2e-search' }
    });
  });
  
  test('handles errors gracefully', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    // Try to call unknown tool
    const response = await sendRequest('tools/call', {
      name: 'unknown_tool',
      arguments: {}
    });
    
    // The server returns content with error message, not an error object
    expect(response.result?.content).toBeDefined();
    expect(response.result.content[0].text).toContain('Error: Unknown tool: unknown_tool');
  });
  
  test('handles invalid resource URI', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    const response = await sendRequest('resources/read', {
      uri: 'tmux://invalid-resource'
    });
    
    expect(response.error).toBeDefined();
    expect(response.error.message).toContain('Unknown resource: tmux://invalid-resource');
  });
  
  test('multiple windows in same workspace', async () => {
    await sendRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    
    // Create workspace and run commands in different windows
    await sendRequest('tools/call', {
      name: 'run_command',
      arguments: {
        command: 'echo "Window 1"',
        workspace_id: 'e2e-multi',
        window_name: 'window1'
      }
    });
    
    await sendRequest('tools/call', {
      name: 'run_command',
      arguments: {
        command: 'echo "Window 2"',
        workspace_id: 'e2e-multi',
        window_name: 'window2'
      }
    });
    
    // Wait for commands
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get output from each window
    const output1 = await sendRequest('tools/call', {
      name: 'get_output',
      arguments: {
        workspace_id: 'e2e-multi',
        window_name: 'window1'
      }
    });
    
    const output2 = await sendRequest('tools/call', {
      name: 'get_output',
      arguments: {
        workspace_id: 'e2e-multi',
        window_name: 'window2'
      }
    });
    
    expect(output1.result.content[0].text).toContain('Window 1');
    expect(output2.result.content[0].text).toContain('Window 2');
    
    // List workspaces should show both windows
    const listResponse = await sendRequest('tools/call', {
      name: 'list_workspaces',
      arguments: {}
    });
    
    expect(listResponse.result.content[0].text).toContain('e2e-multi: main, window1, window2');
    
    // Cleanup
    await sendRequest('tools/call', {
      name: 'destroy_workspace',
      arguments: { workspace_id: 'e2e-multi' }
    });
  });
});
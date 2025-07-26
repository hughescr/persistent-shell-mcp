import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import TmuxMcpServer from '../../src/server.js';

describe('TmuxMcpServer Integration Tests', () => {
  let server;
  let mockTmuxManager;
  let consoleErrorSpy;
  
  beforeEach(() => {
    // Mock console.error to suppress error output during tests
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    server = new TmuxMcpServer();
    
    // Mock only the tmuxManager to avoid actual tmux calls
    mockTmuxManager = {
      createSession: mock().mockResolvedValue(),
      sessionExists: mock().mockResolvedValue(true),
      windowExists: mock().mockResolvedValue(true),
      createWindow: mock().mockResolvedValue(),
      destroySession: mock().mockResolvedValue(),
      listSessions: mock().mockResolvedValue(['session1', 'session2']),
      listWindows: mock().mockResolvedValue(['main', 'window1']),
      listWorkspaces: mock().mockResolvedValue([
        { workspace_id: 'workspace1', windows: ['main', 'window1'] },
        { workspace_id: 'workspace2', windows: ['main'] }
      ]),
      sendKeys: mock().mockResolvedValue(),
      capturePane: mock().mockResolvedValue('test output')
    };
    
    server.tmuxManager = mockTmuxManager;
  });
  
  afterEach(() => {
    mock.restore();
    consoleErrorSpy.mockRestore();
  });
  
  describe('Tool Definitions', () => {
    test('getToolDefinitions returns all tools', () => {
      const tools = server.getToolDefinitions();
      
      expect(tools).toHaveLength(7);
      expect(tools.map(t => t.name)).toEqual([
        'run_command',
        'get_output', 
        'send_input',
        'send_keys',
        'create_workspace',
        'destroy_workspace',
        'list_workspaces'
      ]);
      
      // Check each tool has required properties
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      });
    });
  });
  
  describe('Resource Definitions', () => {
    test('getResourceDefinitions returns all resources', () => {
      const resources = server.getResourceDefinitions();
      
      expect(resources).toHaveLength(2);
      expect(resources[0].uri).toBe('tmux://keys-reference');
      expect(resources[1].uri).toBe('tmux://common-patterns');
      
      resources.forEach(resource => {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('description');
        expect(resource).toHaveProperty('mimeType');
      });
    });
  });
  
  describe('Tool Handlers', () => {
    describe('handleRunCommand', () => {
      test('executes command with defaults', async () => {
        const result = await server.handleRunCommand({ command: 'echo test' });
        
        expect(mockTmuxManager.createSession).toHaveBeenCalledWith('default');
        expect(mockTmuxManager.sendKeys).toHaveBeenCalledWith('default', 'main', ['e', 'c', 'h', 'o', ' ', 't', 'e', 's', 't', 'C-m']);
        expect(result.content[0].text).toBe('Started command in default:main');
      });
      
      test('executes command with custom workspace and window', async () => {
        const result = await server.handleRunCommand({
          command: 'npm test',
          workspace_id: 'myproject',
          window_name: 'tests'
        });
        
        expect(mockTmuxManager.createSession).toHaveBeenCalledWith('myproject');
        expect(mockTmuxManager.sendKeys).toHaveBeenCalledWith('myproject', 'tests', ['n', 'p', 'm', ' ', 't', 'e', 's', 't', 'C-m']);
        expect(result.content[0].text).toBe('Started command in myproject:tests');
      });
    });
    
    describe('handleGetOutput', () => {
      test('captures output without parameters', async () => {
        mockTmuxManager.capturePane.mockResolvedValue('captured output');
        
        const result = await server.handleGetOutput({});
        
        expect(mockTmuxManager.capturePane).toHaveBeenCalledWith('default', 'main');
        expect(result.content[0].text).toBe('captured output');
      });
      
      test('captures output with line count', async () => {
        mockTmuxManager.capturePane.mockResolvedValue('last 100 lines');
        
        const result = await server.handleGetOutput({ lines: 100 });
        
        expect(mockTmuxManager.capturePane).toHaveBeenCalledWith('default', 'main', 100);
        expect(result.content[0].text).toBe('last 100 lines');
      });
      
      test('rejects both lines and search', async () => {
        const result = await server.handleGetOutput({
          lines: 50,
          search: { pattern: 'test' }
        });
        
        expect(result.content[0].text).toBe('Error: Cannot specify both lines and search');
      });
      
      test('searches output with pattern', async () => {
        mockTmuxManager.capturePane.mockResolvedValue('line1\nerror here\nline3\nwarning there\nline5');
        
        const result = await server.handleGetOutput({
          search: {
            pattern: 'error|warning',
            context_lines: 1,
            include_line_numbers: true
          }
        });
        
        expect(result.content[0].text).toContain('1: line1');
        expect(result.content[0].text).toContain('2: error here');
        expect(result.content[0].text).toContain('3: line3');
        expect(result.content[0].text).toContain('4: warning there');
        expect(result.content[0].text).toContain('5: line5');
      });
    });
    
    describe('handleSendInput', () => {
      test('sends input with Enter', async () => {
        const result = await server.handleSendInput({ text: 'hello world' });
        
        expect(mockTmuxManager.sendKeys).toHaveBeenCalledWith('default', 'main', ['h', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd', 'C-m']);
        expect(result.content[0].text).toBe('Sent input to default:main');
      });
      
      test('sends to custom workspace and window', async () => {
        const result = await server.handleSendInput({
          text: 'SELECT * FROM users;',
          workspace_id: 'db',
          window_name: 'mysql'
        });
        
        expect(mockTmuxManager.sendKeys).toHaveBeenCalledWith('db', 'mysql', ['S', 'E', 'L', 'E', 'C', 'T', ' ', '*', ' ', 'F', 'R', 'O', 'M', ' ', 'u', 's', 'e', 'r', 's', ';', 'C-m']);
        expect(result.content[0].text).toBe('Sent input to db:mysql');
      });
    });
    
    describe('handleSendKeys', () => {
      test('sends key sequences', async () => {
        const result = await server.handleSendKeys({ keys: ['C-c', 'C-d'] });
        
        expect(mockTmuxManager.sendKeys).toHaveBeenCalledWith('default', 'main', ['C-c', 'C-d']);
        expect(result.content[0].text).toBe('Sent keys to default:main');
      });
    });
    
    describe('handleCreateWorkspace', () => {
      test('creates workspace', async () => {
        const result = await server.handleCreateWorkspace({ workspace_id: 'newproject' });
        
        expect(mockTmuxManager.createSession).toHaveBeenCalledWith('newproject');
        expect(result.content[0].text).toBe('Created workspace: newproject');
      });
    });
    
    describe('handleDestroyWorkspace', () => {
      test('destroys workspace', async () => {
        const result = await server.handleDestroyWorkspace({ workspace_id: 'oldproject' });
        
        expect(mockTmuxManager.destroySession).toHaveBeenCalledWith('oldproject');
        expect(result.content[0].text).toBe('Destroyed workspace: oldproject');
      });
    });
    
    describe('handleListWorkspaces', () => {
      test('lists workspaces', async () => {
        const result = await server.handleListWorkspaces();
        
        expect(result.content[0].text).toBe('workspace1: main, window1\nworkspace2: main');
      });
      
      test('handles empty workspace list', async () => {
        mockTmuxManager.listWorkspaces.mockResolvedValue([]);
        
        const result = await server.handleListWorkspaces();
        
        expect(result.content[0].text).toBe('No active workspaces.');
      });
    });
    
    describe('handleToolCall', () => {
      test('dispatches to correct handler', async () => {
        const result = await server.handleToolCall('run_command', { command: 'test' });
        
        expect(result.content[0].text).toBe('Started command in default:main');
      });
      
      test('handles unknown tool', async () => {
        const result = await server.handleToolCall('unknown_tool', {});
        
        expect(result.content[0].text).toBe('Error: Unknown tool: unknown_tool');
      });
      
      test('handles tool errors gracefully', async () => {
        mockTmuxManager.createSession.mockRejectedValue(new Error('Tmux not found'));
        
        const result = await server.handleToolCall('create_workspace', { workspace_id: 'test' });
        
        expect(result.content[0].text).toBe('Error: Tmux not found');
      });
    });
  });
  
  describe('Resource Handlers', () => {
    describe('getResourceContent', () => {
      test('returns keys reference content', () => {
        const result = server.getResourceContent('tmux://keys-reference');
        
        expect(result.contents[0].uri).toBe('tmux://keys-reference');
        expect(result.contents[0].mimeType).toBe('text/plain');
        expect(result.contents[0].text).toContain('Common tmux key sequences');
        expect(result.contents[0].text).toContain('C-c: Interrupt process');
      });
      
      test('returns common patterns content', () => {
        const result = server.getResourceContent('tmux://common-patterns');
        
        expect(result.contents[0].uri).toBe('tmux://common-patterns');
        expect(result.contents[0].mimeType).toBe('text/plain');
        expect(result.contents[0].text).toContain('Common tmux usage patterns');
        expect(result.contents[0].text).toContain('Running a command:');
      });
      
      test('throws for unknown resource', () => {
        expect(() => server.getResourceContent('tmux://unknown'))
          .toThrow('Unknown resource: tmux://unknown');
      });
    });
  });
});
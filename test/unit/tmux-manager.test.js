import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { EventEmitter } from 'events';
import * as child_process from 'child_process';
import TmuxManager from '../../src/tmux-manager.js';

describe('TmuxManager', () => {
  let tmuxManager;
  let mockSpawn;
  
  beforeEach(() => {
    tmuxManager = new TmuxManager();
    mockSpawn = mock(() => new EventEmitter());
    spyOn(child_process, 'spawn').mockImplementation(mockSpawn);
  });
  
  afterEach(() => {
    mock.restore();
  });
  
  function createMockProcess(stdout = '', stderr = '', code = 0, delay = 0) {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = new EventEmitter();
    proc.killed = false;
    
    proc.kill = mock((signal) => {
      proc.killed = true;
      proc.emit('close', signal === 'SIGTERM' ? 143 : 0);
    });
    
    setTimeout(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', code);
    }, delay);
    
    return proc;
  }
  
  describe('_runTmuxCommand', () => {
    test('executes tmux command successfully', async () => {
      mockSpawn.mockReturnValue(createMockProcess('session1-MCP\nsession2-MCP\n'));
      
      const result = await tmuxManager._runTmuxCommand(['ls', '-F', '#S']);
      
      expect(result.stdout).toBe('session1-MCP\nsession2-MCP\n');
      expect(result.code).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith('tmux', ['ls', '-F', '#S'], { stdio: ['pipe', 'pipe', 'pipe'] });
    });
    
    test('handles command failure', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no such session', 1));
      
      await expect(tmuxManager._runTmuxCommand(['has-session', '-t', 'test-MCP']))
        .rejects.toThrow('Session not found: no such session');
    });
    
    test('handles timeout', async () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = new EventEmitter();
      proc.killed = false;
      
      proc.kill = mock((signal) => {
        proc.killed = true;
        // Don't emit close event to simulate timeout
      });
      
      mockSpawn.mockReturnValue(proc);
      
      await expect(tmuxManager._runTmuxCommand(['ls'], 100))
        .rejects.toThrow('Tmux command timed out after 100ms');
    });
    
    test('handles tmux not found', async () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = new EventEmitter();
      
      mockSpawn.mockReturnValue(proc);
      
      setTimeout(() => {
        const error = new Error('spawn tmux ENOENT');
        error.code = 'ENOENT';
        proc.emit('error', error);
      }, 0);
      
      await expect(tmuxManager._runTmuxCommand(['ls']))
        .rejects.toThrow('tmux command not found. Please install tmux.');
    });
    
    test('handles stderr without "no server running" or "no such session"', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'some other error', 1));
      
      await expect(tmuxManager._runTmuxCommand(['ls']))
        .rejects.toThrow('tmux command failed with code 1: some other error');
    });
  });
  
  describe('sessionExists', () => {
    test('returns true when session exists', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', '', 0));
      
      const exists = await tmuxManager.sessionExists('test');
      expect(exists).toBe(true);
    });
    
    test('returns false when session does not exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no such session', 1));
      
      const exists = await tmuxManager.sessionExists('test');
      expect(exists).toBe(false);
    });
  });
  
  describe('windowExists', () => {
    test('returns true when window exists', async () => {
      mockSpawn.mockReturnValue(createMockProcess('main\nwindow1\nwindow2\n'));
      
      const exists = await tmuxManager.windowExists('test', 'window1');
      expect(exists).toBe(true);
    });
    
    test('returns false when window does not exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('main\nwindow1\n'));
      
      const exists = await tmuxManager.windowExists('test', 'window2');
      expect(exists).toBe(false);
    });
    
    test('returns false when session does not exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no such session', 1));
      
      const exists = await tmuxManager.windowExists('test', 'main');
      expect(exists).toBe(false);
    });
  });
  
  describe('createSession', () => {
    test('creates new session with main window', async () => {
      // First call: sessionExists returns false
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'no such session', 1));
      // Second call: createSession succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      
      await tmuxManager.createSession('default');
      
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'tmux', ['has-session', '-t', 'default-MCP'], expect.any(Object));
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'tmux', ['new-session', '-d', '-s', 'default-MCP', '-n', 'main'], expect.any(Object));
      expect(tmuxManager.sessionMetadata.get('default')).toEqual({
        id: 'default',
        created: expect.any(Number),
        windows: ['main']
      });
    });
    
    test('does nothing if session already exists', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', '', 0));
      
      await tmuxManager.createSession('test');
      
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(tmuxManager.sessionMetadata.has('test')).toBe(false);
    });
  });
  
  describe('createWindow', () => {
    test('creates new window in existing session', async () => {
      // Pre-populate metadata
      tmuxManager.sessionMetadata.set('test', {
        id: 'test',
        created: Date.now(),
        windows: ['main']
      });
      
      // sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // windowExists returns false
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // createWindow succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      
      await tmuxManager.createWindow('test', 'window1');
      
      expect(mockSpawn).toHaveBeenCalledTimes(3);
      expect(tmuxManager.sessionMetadata.get('test').windows).toContain('window1');
    });
    
    test('creates session if it does not exist', async () => {
      // sessionExists returns false
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'no such session', 1));
      // createSession succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // windowExists returns false
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // createWindow succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      
      await tmuxManager.createWindow('test', 'window1');
      
      expect(mockSpawn).toHaveBeenCalledTimes(4);
      expect(tmuxManager.sessionMetadata.get('test').windows).toContain('window1');
    });
    
    test('does nothing if window already exists', async () => {
      // sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // windowExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('main\nwindow1\n'));
      
      await tmuxManager.createWindow('test', 'window1');
      
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('destroySession', () => {
    test('destroys existing session', async () => {
      tmuxManager.sessionMetadata.set('test', { id: 'test', windows: [] });
      
      // sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // killSession succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      
      await tmuxManager.destroySession('test');
      
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(tmuxManager.sessionMetadata.has('test')).toBe(false);
    });
    
    test('does nothing if session does not exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no such session', 1));
      
      await tmuxManager.destroySession('test');
      
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('listSessions', () => {
    test('returns list of MCP sessions', async () => {
      mockSpawn.mockReturnValue(createMockProcess('session1-MCP\nsession2-MCP\nother-session\n'));
      
      const sessions = await tmuxManager.listSessions();
      
      expect(sessions).toEqual(['session1', 'session2']);
    });
    
    test('returns empty array when no sessions exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no server running', 1));
      
      const sessions = await tmuxManager.listSessions();
      
      expect(sessions).toEqual([]);
    });
    
    test('filters out empty session names', async () => {
      mockSpawn.mockReturnValue(createMockProcess('-MCP\nsession1-MCP\n'));
      
      const sessions = await tmuxManager.listSessions();
      
      expect(sessions).toEqual(['session1']);
    });
  });
  
  describe('listWindows', () => {
    test('returns list of windows in session', async () => {
      mockSpawn.mockReturnValue(createMockProcess('main\nwindow1\nwindow2\n'));
      
      const windows = await tmuxManager.listWindows('test');
      
      expect(windows).toEqual(['main', 'window1', 'window2']);
    });
    
    test('returns empty array when session does not exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no such session', 1));
      
      const windows = await tmuxManager.listWindows('test');
      
      expect(windows).toEqual([]);
    });
  });
  
  describe('listWorkspaces', () => {
    test('returns workspaces with their windows', async () => {
      // listSessions
      mockSpawn.mockReturnValueOnce(createMockProcess('workspace1-MCP\nworkspace2-MCP\n'));
      // listWindows for workspace1
      mockSpawn.mockReturnValueOnce(createMockProcess('main\nwindow1\n'));
      // listWindows for workspace2
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      
      const workspaces = await tmuxManager.listWorkspaces();
      
      expect(workspaces).toEqual([
        { workspace_id: 'workspace1', windows: ['main', 'window1'] },
        { workspace_id: 'workspace2', windows: ['main'] }
      ]);
    });
    
    test('returns empty array when no sessions exist', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 'no server running', 1));
      
      const workspaces = await tmuxManager.listWorkspaces();
      
      expect(workspaces).toEqual([]);
    });
  });
  
  describe('sendKeys', () => {
    test('sends keys to existing window', async () => {
      // createSession - sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // createWindow - windowExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // sendKeys succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      
      await tmuxManager.sendKeys('test', 'main', ['C-c', 'Enter']);
      
      expect(mockSpawn).toHaveBeenCalledTimes(3);
      expect(mockSpawn).toHaveBeenNthCalledWith(3, 'tmux', ['send-keys', '-t', 'test-MCP:main', 'C-c', 'Enter'], expect.any(Object));
    });
    
    test('creates window if it does not exist', async () => {
      // createSession - sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // createWindow - windowExists returns false
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // createWindow - new-window succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // sendKeys succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      
      await tmuxManager.sendKeys('test', 'window1', ['text']);
      
      expect(mockSpawn).toHaveBeenCalledTimes(4);
    });
  });
  
  describe('capturePane', () => {
    test('captures pane output with default scrollback', async () => {
      // createSession - sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // createWindow - windowExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // capturePane succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('line1\nline2\nline3\n'));
      
      const output = await tmuxManager.capturePane('test', 'main');
      
      expect(output).toBe('line1\nline2\nline3\n');
      expect(mockSpawn).toHaveBeenNthCalledWith(3, 'tmux', ['capture-pane', '-p', '-t', 'test-MCP:main', '-S', '-'], expect.any(Object));
    });
    
    test('captures pane output with specific line count', async () => {
      // createSession - sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // createWindow - windowExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // capturePane succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('last 50 lines\n'));
      
      const output = await tmuxManager.capturePane('test', 'main', 50);
      
      expect(output).toBe('last 50 lines\n');
      expect(mockSpawn).toHaveBeenNthCalledWith(3, 'tmux', ['capture-pane', '-p', '-t', 'test-MCP:main', '-S', '-50'], expect.any(Object));
    });
    
    test('creates window if it does not exist', async () => {
      // createSession - sessionExists returns true
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // createWindow - windowExists returns false
      mockSpawn.mockReturnValueOnce(createMockProcess('main\n'));
      // createWindow - new-window succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0));
      // capturePane succeeds
      mockSpawn.mockReturnValueOnce(createMockProcess('output\n'));
      
      const output = await tmuxManager.capturePane('test', 'window1');
      
      expect(output).toBe('output\n');
      expect(mockSpawn).toHaveBeenCalledTimes(4);
    });
  });
});
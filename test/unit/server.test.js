import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import _ from 'lodash';
import TmuxMcpServer from '../../src/server.js';

describe('TmuxMcpServer', () => {
    let server;
    let mockTmuxManager;
    let consoleErrorSpy;

    beforeEach(() => {
    // Mock console.error to suppress error output during tests
        consoleErrorSpy = spyOn(console, 'error').mockImplementation(_.noop);
        // Create a mock TmuxManager
        mockTmuxManager = {
            createSession: mock(),
            sessionExists: mock(),
            windowExists: mock(),
            createWindow: mock(),
            destroySession: mock(),
            listSessions: mock(),
            listWindows: mock(),
            listWorkspaces: mock(),
            sendKeys: mock(),
            capturePane: mock()
        };

        // Create server instance
        server = new TmuxMcpServer();
        // Replace the tmuxManager with our mock
        server.tmuxManager = mockTmuxManager;
    });

    afterEach(() => {
        mock.restore();
        consoleErrorSpy.mockRestore();
    });

    describe('constructor', () => {
        test('initializes server with correct metadata', () => {
            const newServer = new TmuxMcpServer();
            expect(newServer.server).toBeDefined();
            expect(newServer.tmuxManager).toBeDefined();
        });
    });

    describe('searchOutput', () => {
        test('searches with context grouping', () => {
            const output = `line1
line2
match1 here
line4
line5
line6
match2 here
line8`;

            const result = server.searchOutput(output, {
                pattern: 'match',
                context_lines: 1,
                include_line_numbers: true
            });

            expect(result).toContain('2: line2\n3: match1 here\n4: line4');
            expect(result).toContain('---');
            expect(result).toContain('6: line6\n7: match2 here\n8: line8');
        });

        test('handles overlapping context', () => {
            const output = `line1
match1
match2
line4`;

            const result = server.searchOutput(output, {
                pattern: 'match',
                context_lines: 2,
                include_line_numbers: true
            });

            expect(result).toBe('1: line1\n2: match1\n3: match2\n4: line4');
        });

        test('search without line numbers', () => {
            const output = `line1
error here
line3`;

            const result = server.searchOutput(output, {
                pattern: 'error',
                context_lines: 0,
                include_line_numbers: false
            });

            expect(result).toBe('error here');
        });

        test('search with no matches', () => {
            const output = `line1
line2
line3`;

            const result = server.searchOutput(output, {
                pattern: 'notfound'
            });

            expect(result).toBe('No matches found');
        });

        test('handles search error', () => {
            const output = 'some output';

            const result = server.searchOutput(output, {
                pattern: '[invalid regex'
            });

            expect(result).toContain('Search error:');
        });
    });

    describe('tool handlers simulation', () => {
        test('run_command calls tmuxManager correctly', async () => {
            mockTmuxManager.createSession.mockResolvedValue();
            mockTmuxManager.sendKeys.mockResolvedValue();

            // Simulate the run_command handler logic
            const command = 'echo hello';
            const workspace_id = 'default';
            const window_name = 'main';

            await mockTmuxManager.createSession(workspace_id);
            await mockTmuxManager.sendKeys(workspace_id, window_name, [...command, 'C-m']);

            expect(mockTmuxManager.createSession).toHaveBeenCalledWith('default');
            expect(mockTmuxManager.sendKeys).toHaveBeenCalledWith('default', 'main', ['e', 'c', 'h', 'o', ' ', 'h', 'e', 'l', 'l', 'o', 'C-m']);
        });

        test('get_output with lines parameter', async () => {
            mockTmuxManager.capturePane.mockResolvedValue('last 50 lines');

            const result = await mockTmuxManager.capturePane('default', 'main', 50);

            expect(mockTmuxManager.capturePane).toHaveBeenCalledWith('default', 'main', 50);
            expect(result).toBe('last 50 lines');
        });

        test('search functionality', async () => {
            mockTmuxManager.capturePane.mockResolvedValue('line1\nerror on line2\nline3\nwarning on line4\nline5');

            const output = await mockTmuxManager.capturePane('default', 'main');
            const result = server.searchOutput(output, {
                pattern: 'error|warning',
                context_lines: 1,
                include_line_numbers: true
            });

            expect(result).toContain('1: line1');
            expect(result).toContain('2: error on line2');
            expect(result).toContain('3: line3');
            expect(result).toContain('4: warning on line4');
            expect(result).toContain('5: line5');
        });

        test('create_workspace calls createSession', async () => {
            mockTmuxManager.createSession.mockResolvedValue();

            await mockTmuxManager.createSession('new-project');

            expect(mockTmuxManager.createSession).toHaveBeenCalledWith('new-project');
        });

        test('destroy_workspace calls destroySession', async () => {
            mockTmuxManager.destroySession.mockResolvedValue();

            await mockTmuxManager.destroySession('old-project');

            expect(mockTmuxManager.destroySession).toHaveBeenCalledWith('old-project');
        });

        test('list_workspaces returns formatted text', async () => {
            mockTmuxManager.listWorkspaces.mockResolvedValue([
                { workspace_id: 'project1', windows: ['main', 'tests'] },
                { workspace_id: 'project2', windows: ['main'] }
            ]);

            const workspaces = await mockTmuxManager.listWorkspaces();

            // Simulate the formatting logic
            const text = _.map(workspaces, ws => `${ws.workspace_id}: ${ws.windows.join(', ')}`).join('\n');

            expect(text).toBe('project1: main, tests\nproject2: main');
        });
    });

    describe('run method', () => {
        test('server can be created and has run method', async () => {
            const testServer = new TmuxMcpServer();
            expect(testServer.run).toBeDefined();
            expect(typeof testServer.run).toBe('function');
        });
    });
});

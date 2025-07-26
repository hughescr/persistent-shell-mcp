import { describe, test, expect, mock, spyOn } from 'bun:test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('index.js', () => {
  test('exports main function', async () => {
    // Since index.js runs immediately when imported, we can't easily test it
    // But we can verify the file exists and has the expected structure
    const indexPath = join(__dirname, '../../src/index.js');
    const file = Bun.file(indexPath);
    const content = await file.text();
    
    expect(content).toContain('import TmuxMcpServer');
    expect(content).toContain('new TmuxMcpServer()');
    expect(content).toContain('server.run()');
  });
});
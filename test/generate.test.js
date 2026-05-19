import { jest } from '@jest/globals';
import { generateFileTree, getLanguageFromExtension } from '../lib/generate.js';

const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  consoleSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('Generate Module', () => {
  test('generates a stable tree for nested files', () => {
    const tree = generateFileTree([
      'package.json',
      'src/index.js',
      'src/utils/format.js'
    ]);

    expect(tree).toContain('Project Structure:');
    expect(tree).toContain('package.json');
    expect(tree).toContain('src');
    expect(tree).toContain('index.js');
    expect(tree).toContain('format.js');
  });

  test('detects markdown code block languages by extension', () => {
    expect(getLanguageFromExtension('app.js')).toBe('javascript');
    expect(getLanguageFromExtension('types.ts')).toBe('typescript');
    expect(getLanguageFromExtension('README.md')).toBe('markdown');
    expect(getLanguageFromExtension('unknown.custom')).toBe('');
  });
});

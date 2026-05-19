import { buildMapMarkdown, classifyFileRole } from '../lib/context/map.js';

describe('Context Map', () => {
  test('classifies common repository file roles', () => {
    expect(classifyFileRole('package.json')).toBe('config');
    expect(classifyFileRole('README.md')).toBe('docs');
    expect(classifyFileRole('test/app.test.js')).toBe('tests');
    expect(classifyFileRole('lib/app.js')).toBe('source');
  });

  test('renders a compact repository map grouped by role', () => {
    const markdown = buildMapMarkdown([
      'lib/app.js',
      'test/app.test.js',
      'package.json',
      'README.md'
    ]);

    expect(markdown).toContain('# Repository Map');
    expect(markdown).toContain('## source');
    expect(markdown).toContain('- lib/app.js');
    expect(markdown).toContain('## tests');
  });
});

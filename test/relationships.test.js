/**
 * Tests for file relationship analysis module
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import {
  analyzeFileRelationships,
  analyzeProjectRelationships,
  groupFilesByFunction,
  generateDependencyGraph
} from '../lib/relationships.js';

const testDir = path.join(process.cwd(), 'test-temp-relationships');

beforeEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(path.join(testDir, 'components'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'services'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('Relationship Analysis', () => {
  describe('analyzeFileRelationships', () => {
    test('detects JavaScript imports and exports', async () => {
      const filePath = '/test/app.js';
      const content = `
import React from 'react';
import { useState } from 'react';
import utils from './utils.js';

export const App = () => {
  return <div>Hello</div>;
};

export default App;
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result).toMatchObject({
        filePath: '/test/app.js',
        language: 'javascript',
        imports: expect.arrayContaining([
          expect.objectContaining({ path: 'react' }),
          expect.objectContaining({ path: './utils.js' })
        ]),
        exports: expect.arrayContaining([
          expect.objectContaining({ name: 'App' })
        ])
      });

      expect(result).not.toHaveProperty('frameworks');
      expect(result.summary).toContain('Function definitions');
      expect(result.stats.importCount).toBe(3);
      expect(result.stats.exportCount).toBeGreaterThan(0);
    });

    test('detects Python imports', async () => {
      const filePath = '/test/main.py';
      const content = `
import os
from flask import Flask, request
import json

app = Flask(__name__)

def hello_world():
    return "Hello World"

class UserService:
    pass
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result).toMatchObject({
        filePath: '/test/main.py',
        language: 'python',
        imports: expect.arrayContaining([
          expect.objectContaining({ path: 'os' }),
          expect.objectContaining({ path: 'flask' }),
          expect.objectContaining({ path: 'json' })
        ])
      });

      expect(result).not.toHaveProperty('frameworks');
      expect(result.summary).toContain('Class-based module');
    });

    test('detects TypeScript with interfaces', async () => {
      const filePath = '/test/types.ts';
      const content = `
import { Component } from 'react';
import type { User } from './models';

interface Props {
  user: User;
}

export class UserComponent extends Component<Props> {
  render() {
    return null;
  }
}

export type { Props };
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result.language).toBe('typescript');
      expect(result).not.toHaveProperty('frameworks');
      expect(result.imports).toHaveLength(2);
      expect(result.exports).toContainEqual(
        expect.objectContaining({ name: 'UserComponent' })
      );
    });

    test('handles files with no imports or exports', async () => {
      const filePath = '/test/config.js';
      const content = `
const PORT = 3000;
const HOST = 'localhost';

console.log('Server starting...');
      `;

      const result = await analyzeFileRelationships(filePath, content);

      expect(result).toMatchObject({
        filePath: '/test/config.js',
        language: 'javascript',
        imports: [],
        exports: [],
        stats: {
          importCount: 0,
          exportCount: 0
        }
      });
    });

    test('generates file summaries from naming and content heuristics', async () => {
      const testCases = [
        {
          path: '/test/component.test.js',
          content: 'describe("Component", () => {});',
          expectedSummary: 'Test file'
        },
        {
          path: '/test/webpack.config.js',
          content: 'module.exports = {};',
          expectedSummary: 'Configuration file'
        },
        {
          path: '/test/user.service.js',
          content: 'export class UserService {}',
          expectedSummary: 'Service module'
        },
        {
          path: '/test/utils.js',
          content: 'export function helper() {}',
          expectedSummary: 'Utility functions'
        }
      ];

      for (const testCase of testCases) {
        const result = await analyzeFileRelationships(testCase.path, testCase.content);
        expect(result.summary.toLowerCase()).toContain(testCase.expectedSummary.toLowerCase().split(' ')[0]);
      }
    });
  });

  describe('analyzeProjectRelationships', () => {
    test('analyzes multiple files and builds dependency graph', async () => {
      const appPath = path.join(testDir, 'app.js');
      const utilsPath = path.join(testDir, 'utils.js');
      const configPath = path.join(testDir, 'config.js');

      await fs.writeFile(appPath, `
import utils from './utils.js';
import config from './config.js';
export default function app() {}
      `);
      await fs.writeFile(utilsPath, `
export function helper() {}
export default { helper };
      `);
      await fs.writeFile(configPath, `
export const PORT = 3000;
      `);

      const result = await analyzeProjectRelationships([
        { path: appPath },
        { path: utilsPath },
        { path: configPath }
      ]);

      expect(result.relationships.size).toBe(3);
      expect(result.dependencyGraph.size).toBe(3);
      expect(result.stats.totalFiles).toBe(3);
      expect(result.stats.analyzedFiles).toBe(3);

      const appDeps = result.dependencyGraph.get(appPath);
      expect(appDeps.dependencies).toContain(utilsPath);
      expect(appDeps.dependencies).toContain(configPath);

      const utilsDeps = result.dependencyGraph.get(utilsPath);
      expect(utilsDeps.dependents).toContain(appPath);
    });
  });

  describe('groupFilesByFunction', () => {
    test('groups files by parent directory', () => {
      const mockRelationships = new Map([
        ['/test/components/App.jsx', { language: 'javascript' }],
        ['/test/components/Button.jsx', { language: 'javascript' }],
        ['/test/services/api.js', { language: 'javascript' }],
        ['/test/utils/helpers.js', { language: 'javascript' }]
      ]);

      const mockDependencyGraph = new Map([
        ['/test/components/App.jsx', { dependencies: [], dependents: [] }],
        ['/test/components/Button.jsx', { dependencies: [], dependents: [] }],
        ['/test/services/api.js', { dependencies: [], dependents: [] }],
        ['/test/utils/helpers.js', { dependencies: [], dependents: [] }]
      ]);

      const groups = groupFilesByFunction(mockRelationships, mockDependencyGraph);

      expect(groups.has('components')).toBe(true);
      expect(groups.get('components').size).toBe(2);
      expect(groups.get('components')).toContain('/test/components/App.jsx');
      expect(groups.get('components')).toContain('/test/components/Button.jsx');
    });
  });

  describe('generateDependencyGraph', () => {
    test('generates text-based dependency tree', () => {
      const mockRelationships = new Map([
        ['/test/app.js', { language: 'javascript' }],
        ['/test/utils.js', { language: 'javascript' }]
      ]);

      const mockDependencyGraph = new Map([
        ['/test/app.js', { dependencies: ['/test/utils.js'], dependents: [] }],
        ['/test/utils.js', { dependencies: [], dependents: ['/test/app.js'] }]
      ]);

      const graph = generateDependencyGraph(mockRelationships, mockDependencyGraph);

      expect(graph).toContain('app.js');
      expect(graph).toContain('utils.js');
      expect(graph).toMatch(/├──|└──/);
    });
  });

  describe('error handling', () => {
    test('handles analysis errors gracefully', async () => {
      const result = await analyzeFileRelationships('/nonexistent/file.js', 'invalid content');

      expect(result).toMatchObject({
        filePath: '/nonexistent/file.js',
        language: 'javascript',
        imports: [],
        exports: [],
        stats: {
          importCount: 0,
          exportCount: 0
        }
      });
      expect(result).not.toHaveProperty('frameworks');
    });
  });
});

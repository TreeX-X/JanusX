/**
 * src/main/project/config/project-schemas.ts
 * 项目类型的 Schema 定义，用于 UI 动态生成配置表单
 */

import type { ProjectTypeSchema } from '../types'
import { ProjectType } from '../types'

/**
 * 所有支持的项目类型的 Schema 定义
 */
export const PROJECT_SCHEMAS: Record<ProjectType, ProjectTypeSchema> = {
  // ════════════════════════════════════════════════════════════
  // Node.js 生态
  // ════════════════════════════════════════════════════════════

  [ProjectType.NextJs]: {
    type: ProjectType.NextJs,
    displayName: 'Next.js',
    description: 'React framework with SSR and static generation',
    icon: '⚛️',
    featureFiles: ['package.json', 'next.config.js', 'pages/'],
    defaultCommand: 'npm run dev',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
        description: 'Unique identifier for this configuration (e.g., dev, prod)',
      },
      {
        name: 'packageManager',
        label: 'Package Manager',
        type: 'select',
        defaultValue: 'npm',
        options: [
          { label: 'npm', value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'yarn', value: 'yarn' },
          { label: 'bun', value: 'bun' },
        ],
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 3000,
        help: 'Server port',
      },
      {
        name: 'env',
        label: 'Environment Variables',
        type: 'object',
        defaultValue: { NODE_ENV: 'development' },
        help: 'Key-value pairs of environment variables',
      },
    ],
  },

  [ProjectType.Vite]: {
    type: ProjectType.Vite,
    displayName: 'Vite',
    description: 'Next generation frontend tooling',
    icon: '⚡',
    featureFiles: ['package.json', 'vite.config.ts', 'src/'],
    defaultCommand: 'npm run dev',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'packageManager',
        label: 'Package Manager',
        type: 'select',
        defaultValue: 'npm',
        options: [
          { label: 'npm', value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'yarn', value: 'yarn' },
          { label: 'bun', value: 'bun' },
        ],
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 5173,
      },
      {
        name: 'args',
        label: 'Additional Arguments',
        type: 'array',
        defaultValue: [],
        help: 'Extra flags to pass to vite (e.g., --host, --strictPort)',
      },
    ],
  },

  [ProjectType.ElectronVite]: {
    type: ProjectType.ElectronVite,
    displayName: 'Electron Vite',
    description: 'Electron desktop app built with Vite + React',
    icon: '⚡',
    featureFiles: ['package.json', 'electron.vite.config.ts', 'src/'],
    defaultCommand: 'npm run dev',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'packageManager',
        label: 'Package Manager',
        type: 'select',
        defaultValue: 'npm',
        options: [
          { label: 'npm', value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'yarn', value: 'yarn' },
          { label: 'bun', value: 'bun' },
        ],
      },
      {
        name: 'args',
        label: 'Additional Arguments',
        type: 'array',
        defaultValue: [],
        help: 'Extra flags to pass to electron-vite',
      },
    ],
  },

  [ProjectType.CreateReactApp]: {
    type: ProjectType.CreateReactApp,
    displayName: 'Create React App',
    description: 'Set up a new React application',
    icon: '⚛️',
    featureFiles: ['package.json', 'react-scripts', 'public/index.html'],
    defaultCommand: 'npm start',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'packageManager',
        label: 'Package Manager',
        type: 'select',
        defaultValue: 'npm',
        options: [
          { label: 'npm', value: 'npm' },
          { label: 'yarn', value: 'yarn' },
        ],
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 3000,
      },
    ],
  },

  [ProjectType.Remix]: {
    type: ProjectType.Remix,
    displayName: 'Remix',
    description: 'Full stack web framework',
    icon: '🎵',
    featureFiles: ['package.json', 'remix.config.js', 'app/'],
    defaultCommand: 'npm run dev',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'packageManager',
        label: 'Package Manager',
        type: 'select',
        defaultValue: 'npm',
        options: [
          { label: 'npm', value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'yarn', value: 'yarn' },
        ],
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 3000,
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 编译语言
  // ════════════════════════════════════════════════════════════

  [ProjectType.Rust]: {
    type: ProjectType.Rust,
    displayName: 'Rust (Cargo)',
    description: 'Systems programming language',
    icon: '🦀',
    featureFiles: ['Cargo.toml', 'src/main.rs'],
    defaultCommand: 'cargo run',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'buildType',
        label: 'Build Type',
        type: 'select',
        defaultValue: 'Debug',
        options: [
          { label: 'Debug', value: 'Debug' },
          { label: 'Release', value: 'Release' },
        ],
      },
      {
        name: 'args',
        label: 'Runtime Arguments',
        type: 'array',
        defaultValue: [],
        help: 'Arguments to pass to the Rust program',
      },
      {
        name: 'env',
        label: 'Environment Variables',
        type: 'object',
        defaultValue: { RUST_LOG: 'debug' },
      },
    ],
  },

  [ProjectType.CppCMake]: {
    type: ProjectType.CppCMake,
    displayName: 'C++ (CMake)',
    description: 'C++ project with CMake build system',
    icon: '🔧',
    featureFiles: ['CMakeLists.txt', 'src/', 'include/'],
    defaultCommand: 'cmake --build build && ./build/app',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'Debug',
      },
      {
        name: 'buildDir',
        label: 'Build Directory',
        type: 'text',
        required: true,
        defaultValue: '${workspaceFolder}/build',
        help: 'Directory for build artifacts',
      },
      {
        name: 'buildType',
        label: 'Build Type',
        type: 'select',
        defaultValue: 'Debug',
        options: [
          { label: 'Debug', value: 'Debug' },
          { label: 'Release', value: 'Release' },
          { label: 'RelWithDebInfo', value: 'RelWithDebInfo' },
          { label: 'MinSizeRel', value: 'MinSizeRel' },
        ],
      },
      {
        name: 'compiler',
        label: 'Compiler',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Auto', value: 'auto' },
          { label: 'GCC', value: 'gcc' },
          { label: 'Clang', value: 'clang' },
          { label: 'MSVC', value: 'msvc' },
        ],
        help: 'C++ compiler to use',
      },
      {
        name: 'target',
        label: 'Target Executable',
        type: 'text',
        defaultValue: 'my_app',
        help: 'Name of the executable to run',
      },
      {
        name: 'args',
        label: 'Program Arguments',
        type: 'array',
        defaultValue: [],
      },
    ],
  },

  [ProjectType.CppMake]: {
    type: ProjectType.CppMake,
    displayName: 'C++ (Make)',
    description: 'C++ project with Makefile build system',
    icon: '🔧',
    featureFiles: ['Makefile', 'src/'],
    defaultCommand: 'make && ./app',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'Debug',
      },
      {
        name: 'target',
        label: 'Target',
        type: 'text',
        defaultValue: 'all',
        help: 'Make target to build',
      },
      {
        name: 'args',
        label: 'Program Arguments',
        type: 'array',
        defaultValue: [],
      },
    ],
  },

  [ProjectType.Go]: {
    type: ProjectType.Go,
    displayName: 'Go',
    description: 'Go programming language',
    icon: '🐹',
    featureFiles: ['go.mod', 'go.sum', 'main.go'],
    defaultCommand: 'go run .',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'mainPackage',
        label: 'Main Package',
        type: 'text',
        defaultValue: '.',
        help: 'Path to the main package',
      },
      {
        name: 'args',
        label: 'Program Arguments',
        type: 'array',
        defaultValue: [],
      },
      {
        name: 'env',
        label: 'Environment Variables',
        type: 'object',
        defaultValue: { CGO_ENABLED: '1' },
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 脚本语言
  // ════════════════════════════════════════════════════════════

  [ProjectType.Django]: {
    type: ProjectType.Django,
    displayName: 'Django',
    description: 'Python web framework',
    icon: '🐍',
    featureFiles: ['manage.py', 'settings.py', 'requirements.txt'],
    defaultCommand: 'python manage.py runserver',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'pythonPath',
        label: 'Python Executable',
        type: 'text',
        defaultValue: 'python',
        help: 'Path to Python interpreter',
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 8000,
      },
      {
        name: 'args',
        label: 'Management Command Args',
        type: 'array',
        defaultValue: [],
      },
    ],
  },

  [ProjectType.Flask]: {
    type: ProjectType.Flask,
    displayName: 'Flask',
    description: 'Python lightweight web framework',
    icon: '🐍',
    featureFiles: ['app.py', 'requirements.txt'],
    defaultCommand: 'flask run',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'pythonPath',
        label: 'Python Executable',
        type: 'text',
        defaultValue: 'python',
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 5000,
      },
      {
        name: 'env',
        label: 'Environment Variables',
        type: 'object',
        defaultValue: { FLASK_ENV: 'development', FLASK_DEBUG: '1' },
      },
    ],
  },

  [ProjectType.FastAPI]: {
    type: ProjectType.FastAPI,
    displayName: 'FastAPI',
    description: 'Modern Python web framework for APIs',
    icon: '⚡',
    featureFiles: ['main.py', 'requirements.txt', 'pyproject.toml'],
    defaultCommand: 'uvicorn main:app --reload',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'pythonPath',
        label: 'Python Executable',
        type: 'text',
        defaultValue: 'python',
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 8000,
      },
      {
        name: 'host',
        label: 'Host',
        type: 'text',
        defaultValue: '127.0.0.1',
      },
    ],
  },

  [ProjectType.Laravel]: {
    type: ProjectType.Laravel,
    displayName: 'Laravel',
    description: 'PHP web application framework',
    icon: '🔷',
    featureFiles: ['artisan', 'composer.json', 'app/'],
    defaultCommand: 'php artisan serve',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        defaultValue: 8000,
      },
      {
        name: 'args',
        label: 'Artisan Command Args',
        type: 'array',
        defaultValue: [],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  // 其他
  // ════════════════════════════════════════════════════════════

  [ProjectType.Unknown]: {
    type: ProjectType.Unknown,
    displayName: 'Unknown Project',
    description: 'Custom project configuration',
    icon: '❓',
    featureFiles: [],
    defaultCommand: 'custom command',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'program',
        label: 'Program / Command',
        type: 'text',
        required: true,
        help: 'Command to execute',
      },
      {
        name: 'args',
        label: 'Arguments',
        type: 'array',
        defaultValue: [],
      },
      {
        name: 'cwd',
        label: 'Working Directory',
        type: 'text',
        defaultValue: '${workspaceFolder}',
      },
    ],
  },

  [ProjectType.Custom]: {
    type: ProjectType.Custom,
    displayName: 'Custom',
    description: 'Fully customizable configuration',
    icon: '⚙️',
    featureFiles: [],
    defaultCommand: 'custom',
    fields: [
      {
        name: 'name',
        label: 'Configuration Name',
        type: 'text',
        required: true,
        defaultValue: 'dev',
      },
      {
        name: 'program',
        label: 'Program',
        type: 'text',
        required: true,
      },
      {
        name: 'args',
        label: 'Arguments',
        type: 'array',
        defaultValue: [],
      },
      {
        name: 'cwd',
        label: 'Working Directory',
        type: 'text',
        defaultValue: '${workspaceFolder}',
      },
      {
        name: 'env',
        label: 'Environment',
        type: 'object',
        defaultValue: {},
      },
    ],
  },
}

/**
 * 获取项目类型的 Schema
 */
export function getProjectSchema(type: ProjectType): ProjectTypeSchema {
  return PROJECT_SCHEMAS[type] || PROJECT_SCHEMAS[ProjectType.Custom]
}

/**
 * 获取所有支持的项目类型列表
 */
export function getProjectTypes(): ProjectTypeSchema[] {
  return Object.values(PROJECT_SCHEMAS).filter(s => s.type !== ProjectType.Unknown)
}

/**
 * 根据特征文件检测项目类型的候选项
 */
export function detectByFeatures(featureFiles: string[]): ProjectType[] {
  const candidates: { type: ProjectType; matchCount: number }[] = []

  for (const schema of Object.values(PROJECT_SCHEMAS)) {
    if (schema.type === ProjectType.Unknown || schema.type === ProjectType.Custom) {
      continue
    }

    const matchCount = schema.featureFiles.filter(feature =>
      featureFiles.some(file => file.includes(feature)),
    ).length

    if (matchCount > 0) {
      candidates.push({
        type: schema.type as ProjectType,
        matchCount,
      })
    }
  }

  // 按匹配数降序排列
  return candidates.sort((a, b) => b.matchCount - a.matchCount).map(c => c.type)
}

export default PROJECT_SCHEMAS

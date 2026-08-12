import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      'out/**',
      'packages/llm-core/dist/**',
      'src/renderer/src/i18n/types.ts',
      'tests/**',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'prefer-const': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXText[value=/[\\u4e00-\\u9fff]/]",
          message: 'JSX 中禁止直接出现中文字面量。用户可见字符串必须使用 t() 函数：{t(\'namespace:key\')}。详见 docs/00-总览与工程化/i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='aria-label'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'aria-label 禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='title'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'title 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='placeholder'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'placeholder 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='label'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'label 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='hint'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'hint 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='description'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'description 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='confirmText'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'confirmText 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
        {
          selector: "JSXAttribute[name.name='cancelText'] > Literal[value=/[\\u4e00-\\u9fff]/]",
          message: 'cancelText 属性禁止直接使用中文字面量，必须用 t() 函数。详见 i18n-架构方案.md',
        },
      ],
    },
  },
)
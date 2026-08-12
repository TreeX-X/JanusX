import type { Config } from 'i18next-parser'

const config: Config = {
  createOld: false,
  indentation: 2,
  lexers: {
    tsx: ['JsxLexer'],
    ts: ['JsxLexer'],
  },
  input: ['src/renderer/src/**/*.{ts,tsx}'],
  output: 'src/renderer/src/i18n/locales/$lng/$ns.json',
  locales: ['zh-CN', 'en'],
  defaultNamespace: 'common',
  defaultLng: 'zh-CN',
  namespaceSeparator: ':',
  keySeparator: '.',
  pluralSeparator: '_',
  verbose: true,
  sort: true,
  keepRemoved: false,
}

export default config
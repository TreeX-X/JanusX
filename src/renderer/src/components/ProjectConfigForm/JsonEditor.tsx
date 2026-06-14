/**
 * src/renderer/src/components/ProjectConfigForm/JsonEditor.tsx
 *
 * JSON 编辑器组件
 * 使用 @monaco-editor/react 进行 JSON 编辑和验证
 */

import { useCallback } from 'react'
import Editor from '@monaco-editor/react'
import styles from './JsonEditor.module.css'

interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

/*-- switchx-dark 主题定义，与 MonacoViewer 保持一致 --*/
const handleBeforeMount = (monaco: any) => {
  monaco.editor.defineTheme('switchx-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0a0a0a',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#1a1a1a',
      'editorCursor.foreground': '#ff7830',
      'editor.selectionBackground': '#264f78',
      'editorLineNumber.foreground': '#444444',
      'editorLineNumber.activeForeground': '#888888',
      'editor.inactiveSelectionBackground': '#1e3a56',
    },
  })
}

function LoadingIndicator() {
  return (
    <div className={styles.loading} style={{ background: '#0a0a0a' }}>
      <div className={styles.loadingInner}>
        <span style={{ color: '#555', fontSize: 12 }}>Loading</span>
        <span className={styles.loadingDot} />
      </div>
    </div>
  )
}

/**
 * JSON 编辑器
 * 基于 @monaco-editor/react 的完整 JSON 编辑体验
 */
export function JsonEditor({ value, onChange, readOnly = false }: JsonEditorProps) {
  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val || '')
    },
    [onChange],
  )

  return (
    <div className={styles.container}>
      <div className={styles.editor}>
        <Editor
          height="100%"
          language="json"
          value={value}
          onChange={handleChange}
          theme="switchx-dark"
          loading={<LoadingIndicator />}
          options={{
            fontSize: 13,
            fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            padding: { top: 12, bottom: 12 },
            readOnly,
            domReadOnly: readOnly,
            formatOnPaste: true,
            formatOnType: true,
            tabSize: 2,
            contextmenu: false,
            automaticLayout: true,
          }}
          beforeMount={handleBeforeMount}
        />
      </div>
      <div className={styles.hint}>
        直接编辑 JSON 配置。格式错误会在保存时提示。
      </div>
    </div>
  )
}

export default JsonEditor

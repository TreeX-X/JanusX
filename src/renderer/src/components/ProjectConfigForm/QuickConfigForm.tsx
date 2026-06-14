/**
 * src/renderer/src/components/ProjectConfigForm/QuickConfigForm.tsx
 *
 * 快速配置表单
 * 根据 Schema 动态生成表单字段
 * 支持：text, number, select, array, object
 */

import { useCallback, useMemo, useState } from 'react'
import type { LaunchConfig, ProjectTypeSchema, SchemaField } from '@/types/project'
import styles from './QuickConfigForm.module.css'

interface QuickConfigFormProps {
  config: LaunchConfig | null
  schema: ProjectTypeSchema | null
  onChange: (updates: Partial<LaunchConfig>) => void
}

/**
 * 动态配置表单
 * 根据项目类型的 Schema 自动生成表单
 * 只显示关键配置字段
 */
export function QuickConfigForm({ config, schema, onChange }: QuickConfigFormProps) {
  const [selectedConfigIndex, setSelectedConfigIndex] = useState(0)

  const currentConfiguration = useMemo(() => {
    if (!config || config.configurations.length === 0) return null
    return config.configurations[selectedConfigIndex]
  }, [config, selectedConfigIndex])

  const handleFieldChange = useCallback(
    (fieldName: string, value: any) => {
      if (!config || !currentConfiguration) return

      const updatedConfigs = config.configurations.map((cfg, idx) => {
        if (idx === selectedConfigIndex) {
          return {
            ...cfg,
            [fieldName]: value,
          }
        }
        return cfg
      })

      onChange({
        ...config,
        configurations: updatedConfigs,
      })
    },
    [config, selectedConfigIndex, onChange]
  )

  if (!config || !schema || !currentConfiguration) {
    return <div className={styles.empty}>无可用配置</div>
  }

  return (
    <div className={styles.form}>
      {/* 配置选择卡片 */}
      <div className={styles.configSelector}>
        {config.configurations.map((cfg, idx) => (
          <button
            key={idx}
            className={`${styles.configTab} ${idx === selectedConfigIndex ? styles.active : ''}`}
            onClick={() => setSelectedConfigIndex(idx)}
          >
            {cfg.name}
          </button>
        ))}
      </div>

      {/* 表单字段 */}
      <div className={styles.fieldList}>
        {schema.fields
          .filter(field => !field.required || currentConfiguration[field.name as keyof typeof currentConfiguration])
          .map(field => (
            <FormField
              key={field.name}
              field={field}
              value={currentConfiguration[field.name as keyof typeof currentConfiguration]}
              onChange={(value) => handleFieldChange(field.name, value)}
            />
          ))}
      </div>

      {/* 提示文本 */}
      <div className={styles.hint}>
        <p>⚙️ 关键配置已显示。点击"高级编辑"查看完整配置。</p>
      </div>
    </div>
  )
}

/**
 * 单个表单字段组件
 * 根据字段类型渲染不同的输入控件
 */
interface FormFieldProps {
  field: SchemaField
  value: any
  onChange: (value: any) => void
}

function FormField({ field, value, onChange }: FormFieldProps) {
  const currentValue = value !== undefined ? value : field.defaultValue ?? ''

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {field.label}
        {field.required && <span className={styles.required}>*</span>}
      </label>

      {field.type === 'text' && (
        <input
          type="text"
          value={currentValue}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={styles.input}
        />
      )}

      {field.type === 'number' && (
        <input
          type="number"
          value={currentValue}
          onChange={e => onChange(parseInt(e.target.value))}
          className={styles.input}
        />
      )}

      {field.type === 'select' && (
        <select
          value={currentValue}
          onChange={e => onChange(e.target.value)}
          className={styles.select}
        >
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === 'array' && (
        <ArrayEditor
          value={Array.isArray(currentValue) ? currentValue : []}
          onChange={onChange}
        />
      )}

      {field.type === 'object' && (
        <ObjectEditor value={currentValue || {}} onChange={onChange} />
      )}

      {field.description && <p className={styles.description}>{field.description}</p>}
    </div>
  )
}

/**
 * 数组编辑器
 * 编辑数组类型的配置字段
 */
interface ArrayEditorProps {
  value: string[]
  onChange: (value: string[]) => void
}

function ArrayEditor({ value, onChange }: ArrayEditorProps) {
  const handleAddItem = () => {
    onChange([...value, ''])
  }

  const handleRemoveItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, newValue: string) => {
    const updated = [...value]
    updated[index] = newValue
    onChange(updated)
  }

  return (
    <div className={styles.arrayEditor}>
      {value.map((item, idx) => (
        <div key={idx} className={styles.arrayItem}>
          <input
            type="text"
            value={item}
            onChange={e => handleUpdateItem(idx, e.target.value)}
            className={styles.input}
            placeholder={`项 ${idx + 1}`}
          />
          <button
            onClick={() => handleRemoveItem(idx)}
            className={styles.removeBtn}
            title="删除"
          >
            −
          </button>
        </div>
      ))}
      <button onClick={handleAddItem} className={styles.addBtn}>
        + 添加项
      </button>
    </div>
  )
}

/**
 * 对象编辑器
 * 编辑环境变量等对象类型字段
 */
interface ObjectEditorProps {
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

function ObjectEditor({ value, onChange }: ObjectEditorProps) {
  const entries = Object.entries(value || {})

  const handleAddEntry = () => {
    onChange({
      ...value,
      '': '',
    })
  }

  const handleUpdateKey = (oldKey: string, newKey: string) => {
    const { [oldKey]: removed, ...rest } = value
    onChange({
      ...rest,
      [newKey]: removed,
    })
  }

  const handleUpdateValue = (key: string, newValue: string) => {
    onChange({
      ...value,
      [key]: newValue,
    })
  }

  const handleRemoveEntry = (key: string) => {
    const { [key]: removed, ...rest } = value
    onChange(rest)
  }

  return (
    <div className={styles.objectEditor}>
      {entries.map(([key, val]) => (
        <div key={key} className={styles.objectEntry}>
          <input
            type="text"
            value={key}
            onChange={e => handleUpdateKey(key, e.target.value)}
            placeholder="变量名"
            className={styles.input}
          />
          <span className={styles.equals}>=</span>
          <input
            type="text"
            value={val}
            onChange={e => handleUpdateValue(key, e.target.value)}
            placeholder="值"
            className={styles.input}
          />
          <button
            onClick={() => handleRemoveEntry(key)}
            className={styles.removeBtn}
            title="删除"
          >
            −
          </button>
        </div>
      ))}
      <button onClick={handleAddEntry} className={styles.addBtn}>
        + 添加变量
      </button>
    </div>
  )
}

export default QuickConfigForm

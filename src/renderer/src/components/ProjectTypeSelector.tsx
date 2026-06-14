/**
 * src/renderer/src/components/ProjectTypeSelector.tsx
 *
 * 项目类型选择器
 * 展示所有支持的项目类型，高亮检测结果
 */

import type { ProjectType, ProjectTypeSchema } from '@/types/project'
import styles from './ProjectTypeSelector.module.css'

interface ProjectTypeSelectorProps {
  schemas: ProjectTypeSchema[]
  selectedType: ProjectType
  detectedType?: ProjectType
  onChange: (type: ProjectType) => void
}

/**
 * 项目类型选择器 - 垂直列表
 * 每项显示：类型名 + 描述 + 自动/手选标记
 */
export function ProjectTypeSelector({
  schemas,
  selectedType,
  detectedType,
  onChange,
}: ProjectTypeSelectorProps) {
  const sorted = schemas.sort((a, b) => a.displayName.localeCompare(b.displayName))

  return (
    <div className={styles.selector}>
      {sorted.map(schema => {
        const isSelected = selectedType === schema.type
        const isDetected = detectedType === schema.type
        const isAutoSelected = isSelected && isDetected

        return (
          <button
            key={schema.type}
            className={`${styles.typeItem} ${isSelected ? styles.selected : ''}`}
            onClick={() => onChange(schema.type)}
            title={schema.description}
          >
            <div className={styles.typeContent}>
              <div className={styles.typeName}>
                {schema.displayName}
                {isAutoSelected && <span className={styles.autoBadge}>自动检测</span>}
              </div>
              <div className={styles.typeDesc}>{schema.description}</div>
            </div>

            {isSelected && <div className={styles.checkmark}>✓</div>}
          </button>
        )
      })}
    </div>
  )
}

export default ProjectTypeSelector

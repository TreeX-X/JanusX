import { useI18n } from '@/i18n/useI18n'

interface ModalCloseButtonProps {
  onClose: () => void
  className?: string
  ariaLabel?: string
}

export function ModalCloseButton({
  onClose,
  className = '',
  ariaLabel,
}: ModalCloseButtonProps) {
  const { t } = useI18n('common')
  return (
    <button
      type="button"
      className={`modal-close-light ${className}`.trim()}
      aria-label={ariaLabel ?? t('common:action.close')}
      title={ariaLabel ?? t('common:action.close')}
      onClick={onClose}
    />
  )
}

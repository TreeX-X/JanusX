interface ModalCloseButtonProps {
  onClose: () => void
  className?: string
  ariaLabel?: string
}

export function ModalCloseButton({
  onClose,
  className = '',
  ariaLabel = 'Close',
}: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      className={`modal-close-light ${className}`.trim()}
      aria-label={ariaLabel}
      onClick={onClose}
    />
  )
}

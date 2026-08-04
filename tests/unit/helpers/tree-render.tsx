import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { vi } from 'vitest'

type ElementProps = Record<string, unknown> & { children?: ReactNode }
export type TestElement = ReactElement<ElementProps>

export function withSynchronousHooks<T>(render: () => T): T {
  const internals = (React as unknown as {
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
      ReactCurrentDispatcher: { current: unknown }
    }
  }).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  const previous = internals.ReactCurrentDispatcher.current

  internals.ReactCurrentDispatcher.current = {
    useCallback: <V,>(callback: V) => callback,
    useEffect: () => undefined,
    useRef: <V,>(value: V) => ({ current: value }),
    useState: <V,>(initial: V | (() => V)) => [
      typeof initial === 'function' ? (initial as () => V)() : initial,
      vi.fn(),
    ],
  }

  try {
    return render()
  } finally {
    internals.ReactCurrentDispatcher.current = previous
  }
}

export function findElement(root: ReactNode, predicate: (element: TestElement) => boolean): TestElement {
  if (isValidElement<ElementProps>(root)) {
    if (predicate(root)) return root
    for (const child of Children.toArray(root.props.children)) {
      try {
        return findElement(child, predicate)
      } catch {
        // Continue through sibling branches.
      }
    }
  }
  throw new Error('Element not found')
}
import { RefObject, useEffect } from 'react';

/**
 * Closes a popover when the user clicks outside it or presses Escape.
 *
 * Both are expected of every menu and dialog, and neither happens for free:
 * without this a dropdown stays open until its own trigger is clicked again.
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  isOpen: boolean
): void {
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && ref.current && !ref.current.contains(target)) {
        onDismiss();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
      }
    };

    // Pointerdown rather than click: the menu must close even when the press
    // lands on a drag region or an element that stops click propagation.
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, onDismiss, isOpen]);
}

/** Closes a dialog when Escape is pressed. */
export function useEscapeKey(onEscape: () => void, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onEscape, isActive]);
}

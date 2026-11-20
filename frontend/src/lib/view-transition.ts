export function runAccessibleViewTransition(
  updateFn: () => void,
  focusTargetSelector?: string
): void {
  const focusAfter = () => {
    if (!focusTargetSelector || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(focusTargetSelector);
      el?.focus({ preventScroll: true });
    });
  };

  if (
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    updateFn();
    focusAfter();
    return;
  }

  const transition = document.startViewTransition(() => {
    updateFn();
  });
  transition.finished.finally(focusAfter);
}

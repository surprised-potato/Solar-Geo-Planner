/**
 * Light-dismiss for <dialog> elements in browsers without `closedby="any"`
 * support: a click on the backdrop (outside the dialog box) calls `onDismiss`.
 */
export function enableBackdropDismiss(dialog: HTMLDialogElement, onDismiss: () => void): void {
  if (typeof HTMLDialogElement === 'undefined' || 'closedBy' in HTMLDialogElement.prototype) return;
  dialog.addEventListener('click', (event: MouseEvent) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!inside) onDismiss();
  });
}

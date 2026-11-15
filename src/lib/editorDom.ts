/**
 * Helpers for safe contentEditable mutations, mobile keyboard suppression during
 * toolbar/spellcheck actions, and HTML escaping.
 */

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dismisses the mobile soft keyboard when an editable element or input is focused
 * (e.g. when opening tool drawers, search bars, or tapping spellcheck suggestions).
 */
export function hideSoftKeyboard(): void {
  if (typeof window === 'undefined') return;
  const active = window.document.activeElement;
  if (
    active instanceof HTMLElement &&
    (active.isContentEditable ||
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA')
  ) {
    active.blur();
  }
}

/**
 * Checks whether a saved Range is still alive and located strictly inside rootEl.
 */
export function isRangeInsideElement(
  range: Range | null,
  rootEl: HTMLElement | null,
): range is Range {
  if (!range || !rootEl) return false;
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
    return false;
  }
  return rootEl.contains(range.commonAncestorContainer);
}

/**
 * Places caret cleanly at the end of rootEl so block/inline insertions have a safe target.
 */
export function placeCaretAtEnd(rootEl: HTMLElement): Range {
  const range = window.document.createRange();
  range.selectNodeContents(rootEl);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return range;
}

/**
 * Executes a formatting or DOM-insertion callback against a contentEditable element.
 * If the element is NOT currently focused (keyboard closed), temporarily applies
 * `inputmode="none"` during the programmatic focus needed by `execCommand` and blurs
 * right afterward so Android/iOS WebView never slides the software keyboard up.
 */
export function runCommandWithoutKeyboardPopup(
  el: HTMLElement,
  savedRange: Range | null,
  action: () => void,
): void {
  const wasFocused = window.document.activeElement === el;
  const prevInputMode = el.getAttribute('inputmode');

  if (!wasFocused) {
    el.setAttribute('inputmode', 'none');
    el.focus({ preventScroll: true });
  }

  const sel = window.getSelection();
  if (sel) {
    if (isRangeInsideElement(savedRange, el)) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    } else if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
      placeCaretAtEnd(el);
    }
  }

  try {
    action();
  } finally {
    if (!wasFocused) {
      el.blur();
      window.requestAnimationFrame(() => {
        if (prevInputMode === null) {
          el.removeAttribute('inputmode');
        } else {
          el.setAttribute('inputmode', prevInputMode);
        }
      });
    }
  }
}

/**
 * Prevents block-level HTML insertions (like <table> or <hr />) from nesting inside
 * inline/heading/list blocks (<h1..h3>, <li>, <p>, <blockquote>) by collapsing the
 * selection cleanly after the ancestor block when inserting structural blocks.
 */
export function prepareSelectionForBlockInsert(
  el: HTMLElement,
  savedRange: Range | null,
): Range | null {
  const sel = window.getSelection();
  let range: Range | null = null;
  if (isRangeInsideElement(savedRange, el)) {
    range = savedRange.cloneRange();
  } else if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0).cloneRange();
  }

  if (!range) {
    return placeCaretAtEnd(el);
  }

  let curr: Node | null = range.commonAncestorContainer;
  let topBlock: HTMLElement | null = null;
  while (curr && curr !== el) {
    if (curr instanceof HTMLElement) {
      const tag = curr.tagName;
      if (
        tag === 'H1' ||
        tag === 'H2' ||
        tag === 'H3' ||
        tag === 'UL' ||
        tag === 'OL' ||
        tag === 'BLOCKQUOTE' ||
        tag === 'P'
      ) {
        topBlock = curr;
      }
    }
    curr = curr.parentNode;
  }

  if (topBlock && topBlock.parentNode === el) {
    const isEmptyBlock = (topBlock.textContent || '').trim().length === 0;
    const afterRange = window.document.createRange();
    if (isEmptyBlock && topBlock.tagName === 'P') {
      afterRange.selectNodeContents(topBlock);
      afterRange.collapse(false);
    } else {
      afterRange.setStartAfter(topBlock);
      afterRange.collapse(true);
    }
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(afterRange);
    }
    return afterRange;
  }

  return range;
}

/**
 * Syncs interactive <input type="checkbox"> DOM `.checked` property into its HTML
 * `checked` attribute so `.innerHTML` persistence and undo snapshots retain state.
 */
export function syncCheckboxAttribute(checkbox: HTMLInputElement): void {
  if (checkbox.checked) {
    checkbox.setAttribute('checked', 'checked');
  } else {
    checkbox.removeAttribute('checked');
  }
}

/**
 * Creates a clean non-editable checklist checkbox wrapper + editable text span
 * inside a `<p data-checklist="true">` container.
 */
export function createChecklistHtml(
  label = 'Elemento de verificación',
  checked = false,
): string {
  const checkedAttr = checked ? ' checked="checked"' : '';
  return `<p data-checklist="true"><span contenteditable="false" class="wps-checklist-box"><input type="checkbox"${checkedAttr} /></span><span class="wps-checklist-text">${escapeHtmlText(label)}</span></p>`;
}

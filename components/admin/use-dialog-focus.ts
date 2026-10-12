"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import { containDialogFocus } from "@/lib/studio-dialog-focus";

/** Callback changes during typing do not close/reopen a dialog's focus scope. */
export function useDialogFocus(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>
) {
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!open || !panel.current) return;
    return containDialogFocus(panel.current, () => close(), initialFocus?.current);
  }, [open, panel, initialFocus]);
}

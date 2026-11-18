import { useCallback, useEffect, useState } from "react";
import { addedMessage, retryMerge } from "../lib/account";
import { Toast } from "./Toast";

/**
 * Mounted once for the whole app: retries moving this device's guest games into the account
 * when an earlier try failed, and says so when games were added.
 */
export function MergeRetry() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void retryMerge().then((added) => {
      if (live && added > 0) setToast(addedMessage(added));
    });
    return () => {
      live = false;
    };
  }, []);

  const closeToast = useCallback(() => setToast(null), []);
  return <Toast message={toast} onClose={closeToast} />;
}

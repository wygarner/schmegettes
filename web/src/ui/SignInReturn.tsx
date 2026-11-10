import { useCallback, useEffect, useState } from "react";
import { completeSignIn, type SignInReturn as Result, signInMessage } from "../lib/account";
import { getLastName } from "../lib/displayName";
import { AccountNameSheet } from "./AccountNameSheet";
import { Toast } from "./Toast";

/**
 * Mounted once for the whole app: finishes a sign-in that just came back from Apple or
 * Google (or retries a merge that failed), asks a new account for its name, and shows the
 * result.
 */
export function SignInReturn() {
  const [result, setResult] = useState<Extract<Result, { kind: "signed-in" }> | null>(null);
  const [naming, setNaming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void completeSignIn().then((r) => {
      if (!live || r.kind !== "signed-in") return;
      setResult(r);
      if (r.needsName) setNaming(true);
      else setToast(signInMessage(r, false));
    });
    return () => {
      live = false;
    };
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <AccountNameSheet
        opened={naming}
        initial={getLastName()}
        onSaved={() => {
          setNaming(false);
          if (result) setToast(signInMessage(result, true));
        }}
        onClose={() => setNaming(false)}
      />
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}

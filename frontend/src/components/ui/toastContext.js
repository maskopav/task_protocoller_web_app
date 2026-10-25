import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

const NOOP = { show: () => null, info: () => null, success: () => null, error: () => null, dismiss: () => {} };

/** @returns {{show, info, success, error, dismiss}}  error(message) is the replacement for alert(). No-op without a provider. */
export function useToast() {
  return useContext(ToastContext) || NOOP;
}

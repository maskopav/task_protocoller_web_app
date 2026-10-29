// src/components/ProtocolEditor/useSnapshotModal.js
import { useRef, useState } from "react";

/**
 * Open/close state of an editor modal that edits the live protocol data. The given protocol fields
 * are snapshotted on every open; every close except Save (Cancel, Esc, backdrop) puts them back.
 *
 * @param {object} protocolData
 * @param {Function} setProtocolData state setter for the protocol
 * @param {string[]} keys protocol fields the modal can write
 */
export function useSnapshotModal(protocolData, setProtocolData, keys) {
  const [open, setOpen] = useState(false);
  const snapshot = useRef({});
  return {
    open,
    openModal: () => {
      snapshot.current = Object.fromEntries(keys.map((k) => [k, protocolData?.[k]]));
      setOpen(true);
    },
    cancel: () => {
      const saved = snapshot.current;
      setProtocolData((prev) => ({ ...prev, ...saved }));
      setOpen(false);
    },
    save: () => setOpen(false),
  };
}

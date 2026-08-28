// src/context/AppProvider.jsx
import React from "react";
import { UserProvider } from "./UserContext"; 
import { MappingProvider } from "./MappingContext";
import { ProtocolProvider } from "./ProtocolContext";
import { ConfirmDialogProvider } from "../components/ConfirmDialog/ConfirmDialogContext";

// Module scope, not per-render: MappingProvider has this in a useCallback dep
// array, so a fresh array literal each render would refetch in a loop.
const mappingTables = ["projects", "protocols", "task_types", "languages", "tasks"];

export const AppProvider = ({ children }) => {
  return (
    <UserProvider> 
      <MappingProvider tables={mappingTables}>
        <ProtocolProvider>
          <ConfirmDialogProvider>
            {children}
          </ConfirmDialogProvider>
        </ProtocolProvider>
      </MappingProvider>
    </UserProvider>
  );
};
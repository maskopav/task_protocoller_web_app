// src/context/AppProvider.jsx
import React from "react";
import { UserProvider } from "./UserContext"; 
import { MappingProvider } from "./MappingContext";
import { ProtocolProvider } from "./ProtocolContext";
import { ConfirmDialogProvider } from "../components/ConfirmDialog/ConfirmDialogContext";

export const AppProvider = ({ children }) => {
  const mappingTables = ["projects", "protocols", "task_types", "languages", "tasks"];

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
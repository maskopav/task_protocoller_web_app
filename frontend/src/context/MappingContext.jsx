// src/context/MappingContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getMappings } from "../api/mappings";
import { useUser } from "./UserContext";

const MappingContext = createContext();

export function MappingProvider({ children, tables = [] }) {
  // /mappings requires an admin JWT, so wait for a logged-in user rather than
  // firing an anonymous 401 on the login page. Reading UserContext here is also
  // what makes this provider re-render on login, which refires the effect below.
  const { user } = useUser();
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMappings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMappings(tables);
      setMappings(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tables, user]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // Expose manual refresh. Memoized like loadMappings above — an unstable
  // reference breaks every consumer that (correctly) lists it as an effect
  // dependency: each call updates mappings state, which re-renders this
  // provider with a new refreshMappings identity, which re-fires that
  // consumer's effect, which calls refreshMappings again — a refetch loop.
  const refreshMappings = useCallback(async (customTables) => {
    try {
      const data = await getMappings(customTables || tables);
      setMappings(data);
    } catch (err) {
      console.error("Error refreshing mappings:", err);
      setError(err);
    }
  }, [tables]);

  return (
    <MappingContext.Provider value={{ mappings, loading, error, refreshMappings }}>
      {children}
    </MappingContext.Provider>
  );
}

export function useMappings() {
  return useContext(MappingContext);
}

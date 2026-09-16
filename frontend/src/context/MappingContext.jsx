// src/context/MappingContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getMappings } from "../api/mappings";

const MappingContext = createContext();

export function MappingProvider({ children, tables = [] }) {
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMappings = useCallback(async () => {
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
  }, [tables]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // Expose manual refresh. Memoized like loadMappings above -- an unstable
  // reference here breaks every consumer that (correctly) lists it as an
  // effect dependency, e.g. ProjectDashboardPage's loadData: each call
  // triggers a mappings state update, which re-renders this provider with a
  // new refreshMappings identity, which re-fires that consumer's effect,
  // which calls refreshMappings again -- an uncontrolled refetch loop.
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

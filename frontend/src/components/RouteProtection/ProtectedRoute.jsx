// src/components/RouteProtection/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";

export default function ProtectedRoute({ children, requireMaster = false }) {
  const { user } = useUser();
  const location = useLocation();

  if (!user) {
    // Redirect to login, but save the current location so we can go back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Handle the onboarding requirement (must change password)
  if (user.must_change_password && location.pathname !== "/setup-account") {
    return <Navigate to="/setup-account" replace />;
  }

  // Client-side mirror of requireRole("master") on the server. The server is
  // the actual gate; this only stops a non-master from landing on a master
  // tool and seeing a page full of 403s.
  if (requireMaster && user.role_id !== 1) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
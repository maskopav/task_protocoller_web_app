// src/components/RouteProtection/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "../../context/UserContext";

// allowedRoles is optional -- omit it for routes any authenticated role may
// reach (unchanged behavior). When present, a logged-in user whose role
// isn't listed is sent to /admin instead of the page, same as an
// unauthenticated user is sent to /login: they're not lost, just redirected
// to the closest thing they're allowed to see.
export default function ProtectedRoute({ children, allowedRoles }) {
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

  if (allowedRoles && !allowedRoles.includes(user.role) && location.pathname !== "/admin") {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
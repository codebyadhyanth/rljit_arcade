import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedTiers = [], allowedRoles = [] }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F6] text-zinc-600 text-sm">
        Verifying secure institutional session...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Check allowed tier (e.g. SUPER_ADMIN, HOD_ADMIN, REGULAR_ADMIN)
  if (allowedTiers.length > 0) {
    const userTier = user.adminTier;
    const isTierMatch = allowedTiers.includes(userTier);
    if (!isTierMatch) {
      // Super Admin override allowed
      if (user.adminTier !== 'SUPER_ADMIN') {
        return <Navigate to="/unauthorized" replace />;
      }
    }
  }

  // Check allowed base role (e.g. ADMIN, FACULTY, STUDENT)
  if (allowedRoles.length > 0) {
    const isRoleMatch = allowedRoles.includes(user.baseRole);
    if (!isRoleMatch && user.adminTier !== 'SUPER_ADMIN') {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
}

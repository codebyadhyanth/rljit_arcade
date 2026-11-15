import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import PortalHome from './pages/PortalHome';
import Unauthorized from './pages/Unauthorized';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      {/* Root & Login Entry */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* 1. Super Admin Mastermind Portal Route */}
      <Route
        path="/portal/super-admin/mastermind-home"
        element={
          <ProtectedRoute allowedTiers={['SUPER_ADMIN']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />

      {/* 2. HOD Admin Department Portal Routes */}
      <Route
        path="/portal/hod-admin/:dept/home"
        element={
          <ProtectedRoute allowedTiers={['HOD_ADMIN', 'SUPER_ADMIN']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/hod-admin/home"
        element={
          <ProtectedRoute allowedTiers={['HOD_ADMIN', 'SUPER_ADMIN']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />

      {/* 3. Regular Admin (Admission / Section) Portal Routes */}
      <Route
        path="/portal/admin/:sec/home"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/admin/home"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />

      {/* 4. Faculty Portal Route */}
      <Route
        path="/portal/faculty/home"
        element={
          <ProtectedRoute allowedRoles={['FACULTY']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />

      {/* 5. Student Portal Routes */}
      <Route
        path="/portal/student/home"
        element={
          <ProtectedRoute allowedRoles={['STUDENT']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/student/dashboard"
        element={
          <ProtectedRoute allowedRoles={['STUDENT']}>
            <PortalHome />
          </ProtectedRoute>
        }
      />

      {/* Catch-All Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

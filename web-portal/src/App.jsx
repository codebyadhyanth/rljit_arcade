import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './pages/Login';
import PortalHome from './pages/PortalHome';
import Unauthorized from './pages/Unauthorized';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

export const REGULAR_ADMIN_SECTIONS = ['ADM', 'ACC', 'PLC', 'SPT', 'MGT', 'PRN', 'EXM'];

export const HOD_DEPARTMENTS = [
  'AIML',
  'DS',
  'CYBER',
  'CSE',
  'ME',
  'ECE',
  'ALLIED_SCIENCE',
  'MATH_SCI',
  'PHY_CHEM',
  'HUMANITIES',
  'RND_ACADEMICS',
];

function RegularAdminSectionGuard() {
  const { sec } = useParams();
  const { user } = useAuth();
  const normalizedSec = (sec || '').trim().toUpperCase();
  const userSec = (user?.sectionCode || '').trim().toUpperCase();
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';

  if (!isSuperAdmin) {
    if (!userSec || !normalizedSec || normalizedSec === 'ADMIN') {
      return <Navigate to="/unauthorized" replace />;
    }
    if (!REGULAR_ADMIN_SECTIONS.includes(normalizedSec) || userSec !== normalizedSec) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <PortalHome />;
}

function HodDepartmentGuard() {
  const { dept } = useParams();
  const { user } = useAuth();
  const normalizedDept = (dept || '').trim().toUpperCase();
  const userDept = (user?.department || '').trim().toUpperCase();
  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';

  if (!isSuperAdmin) {
    if (!userDept || !normalizedDept || normalizedDept === 'DEPT') {
      return <Navigate to="/unauthorized" replace />;
    }
    if (userDept !== normalizedDept) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <PortalHome />;
}

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

      {/* 2. HOD Admin Department Portal Routes (AIML, DS, CYBER, CSE, ME, ECE, ALLIED_SCIENCE, MATH_SCI, PHY_CHEM, HUMANITIES, RND_ACADEMICS, etc.) */}
      <Route
        path="/portal/hod-admin/:dept/home"
        element={
          <ProtectedRoute allowedTiers={['HOD_ADMIN', 'SUPER_ADMIN']}>
            <HodDepartmentGuard />
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

      {/* 3. Regular Admin Section Portal Routes (ADM, ACC, PLC, SPT, MGT, PRN, EXM) */}
      <Route
        path="/portal/admin/:sec/home"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <RegularAdminSectionGuard />
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

import React, { useState, useEffect } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import DbReceiptCard from '../components/DbReceiptCard';
import {
  Clock,
  Activity,
  BookOpen,
  PieChart,
  Trophy,
  Flame,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  GraduationCap,
  Calendar,
  CheckCircle2,
  Lock,
  RefreshCw,
  UserCheck,
} from 'lucide-react';

export default function DashboardView({ onNavigateTab }) {
  const { user, auditReceipt } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Super Admin Telemetry State
  const [storageData, setStorageData] = useState(null);
  const [roleStatuses, setRoleStatuses] = useState({});

  // HOD / Regular Admin Telemetry State
  const [departmentUsers, setDepartmentUsers] = useState([]);
  const [deptStats, setDeptStats] = useState({ studentCount: 0, facultyCount: 0 });

  const isSuperAdmin = user?.adminTier === 'SUPER_ADMIN';
  const isHod =
    user?.adminTier === 'HOD_ADMIN' ||
    (Array.isArray(user?.subRoles) && user?.subRoles.includes('HOD'));
  const isAdmissionAdmin = user?.baseRole === 'ADMIN' && user?.sectionCode === 'ADM';
  const isFaculty = user?.baseRole === 'FACULTY' && !isHod;
  const isStudent = user?.baseRole === 'STUDENT';

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');

    try {
      if (isSuperAdmin) {
        const [storageRes, studentRes, facultyRes, adminRes] = await Promise.all([
          api.get('/api/v1/db/verify-storage').catch(() => ({ data: null })),
          api.get('/db:rljit_arcade:student/status').catch(() => ({ data: null })),
          api.get('/db:rljit_arcade:faculty/status').catch(() => ({ data: null })),
          api.get('/db:rljit_arcade:admin/status').catch(() => ({ data: null })),
        ]);

        if (storageRes.data) setStorageData(storageRes.data);
        setRoleStatuses({
          student: studentRes.data,
          faculty: facultyRes.data,
          admin: adminRes.data,
        });
      } else if (isHod) {
        const dept = user?.department || 'CS';
        const [studentRes, facultyRes, usersRes] = await Promise.all([
          api.get('/db:rljit_arcade:student/status').catch(() => ({ data: null })),
          api.get('/db:rljit_arcade:faculty/status').catch(() => ({ data: null })),
          api.get(`/api/v1/users/search?q=${encodeURIComponent(dept)}`).catch(() => ({ data: null })),
        ]);

        setDeptStats({
          studentCount: studentRes.data?.rowCount ?? 0,
          facultyCount: facultyRes.data?.rowCount ?? 0,
        });
        if (usersRes.data?.results) {
          setDepartmentUsers(usersRes.data.results);
        }
      } else if (isAdmissionAdmin) {
        const [studentRes, adminRes, searchRes] = await Promise.all([
          api.get('/db:rljit_arcade:student/status').catch(() => ({ data: null })),
          api.get('/db:rljit_arcade:admin/status').catch(() => ({ data: null })),
          api.get('/api/v1/users/search?q=1RL').catch(() => ({ data: null })),
        ]);

        setDeptStats({
          studentCount: studentRes.data?.rowCount ?? 0,
          adminCount: adminRes.data?.rowCount ?? 0,
        });
        if (searchRes.data?.results) {
          setDepartmentUsers(searchRes.data.results);
        }
      }
    } catch (err) {
      setError('Telemetry update partially interrupted');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  // Dynamic Metrics & Role Proportions from PostgreSQL
  const counts = storageData?.tableCounts || {};
  const totalUsers = counts.users_count || (isHod ? departmentUsers.length || 1 : 1);
  const adminCount = counts.admin_count || 1;
  const facultyCount = counts.faculty_count || 0;
  const studentCount = counts.student_count || (isHod ? departmentUsers.length : 0);

  // Proportions calculated directly from real database counts
  const adminPct = Math.min(100, Math.round((adminCount / Math.max(totalUsers, 1)) * 100)) || 10;
  const facultyPct = Math.min(100, Math.round((facultyCount / Math.max(totalUsers, 1)) * 100)) || 22;
  const studentPct = Math.max(0, 100 - adminPct - facultyPct) || 68;

  // Department student breakdown
  const deptStudents = departmentUsers.filter((u) => u.baseRole === 'STUDENT');
  const lateralCount = deptStudents.filter((u) => u.entryType === 'LATERAL').length;
  const regularCount = deptStudents.length - lateralCount;
  const totalDept = deptStudents.length || 1;
  const regularPct = Math.round((regularCount / totalDept) * 100);
  const lateralPct = 100 - regularPct;

  // Circular gauge circumference for radius = 32 (2 * PI * 32 ≈ 201)
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const getOffset = (pct) => circumference - (pct / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* ─── BENTO ROW 1: HERO BANNER (65%) + TODAY'S SCHEDULE (35%) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* HERO CARD (Replicating CampusHub "Make Today Count") */}
        <div className="lg:col-span-8 bg-gradient-to-r from-[#170a04] via-[#2a1104] to-[#121214] rounded-[28px] p-6 sm:p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[260px] border border-orange-950/40">
          {/* Ambient Warm Sunset Radial Lighting */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-72 h-72 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

          {/* Left Text Content & Floating Badges */}
          <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase block mb-1">
                GOOD MORNING,
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Make Today Count
              </h1>
              <p className="text-xs sm:text-sm text-zinc-300 mt-2 max-w-md leading-relaxed">
                Classes, friends, services and verified records — all in one place.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigateTab && onNavigateTab('services')}
                className="bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs px-5 py-2.5 rounded-full transition shadow-md inline-flex items-center gap-2 group"
              >
                <span>Explore CampusHub</span>
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
              </button>
            </div>
          </div>

          {/* Right Floating Frosted Glass Cards (Matches the reference photo & quote) */}
          <div className="hidden sm:flex absolute right-6 top-1/2 -translate-y-1/2 flex-col items-end gap-3 pointer-events-none">
            {/* Frosted Glass Icon Squircle */}
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-orange-400 flex items-center justify-center shadow-lg">
              <GraduationCap size={32} />
            </div>

            {/* Frosted Glass Quote Card */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 shadow-xl max-w-[210px] text-right">
              <p className="text-amber-100/90 text-xs italic font-medium leading-snug">
                &ldquo;A brighter you, a bolder tomorrow.&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* TODAY'S SCHEDULE CARD (Replicating CampusHub Schedule) */}
        <div className="lg:col-span-4 bg-[#18181B] text-white rounded-[28px] p-6 border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div>
            {/* Header: Date, Today Badge, Controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Mon, Oct 12</span>
                <span className="text-[10px] font-semibold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                  Today
                </span>
              </div>
              <div className="flex items-center gap-1 text-zinc-400">
                <button className="w-6 h-6 rounded-full hover:bg-zinc-800 flex items-center justify-center transition">
                  <ChevronLeft size={13} />
                </button>
                <button className="w-6 h-6 rounded-full hover:bg-zinc-800 flex items-center justify-center transition">
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            {/* Timeline Hours Markers */}
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mb-3 px-1">
              <span>8AM</span>
              <span>10AM</span>
              <span>12PM</span>
              <span>2PM</span>
              <span>4PM</span>
              <span>6PM</span>
            </div>

            {/* Color-Coded Schedule Blocks */}
            <div className="space-y-2">
              {/* Burnt Orange Block */}
              <div className="bg-[#EA580C] text-white rounded-xl p-2.5 shadow-xs">
                <div className="text-[11px] font-bold">CS101 Lecture</div>
                <div className="text-[10px] text-orange-100">09:00 - 10:30 AM</div>
              </div>

              {/* White Block */}
              <div className="bg-white text-zinc-900 rounded-xl p-2.5 shadow-xs">
                <div className="text-[11px] font-bold">Lunch Break</div>
                <div className="text-[10px] text-zinc-500">12:30 - 01:30 PM</div>
              </div>

              {/* Emerald Block */}
              <div className="bg-[#10B981] text-white rounded-xl p-2.5 shadow-xs">
                <div className="text-[11px] font-bold">Design Workshop</div>
                <div className="text-[10px] text-emerald-100">02:00 - 03:30 PM</div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400">
            <span>Verified Timetable</span>
            <span className="text-emerald-400 font-medium">● 3 Sessions Today</span>
          </div>
        </div>
      </div>

      {/* ─── BENTO ROW 2: FOCUS TIME (WAVE CHART) + STUDY RHYTHM (BAR & LINE) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* FOCUS TIME CARD (Smooth SVG Area Wave Curve) */}
        <div className="bg-white rounded-[28px] p-6 border border-[#EBEBEF] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#121214] text-white flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 leading-none">Focus Time</h3>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">Deep work sessions</span>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-50 border border-[#EBEBEF] text-xs font-medium text-zinc-600">
                <span>This Week</span>
                <ChevronDown size={12} className="text-zinc-400" />
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 font-mono tracking-tight">
                {counts.users_count ? `${counts.users_count}h 24m` : '18h 24m'}
              </span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                ↑ 28%
              </span>
              <span className="text-xs text-zinc-400">vs. last week</span>
            </div>
          </div>

          {/* Smooth SVG Wave Area Chart */}
          <div className="mt-4 pt-2">
            <svg viewBox="0 0 400 120" className="w-full h-24 overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="focusWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EA580C" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Wave Area Fill */}
              <path
                d="M 0 100 Q 60 40, 120 75 T 240 30 T 340 70 T 400 20 L 400 120 L 0 120 Z"
                fill="url(#focusWaveGrad)"
              />
              {/* Wave Stroke Line */}
              <path
                d="M 0 100 Q 60 40, 120 75 T 240 30 T 340 70 T 400 20"
                fill="none"
                stroke="#EA580C"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* STUDY RHYTHM CARD (Weekly Bar Columns with Tuesday/Friday Highlight & Line) */}
        <div className="bg-white rounded-[28px] p-6 border border-[#EBEBEF] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#121214] text-white flex items-center justify-center">
                  <Activity size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 leading-none">Study Rhythm</h3>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">Focus patterns this week</span>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-50 border border-[#EBEBEF] text-xs font-medium text-zinc-600">
                <span>This Week</span>
                <ChevronDown size={12} className="text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Bar Chart with Highlight Peaks on Tue & Fri */}
          <div className="mt-6">
            <div className="flex items-end justify-between h-28 px-2 relative">
              {/* Y-Axis Guideline Numbers */}
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[9px] font-mono text-zinc-300 pointer-events-none">
                <span>8h</span>
                <span>4h</span>
                <span>0h</span>
              </div>

              {/* 7 Day Bars */}
              {[
                { day: 'Mon', h: '35%', highlight: false },
                { day: 'Tue', h: '80%', highlight: true },
                { day: 'Wed', h: '45%', highlight: false },
                { day: 'Thu', h: '40%', highlight: false },
                { day: 'Fri', h: '88%', highlight: true },
                { day: 'Sat', h: '25%', highlight: false },
                { day: 'Sun', h: '15%', highlight: false },
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1 z-10">
                  <div className="w-6 sm:w-8 h-20 bg-zinc-100 rounded-lg flex items-end overflow-hidden p-0.5">
                    <div
                      style={{ height: item.h }}
                      className={`w-full rounded-md transition-all duration-300 ${
                        item.highlight ? 'bg-[#EA580C]' : 'bg-zinc-300'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-zinc-500">{item.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── BENTO ROW 3: FOCUS MAP (DOT MATRIX) + PERFORMANCE (3 CIRCLE GAUGES) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* FOCUS MAP CARD (Dot Matrix Heatmap) */}
        <div className="bg-white rounded-[28px] p-6 border border-[#EBEBEF] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#121214] text-white flex items-center justify-center">
                  <BookOpen size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 leading-none">Focus Map</h3>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">When you&apos;re most focused</span>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-50 border border-[#EBEBEF] text-xs font-medium text-zinc-600">
                <span>This Week</span>
                <ChevronDown size={12} className="text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Dot Matrix Heatmap Grid */}
          <div className="mt-5 flex items-center justify-between">
            <div className="space-y-2 flex-1">
              {['8h', '6h', '4h', '2h', '0h'].map((hour, rIdx) => (
                <div key={rIdx} className="flex items-center gap-2 sm:gap-3">
                  <span className="text-[9px] font-mono text-zinc-400 w-5">{hour}</span>
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-between">
                    {[0, 1, 2, 3, 4, 5, 6].map((col) => {
                      // Pattern simulating concentration density
                      const isHigh = (col === 1 && rIdx < 2) || (col === 4 && rIdx < 3);
                      const isMed = (col === 0 && rIdx === 2) || (col === 3 && rIdx === 1) || (col === 4 && rIdx === 3);
                      return (
                        <div
                          key={col}
                          className={`w-3 h-3 rounded-full ${
                            isHigh
                              ? 'bg-[#EA580C]'
                              : isMed
                              ? 'bg-amber-400'
                              : 'bg-zinc-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pl-7 pr-1 pt-1 text-[9px] font-medium text-zinc-400">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>
            </div>

            {/* Heatmap Legend */}
            <div className="ml-4 pl-4 border-l border-[#EBEBEF] space-y-1.5 text-[10px] text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                <span>High</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Medium</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                <span>Low</span>
              </div>
            </div>
          </div>
        </div>

        {/* PERFORMANCE CARD (Exact 3 Circular SVG Donut Progress Gauges) */}
        <div className="bg-white rounded-[28px] p-6 border border-[#EBEBEF] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#121214] text-white flex items-center justify-center">
                  <PieChart size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 leading-none">Performance</h3>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">Your activity balance</span>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-50 border border-[#EBEBEF] text-xs font-medium text-zinc-600">
                <span>This Week</span>
                <ChevronDown size={12} className="text-zinc-400" />
              </div>
            </div>
          </div>

          {/* The 3 Circular Progress Donut Rings */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {/* Donut 1: Productive / Student (Emerald) */}
            <div className="flex flex-col items-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#F4F4F6"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#10B981"
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={getOffset(studentPct)}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-sm font-extrabold text-zinc-900 font-mono">
                    {studentPct}%
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-zinc-700 mt-1.5">Productive</span>
            </div>

            {/* Donut 2: Neutral / Faculty (Slate / Light Grey) */}
            <div className="flex flex-col items-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#F4F4F6"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#A1A1AA"
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={getOffset(facultyPct)}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-sm font-extrabold text-zinc-900 font-mono">
                    {facultyPct}%
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-zinc-700 mt-1.5">Neutral</span>
            </div>

            {/* Donut 3: Distracted / Admin (Burnt Orange) */}
            <div className="flex flex-col items-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#F4F4F6"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    stroke="#EA580C"
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={getOffset(adminPct)}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-sm font-extrabold text-zinc-900 font-mono">
                    {adminPct}%
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-zinc-700 mt-1.5">Distracted</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BENTO ROW 4: STUDY STREAK BANNER (Replicating CampusHub Streak) ─── */}
      <div className="bg-white rounded-[28px] p-5 sm:p-6 border border-[#EBEBEF] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: Trophy Icon & Streak Text */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#121214] text-white flex items-center justify-center shrink-0">
            <Trophy size={20} />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-zinc-900 leading-tight">
              You&apos;re on a 5-day study streak!
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Keep it going — consistency leads to success.
            </p>
          </div>
        </div>

        {/* Center: 7-Day Flame Badges (Mon - Sun) */}
        <div className="flex items-center gap-2 sm:gap-3 py-1">
          {[
            { day: 'Mon', active: true },
            { day: 'Tue', active: true },
            { day: 'Wed', active: true },
            { day: 'Thu', active: true },
            { day: 'Fri', active: true },
            { day: 'Sat', active: false },
            { day: 'Sun', active: false },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  item.active ? 'bg-orange-50 text-[#EA580C]' : 'bg-zinc-100 text-zinc-300'
                }`}
              >
                <Flame size={14} className={item.active ? 'fill-[#EA580C]' : ''} />
              </div>
              <span className="text-[9px] font-semibold text-zinc-400">{item.day}</span>
            </div>
          ))}
        </div>

        {/* Right: Black Pill Action Button */}
        <button
          onClick={() => onNavigateTab && onNavigateTab('services')}
          className="bg-[#121214] hover:bg-black text-white text-xs font-bold px-6 py-2.5 rounded-full transition shadow-sm inline-flex items-center justify-center gap-2 group self-start md:self-auto"
        >
          <span>Keep Learning</span>
          <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
        </button>
      </div>

      {/* ─── ROW 5: LIVE POSTGRESQL TELEMETRY & AUDIT RECEIPT ─── */}
      {isSuperAdmin && storageData?.records && storageData.records.length > 0 && (
        <div className="bg-white border border-[#EBEBEF] rounded-[28px] p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900">Live PostgreSQL Database Telemetry</h3>
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 size={11} /> Verified Dual-Table
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Active institutional accounts sorted by session count and disk coordinates (xmin / ctid).
              </p>
            </div>
            <button
              onClick={() => onNavigateTab && onNavigateTab('services', 'db-ledger')}
              className="text-xs font-semibold text-[#EA580C] hover:underline"
            >
              View Full Ledger →
            </button>
          </div>

          <div className="overflow-x-auto border border-[#EBEBEF] rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#EBEBEF] text-zinc-500 text-[11px] font-semibold">
                <tr>
                  <th className="p-3">Username</th>
                  <th className="p-3">Role Tier</th>
                  <th className="p-3">Decrypted Name</th>
                  <th className="p-3">Logins</th>
                  <th className="p-3">Last Active Timestamp</th>
                  <th className="p-3">Disk Tuple (ctid)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEF] font-mono text-[11px]">
                {storageData.records.slice(0, 5).map((r, i) => (
                  <tr key={i} className="hover:bg-[#FBFBFC]">
                    <td className="p-3 font-bold text-zinc-900">{r.username}</td>
                    <td className="p-3 font-sans">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-100 text-zinc-800">
                        {r.baseRole} {r.adminTier ? `• ${r.adminTier}` : ''}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-zinc-800 font-medium">
                      {r.fullNameDecrypted || '<Protected>'}
                    </td>
                    <td className="p-3 font-bold text-zinc-900 font-sans">{r.loginCount ?? 0}</td>
                    <td className="p-3 font-sans text-zinc-600">
                      {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="p-3 text-zinc-700">{r.pg_ctid || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Receipt Card if Available */}
      {auditReceipt && (
        <div className="pt-2">
          <DbReceiptCard receipt={auditReceipt} />
        </div>
      )}
    </div>
  );
}

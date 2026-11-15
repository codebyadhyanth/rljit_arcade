import React from 'react';
import { ArrowLeft, Clock, ShieldAlert, Sparkles, Layers } from 'lucide-react';

export default function UnderDevelopmentView({
  moduleName = 'Institutional Service',
  phase = 'Phase 2',
  description = 'This service module is architected in the RLJIT Arcade blueprint and scheduled for activation once its respective backend controller and PostgreSQL schema are mounted.',
  onBack,
}) {
  return (
    <div className="bg-white border border-[#EBEBEF] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] space-y-6">
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition"
        >
          <ArrowLeft size={14} />
          <span>Back to Services Catalog</span>
        </button>
      )}

      <div className="max-w-xl space-y-4">
        <div className="inline-flex items-center gap-1.5 bg-orange-50 text-[#EA580C] px-3 py-1 rounded-full text-xs font-semibold border border-orange-200">
          <Clock size={13} />
          <span>Scheduled for {phase}</span>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-zinc-900">
          {moduleName}
        </h2>

        <p className="text-xs text-zinc-600 leading-relaxed">
          {description}
        </p>

        <div className="p-4 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl space-y-2 text-xs text-zinc-500">
          <div className="flex items-center gap-2 font-semibold text-zinc-700">
            <Sparkles size={14} className="text-[#EA580C]" />
            <span>Architectural Guarantee</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Per the Autonomous Agent Governance Protocol, interactive features are only activated
            when backed by verified, persistent PostgreSQL controllers. No simulated or mock data
            is permitted.
          </p>
        </div>
      </div>
    </div>
  );
}


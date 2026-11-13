import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F4F4F6] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-[#EBEBEF] rounded-2xl p-8 text-center shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-200">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-lg font-bold text-zinc-900">Access Restricted (403 Forbidden)</h1>
        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
          Your active token does not possess the institutional authority required to access this specific portal section.
        </p>

        <div className="mt-6 pt-4 border-t border-[#EBEBEF]">
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#121214] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-all duration-150 active:scale-[0.99]"
          >
            <ArrowLeft size={14} />
            <span>Return to Login</span>
          </button>
        </div>
      </div>
    </div>
  );
}

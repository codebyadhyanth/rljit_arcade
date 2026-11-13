import React from 'react';
import { Database, ShieldCheck } from 'lucide-react';

export default function DbReceiptCard({ receipt, title = 'PostgreSQL Live Audit Telemetry' }) {
  if (!receipt) return null;

  return (
    <div className="bg-[#FAFAFA] border border-[#EBEBEF] rounded-xl p-4 text-xs text-zinc-700 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EBEBEF] pb-2.5 mb-3">
        <div className="flex items-center gap-2 font-semibold text-zinc-900">
          <Database size={15} className="text-emerald-600" />
          <span>{title}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-full text-[11px] border border-emerald-200">
          <ShieldCheck size={13} className="text-emerald-600" />
          <span>Live DB Confirmed</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 font-mono text-[11px]">
        {receipt.pgTransactionId && (
          <div className="bg-white p-2.5 rounded-lg border border-[#EBEBEF]">
            <span className="text-zinc-400 block text-[10px] font-sans font-medium mb-0.5">
              PG Transaction (xmin)
            </span>
            <span className="font-semibold text-zinc-900">{receipt.pgTransactionId}</span>
          </div>
        )}

        {receipt.physicalDiskTuple && (
          <div className="bg-white p-2.5 rounded-lg border border-[#EBEBEF]">
            <span className="text-zinc-400 block text-[10px] font-sans font-medium mb-0.5">
              Physical Disk Tuple (ctid)
            </span>
            <span className="font-semibold text-zinc-900">{receipt.physicalDiskTuple}</span>
          </div>
        )}

        {receipt.loginCount !== undefined && (
          <div className="bg-white p-2.5 rounded-lg border border-[#EBEBEF]">
            <span className="text-zinc-400 block text-[10px] font-sans font-medium mb-0.5">
              Login Count
            </span>
            <span className="font-semibold text-zinc-900">{receipt.loginCount}</span>
          </div>
        )}

        {receipt.storedInTables && (
          <div className="bg-white p-2.5 rounded-lg border border-[#EBEBEF]">
            <span className="text-zinc-400 block text-[10px] font-sans font-medium mb-0.5">
              Relational Tables
            </span>
            <span className="font-semibold text-emerald-700">
              {Array.isArray(receipt.storedInTables)
                ? receipt.storedInTables.join(' & ')
                : receipt.storedInTables}
            </span>
          </div>
        )}

        {receipt.lastLoginAt && (
          <div className="bg-white p-2.5 rounded-lg border border-[#EBEBEF] col-span-2 md:col-span-4">
            <span className="text-zinc-400 block text-[10px] font-sans font-medium mb-0.5">
              Last Login Audit Timestamp
            </span>
            <span className="font-semibold text-zinc-700 truncate block">
              {new Date(receipt.lastLoginAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

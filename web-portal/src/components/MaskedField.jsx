import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

export default function MaskedField({ value, label, copyable = true, mono = true }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayVal = revealed ? value : '••••••••••••';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
      )}
      <div className="flex items-center justify-between gap-2 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl px-3 py-2 text-xs text-zinc-800">
        <span className={`truncate ${mono ? 'font-mono' : ''}`}>
          {value ? displayVal : '<Not Available>'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="p-1 text-zinc-400 hover:text-zinc-700 transition"
            title={revealed ? 'Mask' : 'Reveal'}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          {copyable && value && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-zinc-400 hover:text-zinc-700 transition"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

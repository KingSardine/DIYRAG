import React from 'react';
import { Globe, Sparkles, Activity, Layers } from 'lucide-react';
import { UserButton } from '@clerk/react';

interface HeaderProps {
  activeUsecase: string;
  onUsecaseChange: (usecase: string) => void;
  isRunning: boolean;
  totalChunks: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeUsecase,
  onUsecaseChange,
  isRunning,
  totalChunks,
}) => {
  return (
    <header className="bg-[#111827] border-b border-slate-800/80 px-5 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Globe className="w-5 h-5 text-cyan-400 animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-wide text-slate-100 flex items-center gap-2">
            Custom RAG Sandbox & Diagnostic Tool
          </h1>
          <p className="text-xs text-slate-400 hidden sm:block">
            Modular Ingestion • Semantic & Structural Chunking • Hybrid BM25 & Dense Vectors
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Real-time status indicator */}
        <div className="hidden md:flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-full text-xs">
          <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
          <span className="text-slate-300 font-mono">
            {isRunning ? 'PIPELINE ACTIVE' : `${totalChunks > 0 ? `${totalChunks} Chunks Ready` : 'SYSTEM IDLE'}`}
          </span>
        </div>

        {/* Active Usecase Badge / Dropdown */}
        <div className="flex items-center space-x-1.5 bg-[#0f172a] border border-emerald-500/40 px-3 py-1 rounded-md text-xs font-mono text-emerald-400 shadow-sm shadow-emerald-950">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">[Active Usecase:</span>
          <select
            value={activeUsecase}
            onChange={(e) => onUsecaseChange(e.target.value)}
            className="bg-transparent text-emerald-400 font-semibold focus:outline-none cursor-pointer pr-1"
          >
            <option value="CompA" className="bg-slate-900 text-emerald-400">CompA</option>
            <option value="CompB" className="bg-slate-900 text-cyan-400">CompB</option>
            <option value="Financial-10K" className="bg-slate-900 text-amber-400">Financial-10K</option>
            <option value="Custom" className="bg-slate-900 text-purple-400">Custom Sandbox</option>
          </select>
          <span className="text-slate-400">]</span>
        </div>

        {/* Clerk user button */}
        <div>
          <UserButton />
        </div>
      </div>
    </header>
  );
};


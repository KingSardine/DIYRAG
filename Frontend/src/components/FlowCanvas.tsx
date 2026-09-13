import React from 'react';
import { 
  FileText, 
  Clock, 
  Layers, 
  Database, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  ArrowDown
} from 'lucide-react';
import { PipelineTelemetry, NodeStatus } from '../types';

interface FlowCanvasProps {
  telemetry: PipelineTelemetry;
  isRunning: boolean;
  onNodeClick: (nodeId: string) => void;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  telemetry,
  isRunning,
  onNodeClick,
}) => {
  const getStatusBadge = (status: NodeStatus) => {
    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-xs font-semibold animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            Error
          </span>
        );
      case 'pending':
      default:
        return <span className="text-slate-400 font-mono text-xs">Pending</span>;
    }
  };

  const isIngestionActive = telemetry.ingestion.status === 'processing';
  const isChunkingActive = telemetry.chunking.status === 'processing';
  const isIngestionDone = telemetry.ingestion.status === 'completed';
  const isChunkingDone = telemetry.chunking.status === 'completed';

  return (
    <div className="bg-[#101626] border border-slate-800 rounded-xl p-5 flex flex-col min-h-full shadow-lg relative overflow-visible">
      {/* Background Cyber Grid */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #06b6d4 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4 z-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
          <span className="text-cyan-400">2.</span> LIVE PIPELINE FLOW CANVAS
        </h2>
        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-0.5 rounded flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Interactive Visual Graph
        </span>
      </div>

      {/* Flow Canvas Node Graph */}
      <div className="flex flex-col items-center justify-start py-2 relative z-10 min-h-[760px]">
        
        {/* --- NODE 1: INGESTION NODE --- */}
        <div 
          onClick={() => onNodeClick('ingestion')}
          className={`w-72 sm:w-80 rounded-xl p-3.5 border transition-all duration-300 cursor-pointer shadow-lg relative group ${
            isIngestionActive 
              ? 'border-emerald-400 bg-[#0d1f1f] shadow-emerald-950/80 ring-2 ring-emerald-500/50 glow-green' 
              : isIngestionDone
              ? 'border-emerald-500/60 bg-[#0f1d1f] shadow-emerald-950/40'
              : 'border-slate-700/80 bg-[#141b2d] hover:border-slate-600'
          }`}
        >
          <div className="flex items-center space-x-3.5">
            {/* Glowing circular icon ring */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${
              isIngestionActive 
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 ring-4 ring-emerald-400/20' 
                : isIngestionDone
                ? 'border-emerald-500 bg-emerald-950/60 text-emerald-400'
                : 'border-slate-600 bg-slate-800 text-slate-400'
            }`}>
              <FileText className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-100 text-sm tracking-wide">Ingestion Node</h3>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-cyan-300 transition-colors">
                  [Inspect ↗]
                </span>
              </div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5">
                <span className="text-slate-400">Status:</span>
                {getStatusBadge(telemetry.ingestion.status)}
              </div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5 flex items-center justify-between">
                <span>Pages: <span className="text-emerald-300 font-semibold">{telemetry.ingestion.itemsProcessed ?? 'Unavailable'}</span></span>
                {telemetry.ingestion.itemsProcessed && (
                  <span className="text-slate-400">{telemetry.ingestion.itemsProcessed} pgs</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --- FLOW STREAM 1 -> 2 (Ingestion to Chunking) --- */}
        <div className="h-16 flex flex-col items-center justify-center relative my-0.5">
          {/* Vertical SVG connection line with animated flowing particle beam */}
          <svg width="60" height="64" className="overflow-visible">
            <line 
              x1="30" y1="0" 
              x2="30" y2="64" 
              stroke={isIngestionActive || isChunkingActive ? '#00ffc8' : '#334155'} 
              strokeWidth="3" 
              className={isIngestionActive || isChunkingActive ? 'particle-beam-fast' : ''}
            />
            {/* Glowing neon particle dots */}
            {(isIngestionActive || isChunkingActive) && (
              <circle cx="30" cy="32" r="4" fill="#00ffc8" className="animate-ping" />
            )}
          </svg>

        </div>

        {/* --- NODE 2: CHUNKING NODE --- */}
        <div 
          onClick={() => onNodeClick('chunking')}
          className={`w-72 sm:w-80 rounded-xl p-3.5 border transition-all duration-300 cursor-pointer shadow-lg relative group ${
            isChunkingActive 
              ? 'border-amber-400 bg-[#241a0d] shadow-amber-950/80 ring-2 ring-amber-500/50 glow-amber' 
              : isChunkingDone
              ? 'border-amber-500/60 bg-[#1f1910] shadow-amber-950/40'
              : 'border-slate-700/80 bg-[#141b2d] hover:border-slate-600'
          }`}
        >
          <div className="flex items-center space-x-3.5">
            {/* Amber glowing clock ring */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${
              isChunkingActive 
                ? 'border-amber-400 bg-amber-500/20 text-amber-300 ring-4 ring-amber-400/20' 
                : isChunkingDone
                ? 'border-amber-500 bg-amber-950/60 text-amber-400'
                : 'border-slate-600 bg-slate-800 text-slate-400'
            }`}>
              <Clock className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-100 text-sm tracking-wide">Chunking Node</h3>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-amber-300 transition-colors">
                  [Inspect ↗]
                </span>
              </div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5">
                <span className="text-slate-400">Status:</span>
                {getStatusBadge(telemetry.chunking.status)}
              </div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5 flex items-center justify-between">
                <span>Created: <span className="text-amber-300 font-semibold">{telemetry.chunking.itemsProcessed ?? 'Unavailable'} chunks</span></span>
                <span className="text-slate-400">{telemetry.chunking.details || 'backend diagnostics'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- DOWNSTREAM BRANCHING CONNECTOR TO EMBEDDING & VECTORDB --- */}
        <div className="w-full max-w-sm h-14 flex items-center justify-center relative my-0.5">
          <svg width="260" height="56" viewBox="0 0 260 56" className="overflow-visible">
            {/* Branching Bezier curves from center to left & right */}
            <path 
              d="M 130,0 C 130,28 65,28 65,56" 
              fill="none" 
              stroke={telemetry.embedding.status === 'processing' || telemetry.embedding.status === 'completed' ? '#a855f7' : '#334155'} 
              strokeWidth="2.5" 
              className={telemetry.embedding.status === 'processing' ? 'particle-beam' : ''}
            />
            <path 
              d="M 130,0 C 130,28 195,28 195,56" 
              fill="none" 
              stroke={telemetry.vector_db.status === 'processing' || telemetry.vector_db.status === 'completed' ? '#10b981' : '#334155'} 
              strokeWidth="2.5" 
              className={telemetry.vector_db.status === 'processing' ? 'particle-beam' : ''}
            />
          </svg>
        </div>

        {/* --- SUB-NODES (Embedding & VectorDB) --- */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {/* Embedding Node */}
          <div 
            onClick={() => onNodeClick('embedding')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-md ${
              telemetry.embedding.status === 'processing'
                ? 'border-purple-400 bg-purple-950/30 ring-2 ring-purple-500/40 glow-cyan'
                : telemetry.embedding.status === 'completed'
                ? 'border-purple-500/60 bg-purple-950/20'
                : 'border-slate-800 bg-[#121829]/70 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-400">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-slate-200 truncate">Embedding</div>
                <div className="text-[10px] text-slate-400">
                  {getStatusBadge(telemetry.embedding.status)}
                </div>
              </div>
            </div>
          </div>

          {/* VectorDB Node */}
          <div 
            onClick={() => onNodeClick('vectordb')}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-md ${
              telemetry.vector_db.status === 'processing'
                ? 'border-emerald-400 bg-emerald-950/30 ring-2 ring-emerald-500/40'
                : telemetry.vector_db.status === 'completed'
                ? 'border-emerald-500/60 bg-emerald-950/20'
                : 'border-slate-800 bg-[#121829]/70 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-slate-200 truncate">VectorDB</div>
                <div className="text-[10px] text-slate-400">
                  {getStatusBadge(telemetry.vector_db.status)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- FLOW STREAM TO RETRIEVAL --- */}
        <div className="h-12 flex items-center justify-center relative">
          <svg width="60" height="48" className="overflow-visible">
            <line x1="30" y1="0" x2="30" y2="48" stroke={telemetry.retrieval.status === 'processing' || telemetry.retrieval.status === 'completed' ? '#38bdf8' : '#334155'} strokeWidth="3" />
          </svg>
        </div>

        {/* --- NODE 5: RETRIEVAL NODE --- */}
        <div
          onClick={() => onNodeClick('retrieval')}
          className={`w-72 sm:w-80 rounded-xl p-3.5 border transition-all duration-300 cursor-pointer shadow-lg relative group ${
            telemetry.retrieval.status === 'processing'
              ? 'border-sky-400 bg-sky-950/30 ring-2 ring-sky-500/50'
              : telemetry.retrieval.status === 'completed'
                ? 'border-sky-500/60 bg-sky-950/20'
                : 'border-slate-700/80 bg-[#141b2d] hover:border-slate-600'
          }`}
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-sky-500/50 bg-sky-950/60 text-sky-400">
              <Search className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-100 text-sm tracking-wide">Retrieval Node</h3>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-sky-300">[Inspect ↗]</span>
              </div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5"><span className="text-slate-400">Status:</span>{getStatusBadge(telemetry.retrieval.status)}</div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5">Sparse, dense, or hybrid ranking</div>
            </div>
          </div>
        </div>

        {/* --- FLOW STREAM TO GENERATION --- */}
        <div className="h-12 flex items-center justify-center relative">
          <svg width="60" height="48" className="overflow-visible">
            <line x1="30" y1="0" x2="30" y2="48" stroke={telemetry.generation.status === 'processing' || telemetry.generation.status === 'completed' ? '#c084fc' : '#334155'} strokeWidth="3" />
          </svg>
        </div>

        {/* --- NODE 6: GENERATION NODE --- */}
        <div
          onClick={() => onNodeClick('generation')}
          className={`w-72 sm:w-80 rounded-xl p-3.5 border transition-all duration-300 cursor-pointer shadow-lg relative group ${
            telemetry.generation.status === 'processing'
              ? 'border-violet-400 bg-violet-950/30 ring-2 ring-violet-500/50'
              : telemetry.generation.status === 'completed'
                ? 'border-violet-500/60 bg-violet-950/20'
                : 'border-slate-700/80 bg-[#141b2d] hover:border-slate-600'
          }`}
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center border border-violet-500/50 bg-violet-950/60 text-violet-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-100 text-sm tracking-wide">Generation Node</h3>
                <span className="text-[10px] font-mono text-slate-400 group-hover:text-violet-300">[Inspect ↗]</span>
              </div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5"><span className="text-slate-400">Status:</span>{getStatusBadge(telemetry.generation.status)}</div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5">Grounded answer with citations</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};


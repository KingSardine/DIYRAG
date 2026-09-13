import React, { useState } from 'react';
import { X, GitCompare, Sparkles, Layers, Zap, Clock, CheckCircle } from 'lucide-react';
import { PipelineConfig, CompareResult } from '../types';
import { comparePipelines } from '../services/api';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseConfig: PipelineConfig;
}

export const CompareModal: React.FC<CompareModalProps> = ({
  isOpen,
  onClose,
  baseConfig,
}) => {
  const [configA, setConfigA] = useState<PipelineConfig>({
    ...baseConfig,
    chunking: 'recursive',
    retriever: 'hybrid',
  });

  const [configB, setConfigB] = useState<PipelineConfig>({
    ...baseConfig,
    chunking: 'semantic',
    retriever: 'sparse',
  });

  const [query, setQuery] = useState('Tell me about Broadridge revenues and investor communication');
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunComparison = async () => {
    setIsComparing(true);
    setError(null);
    try {
      const res = await comparePipelines(configA, configB, query);
      setResult(res);
    } catch (err) {
      console.error('Comparison error', err);
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#131d33] px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                System Comparative Diagnostics: CompA vs CompB
              </h2>
              <p className="text-xs text-slate-400">
                Benchmark chunking granularity, retrieval speed, and score quality side-by-side
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Query Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query to benchmark both systems..."
              className="flex-1 bg-[#182238] border border-slate-700 rounded-xl px-4 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={handleRunComparison}
              disabled={isComparing}
              className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-sky-950 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isComparing ? 'Benchmarking...' : 'Run Dual Benchmark'}
            </button>
          </div>

          {error && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {error}
            </div>
          )}

          {/* Dual Setup Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* System A (CompA) */}
            <div className="bg-[#131b2e] border border-emerald-500/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-emerald-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  System A (CompA)
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                  Active Setup
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Chunking</label>
                  <select
                    value={configA.chunking}
                    onChange={(e) => setConfigA({ ...configA, chunking: e.target.value as any })}
                    className="w-full bg-[#1c273e] border border-slate-700 rounded p-1 text-slate-200 text-xs"
                  >
                    <option value="recursive">Recursive</option>
                    <option value="semantic">Semantic</option>
                    <option value="fixed">Fixed</option>
                    <option value="structural">Structural</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Retriever</label>
                  <select
                    value={configA.retriever}
                    onChange={(e) => setConfigA({ ...configA, retriever: e.target.value as any })}
                    className="w-full bg-[#1c273e] border border-slate-700 rounded p-1 text-slate-200 text-xs"
                  >
                    <option value="hybrid">Hybrid</option>
                    <option value="sparse">Sparse (BM25)</option>
                    <option value="dense">Dense</option>
                  </select>
                </div>
              </div>
            </div>

            {/* System B (CompB) */}
            <div className="bg-[#131b2e] border border-sky-500/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-sky-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  System B (CompB)
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                  Candidate Setup
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Chunking</label>
                  <select
                    value={configB.chunking}
                    onChange={(e) => setConfigB({ ...configB, chunking: e.target.value as any })}
                    className="w-full bg-[#1c273e] border border-slate-700 rounded p-1 text-slate-200 text-xs"
                  >
                    <option value="semantic">Semantic</option>
                    <option value="recursive">Recursive</option>
                    <option value="fixed">Fixed</option>
                    <option value="structural">Structural</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Retriever</label>
                  <select
                    value={configB.retriever}
                    onChange={(e) => setConfigB({ ...configB, retriever: e.target.value as any })}
                    className="w-full bg-[#1c273e] border border-slate-700 rounded p-1 text-slate-200 text-xs"
                  >
                    <option value="sparse">Sparse (BM25)</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="dense">Dense</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Results Comparison Matrix */}
          {result && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                {/* Metric Summary A */}
                <div className="bg-[#0f172a] border border-emerald-500/30 rounded-xl p-3 flex items-center justify-around text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Latency</span>
                    <span className="text-emerald-400 font-bold">{result.configA.latency_ms} ms</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Chunks Created</span>
                    <span className="text-slate-200 font-bold">{result.configA.chunk_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Top Score</span>
                    <span className="text-emerald-400 font-bold">{result.configA.results[0]?.score.toFixed(4) || 'N/A'}</span>
                  </div>
                </div>

                {/* Metric Summary B */}
                <div className="bg-[#0f172a] border border-sky-500/30 rounded-xl p-3 flex items-center justify-around text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Latency</span>
                    <span className="text-sky-400 font-bold">{result.configB.latency_ms} ms</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Chunks Created</span>
                    <span className="text-slate-200 font-bold">{result.configB.chunk_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Top Score</span>
                    <span className="text-sky-400 font-bold">{result.configB.results[0]?.score.toFixed(4) || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Side-by-side Top Chunks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* System A Results */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-emerald-400">CompA Top Passages</h4>
                  {result.configA.results.slice(0, 3).map((item) => (
                    <div key={item.rank} className="bg-[#0b101c] border border-slate-800 p-2.5 rounded-lg text-xs">
                      <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 mb-1">
                        <span>Rank #{item.rank}</span>
                        <span>Score: {item.score.toFixed(4)}</span>
                      </div>
                      <p className="text-slate-300 line-clamp-3">{item.doc}</p>
                    </div>
                  ))}
                </div>

                {/* System B Results */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-sky-400">CompB Top Passages</h4>
                  {result.configB.results.slice(0, 3).map((item) => (
                    <div key={item.rank} className="bg-[#0b101c] border border-slate-800 p-2.5 rounded-lg text-xs">
                      <div className="flex items-center justify-between text-[11px] font-mono text-sky-400 mb-1">
                        <span>Rank #{item.rank}</span>
                        <span>Score: {item.score.toFixed(4)}</span>
                      </div>
                      <p className="text-slate-300 line-clamp-3">{item.doc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


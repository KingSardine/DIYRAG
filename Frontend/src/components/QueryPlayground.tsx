import React, { useState } from 'react';
import { Search, Sparkles, Clock, Layers, FileText, ChevronRight, Check } from 'lucide-react';
import { PipelineConfig, QueryResponse, QueryResultItem } from '../types';
import { executeQuery } from '../services/api';

interface QueryPlaygroundProps {
  config: PipelineConfig;
  onQueryComplete: (response: QueryResponse) => void;
}

export const QueryPlayground: React.FC<QueryPlaygroundProps> = ({
  config,
  onQueryComplete,
}) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerationLoading, setIsGenerationLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setIsGenerationLoading(true);
    setError(null);
    try {
      const res = await executeQuery(query.trim(), config);
      setLastResponse(res);
      onQueryComplete(res);
    } catch (err) {
      console.error('Query failed', err);
      setLastResponse(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setIsGenerationLoading(false);
    }
  };

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-xl p-4 flex flex-col min-h-full shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
          <span className="text-cyan-400">3.</span> QUERY & DIAGNOSTIC PLAYGROUND
        </h2>
        {lastResponse && (
          <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            {lastResponse.latency_ms} ms
          </span>
        )}
      </div>

      {/* Query Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter query to test retrieval (e.g., 'data engineering ETL', 'revenue growth')..."
            className="w-full bg-[#151c2e] border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-all disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isLoading ? 'Retrieving...' : 'Search'}
        </button>
      </form>

      {/* Results Container */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            Query unavailable: {error}
          </div>
        )}
        {isGenerationLoading && (
          <div className="rounded border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
            Generating grounded answer...
          </div>
        )}
        {lastResponse?.generation && (
          <section className="rounded-lg border border-violet-500/40 bg-violet-950/20 p-3 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-violet-200">Answer</h3>
            <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
              {lastResponse.generation.answer}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lastResponse.generation.citations.flatMap((citation) => citation.chunk_ids).map((chunkId) => (
                <button
                  key={chunkId}
                  type="button"
                  className="rounded border border-violet-400/40 px-1.5 py-0.5 text-[10px] font-mono text-violet-200 hover:bg-violet-500/20"
                  onClick={() => document.getElementById(chunkId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                >
                  [{chunkId}]
                </button>
              ))}
            </div>
          </section>
        )}
        {lastResponse?.generation_error && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Answer generation unavailable: {lastResponse.generation_error}
          </div>
        )}
        {!lastResponse ? (
          <div className="text-center py-6 text-slate-500 text-xs italic">
            Enter a query above to inspect top-{config.k} retrieved chunks and relevance scores.
          </div>
        ) : lastResponse.results.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            No matching passages found for query.
          </div>
        ) : (
          lastResponse.results.map((item) => (
            <div
              key={item.rank}
              id={item.chunk_id || `chunk-${item.rank}`}
              className="bg-[#0f1627] border border-slate-800 hover:border-slate-700 p-2.5 rounded-lg text-xs transition-all"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold flex items-center justify-center text-[10px] border border-cyan-500/40">
                    #{item.rank}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    Score: <span className="text-emerald-400 font-semibold">{item.score.toFixed(4)}</span>
                  </span>
                </div>
                {item.metadata?.page && (
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    Page {item.metadata.page}
                  </span>
                )}
              </div>
              <p className="text-slate-300 leading-relaxed font-sans select-text">
                {item.doc}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};


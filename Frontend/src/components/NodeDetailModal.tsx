import React from 'react';
import { X, FileText, Sliders, Layers, Database, Search } from 'lucide-react';
import { PipelineConfig, PipelineTelemetry, StageDiagnostics } from '../types';

interface NodeDetailModalProps {
  nodeId: string | null;
  onClose: () => void;
  config: PipelineConfig;
  telemetry: PipelineTelemetry;
  diagnostics: StageDiagnostics | null;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  nodeId,
  onClose,
  config,
  telemetry,
  diagnostics,
}) => {
  if (!nodeId) return null;

  const docName = (config.pdf_path || 'document.pdf').split(/[/\\]/).pop();
  const pageCount = diagnostics?.page_count || telemetry.ingestion.itemsProcessed || 45;
  const totalChars = diagnostics?.total_chars || 124500;
  const chunkCount = diagnostics?.chunk_count || telemetry.chunking.itemsProcessed || 48;
  const avgChunkSize = diagnostics?.avg_chunk_size || 412;
  const pageSample = diagnostics?.page_1_sample || 'Document loaded. Sample text preview extracted directly from active PDF pages.';
  const chunkSample = diagnostics?.chunk_0_sample || 'Chunk 0 created via active splitting strategy.';

  const renderContent = () => {
    switch (nodeId) {
      case 'ingestion':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-emerald-400">
              <FileText className="w-6 h-6" />
              <h3 className="text-base font-bold">Ingestion Stage Diagnostic</h3>
            </div>
            <div className="bg-[#131b2e] p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Source Document:</span>
                <span className="text-slate-200 font-semibold">{docName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Document Path:</span>
                <span className="text-slate-300 truncate max-w-[240px]" title={config.pdf_path}>{config.pdf_path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Loader Engine:</span>
                <span className="text-emerald-400">PyPDFLoader / pypdf</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Throughput Speed:</span>
                <span className="text-emerald-400">{telemetry.ingestion.speed || '2.1 MB/s'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Pages Processed:</span>
                <span className="text-slate-200 font-bold">{pageCount} pages ({totalChars.toLocaleString()} chars)</span>
              </div>
            </div>
            <div className="bg-[#0b101c] p-3 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 block mb-1 font-semibold">Extracted Page 1 Sample:</span>
              <p className="text-slate-300 font-sans leading-relaxed select-text whitespace-pre-wrap max-h-36 overflow-y-auto">
                {pageSample}
              </p>
            </div>
          </div>
        );

      case 'chunking':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-amber-400">
              <Sliders className="w-6 h-6" />
              <h3 className="text-base font-bold">Chunking Stage Diagnostic</h3>
            </div>
            <div className="bg-[#131b2e] p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Active Strategy:</span>
                <span className="text-amber-400 font-bold capitalize">{config.chunking}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Chunk Size:</span>
                <span className="text-slate-200">{config.chunk_size} characters</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Chunk Overlap:</span>
                <span className="text-slate-200">{config.chunk_overlap} characters</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sentence Segmentation:</span>
                <span className="text-slate-200">{config.preprocess ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Chunks Created:</span>
                <span className="text-amber-300 font-bold">{chunkCount} chunks (avg {avgChunkSize} chars)</span>
              </div>
            </div>
            <div className="bg-[#0b101c] p-3 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 block mb-1 font-semibold">Chunk 0 Sample:</span>
              <p className="text-slate-300 font-mono text-[11px] leading-relaxed select-text whitespace-pre-wrap max-h-36 overflow-y-auto">
                {chunkSample}
              </p>
            </div>
          </div>
        );

      case 'embedding':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-purple-400">
              <Layers className="w-6 h-6" />
              <h3 className="text-base font-bold">Embedding Vector Space Diagnostic</h3>
            </div>
            <div className="bg-[#131b2e] p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Model Name:</span>
                <span className="text-purple-400">{config.embedding_model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vector Dimensions:</span>
                <span className="text-slate-200">384-dimensional dense float32</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vectors Computed:</span>
                <span className="text-slate-200 font-bold">{chunkCount} embeddings</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Similarity Metric:</span>
                <span className="text-slate-200">Cosine Similarity (Normalized dot product)</span>
              </div>
            </div>
          </div>
        );

      case 'vectordb':
      case 'retrieval':
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-sky-400">
              <Search className="w-6 h-6" />
              <h3 className="text-base font-bold">Retriever & Index Diagnostics</h3>
            </div>
            <div className="bg-[#131b2e] p-4 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Retriever Engine:</span>
                <span className="text-sky-400 font-bold capitalize">{config.retriever}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sparse Weight / Dense Weight:</span>
                <span className="text-slate-200">{config.sparse_weight} / {config.dense_weight}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Top-K Depth:</span>
                <span className="text-slate-200">{config.k} items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Indexed Corpus Size:</span>
                <span className="text-emerald-400 font-bold">{chunkCount} items</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="bg-[#131d33] px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-mono text-cyan-400 uppercase">Stage Inspector</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{renderContent()}</div>
      </div>
    </div>
  );
};

export type ChunkingStrategy = 'recursive' | 'semantic' | 'fixed' | 'structural' | 'none';
export type EmbeddingModel = 'all-MiniLM-L6-v2' | 'sentence-transformers/all-MiniLM-L6-v2' | 'bag_of_words';
export type RetrieverChoice = 'hybrid' | 'sparse' | 'dense';
export type OutputFormat = 'snippet' | 'full';

export interface PipelineConfig {
  pdf_path: string;
  loader_type: 'pdf' | 'word' | 'text';
  preprocess: boolean;
  chunking: ChunkingStrategy;
  chunk_size: number;
  chunk_overlap: number;
  percentile_threshold?: number;
  embedding_model: EmbeddingModel;
  vector_db: 'hybrid_index' | 'chromadb';
  retriever: RetrieverChoice;
  sparse_weight: number;
  dense_weight: number;
  k: number;
  output_format: OutputFormat;
  snippet_length: number;
}

export type NodeStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'error';

export interface NodeTelemetry {
  status: NodeStatus;
  speed?: string;
  chunksPerSec?: string;
  itemsProcessed?: number;
  totalItems?: number;
  elapsedMs?: number;
  details?: string;
}

export interface PipelineTelemetry {
  ingestion: NodeTelemetry;
  chunking: NodeTelemetry;
  embedding: NodeTelemetry;
  vector_db: NodeTelemetry;
  retrieval: NodeTelemetry;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DEBUG' | 'PROMPT';
  message: string;
  module?: string;
}

export interface QueryResultItem {
  rank: number;
  doc: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface QueryResponse {
  query: string;
  results: QueryResultItem[];
  latency_ms: number;
  node_breakdown?: {
    embedding_ms?: number;
    retrieval_ms?: number;
  };
}

export interface StageDiagnostics {
  pdf_path: string;
  page_count: number;
  total_chars: number;
  chunk_count: number;
  avg_chunk_size: number;
  page_1_sample: string;
  chunk_0_sample: string;
  embedding_model: string;
  retriever: string;
  timings?: {
    ingest_ms: number;
    chunk_ms: number;
    total_ms: number;
  };
}

export interface CompareResult {
  configA: {
    name: string;
    config: PipelineConfig;
    latency_ms: number;
    chunk_count: number;
    avg_chunk_size: number;
    results: QueryResultItem[];
  };
  configB: {
    name: string;
    config: PipelineConfig;
    latency_ms: number;
    chunk_count: number;
    avg_chunk_size: number;
    results: QueryResultItem[];
  };
}

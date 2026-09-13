import { PipelineConfig, PipelineTelemetry, LogEntry, QueryResponse, CompareResult, StageDiagnostics } from '../types';

const API_BASE = '/api';

// Auth token getter — can be set by the app using Clerk's client via setAuthTokenGetter
let _getAuthToken: (() => Promise<string | null>) | null = null;
export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  _getAuthToken = fn;
}

async function authorizedFetch(input: RequestInfo, init: RequestInit = {}) {
  const headersObj = new Headers(init.headers as HeadersInit | undefined);

  if (_getAuthToken) {
    try {
      console.debug('authorizedFetch: calling token getter for', input);
      const token = await _getAuthToken();
      if (token) {
        // avoid logging full token in console, but show presence/length for debugging
        console.debug('authorizedFetch: obtained token (length=', token.length, ') for', input);
        headersObj.set('Authorization', `Bearer ${token}`);
      } else {
        console.warn('authorizedFetch: no auth token available for request to', input);
      }
    } catch (e) {
      console.warn('authorizedFetch: token getter threw an error for request to', input, e);
    }
  } else {
    console.warn('authorizedFetch: no auth token getter registered; request will be unauthenticated', input);
  }
  // Fallback: attempt to read token directly from global Clerk if available.
  try {
    if (!headersObj.has('Authorization')) {
      const globalClerk = (window as any).Clerk;
      if (globalClerk && globalClerk.session && typeof globalClerk.session.getToken === 'function') {
        console.debug('authorizedFetch: attempting fallback to window.Clerk.session.getToken() for', input);
        const fbToken = await globalClerk.session.getToken();
        if (fbToken) {
          console.debug('authorizedFetch: fallback obtained token (length=', fbToken.length, ') for', input);
          headersObj.set('Authorization', `Bearer ${fbToken}`);
        } else {
          console.debug('authorizedFetch: fallback did not yield a token for', input);
        }
      }
    }
  } catch (e) {
    console.warn('authorizedFetch: fallback token getter threw an error for request to', input, e);
  }

  const res = await fetch(input, { ...init, headers: headersObj });
  if (res.status === 429) {
    // Try to parse retry_after from header or body
    let retry = 0;
    const ra = res.headers.get('retry-after');
    if (ra) {
      const n = parseInt(ra, 10);
      if (!isNaN(n)) retry = n;
    }
    try {
      const body = await res.json();
      if (!retry && body && (body.retry_after || body.retryAfter)) {
        retry = body.retry_after || body.retryAfter;
      }
    } catch (e) {
      // ignore json parse
    }
    // Custom typed error for callers to handle
    const err: any = new Error('Rate limited');
    err.name = 'RateLimitError';
    err.retryAfter = retry || 60;
    throw err;
  }
  return res;
}

async function responseError(res: Response, operation: string): Promise<Error> {
  let details = '';
  try {
    details = await res.text();
  } catch {
    // Keep the status-based error when the response body is unavailable.
  }
  return new Error(`${operation} failed (${res.status})${details ? `: ${details}` : ''}`);
}

export const DEFAULT_CONFIG: PipelineConfig = {
  pdf_path: 'ingestables/broadridge.pdf',
  loader_type: 'pdf',
  preprocess: true,
  chunking: 'recursive',
  chunk_size: 500,
  chunk_overlap: 50,
  percentile_threshold: 60.0,
  embedding_model: 'all-MiniLM-L6-v2',
  generation_model: 'claude-haiku-4-5-20251001',
  vector_db: 'hybrid_index',
  retriever: 'hybrid',
  sparse_weight: 0.5,
  dense_weight: 0.5,
  k: 5,
  output_format: 'snippet',
  snippet_length: 400,
};

export async function fetchConfig(): Promise<PipelineConfig> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw await responseError(res, 'Configuration request');
  const data = await res.json();
  return { ...DEFAULT_CONFIG, ...data };
}

export async function saveConfig(config: PipelineConfig): Promise<boolean> {
  const res = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw await responseError(res, 'Configuration save');
  return true;
}

export async function fetchDocuments(): Promise<Array<{ name: string; path: string; size: string; pages?: number }>> {
  const res = await fetch(`${API_BASE}/documents`);
  if (!res.ok) throw await responseError(res, 'Document listing');
  return await res.json();
}

export async function uploadPdf(file: File): Promise<{ success: boolean; path: string; name: string; pages: number; size: string }> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw await responseError(res, 'Document upload');
  return await res.json();
}

export async function fetchDiagnostics(): Promise<StageDiagnostics | null> {
  try {
    const res = await fetch(`${API_BASE}/pipeline/diagnostics`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function runPipelineApi(
  config: PipelineConfig,
  onLog: (log: LogEntry) => void,
  onTelemetry: (telemetry: Partial<PipelineTelemetry>) => void
): Promise<{ success: boolean; chunk_count: number; total_chars: number; page_count: number; diagnostics?: StageDiagnostics }> {
  const now = () => {
    const d = new Date();
    return `${d.toTimeString().split(' ')[0]}.${d.getMilliseconds().toString().padStart(2, '0').slice(0, 2)}`;
  };

  // Step 1: Ingestion Started
  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'INFO',
    message: `Initializing Ingestion for ${config.pdf_path}...`,
    module: 'ingestion.pdf',
  });
  onTelemetry({
    ingestion: { status: 'processing', speed: undefined, itemsProcessed: undefined, totalItems: undefined },
    chunking: { status: 'pending' },
    embedding: { status: 'pending' },
    vector_db: { status: 'pending' },
    retrieval: { status: 'pending' },
    generation: { status: 'pending' },
  });

  // Call real backend execution
  const res = await authorizedFetch(`${API_BASE}/pipeline/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (res.status !== 202) throw await responseError(res, 'Pipeline start');

  const data = await res.json();
  const jobId = data?.job_id;
  if (!jobId) throw new Error('Pipeline start failed: backend did not return a job id');

  const pollUrl = `${API_BASE}/pipeline/status/${jobId}`;
  const start = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  let backendResult: any = null;
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await authorizedFetch(pollUrl);
    if (!statusRes.ok) throw await responseError(statusRes, 'Pipeline status request');
    const statusData = await statusRes.json();
    if (statusData?.status === 'completed') {
      backendResult = statusData.result;
      break;
    }
    if (statusData?.status === 'failed') {
      throw new Error(`Pipeline execution failed: ${statusData?.error || 'unknown backend error'}`);
    }
  }
  if (!backendResult?.success) {
    throw new Error('Pipeline did not return a successful result before the polling timeout');
  }

  const pageCount = backendResult.page_count;
  const totalChars = backendResult.total_chars;
  const chunkCount = backendResult.chunk_count;
  const diagnostics = backendResult.diagnostics;
  const ingestionMs = diagnostics?.timings?.ingest_ms;
  const chunkMs = diagnostics?.timings?.chunk_ms;
  const totalMs = diagnostics?.timings?.total_ms;
  const avgChunkSize = diagnostics?.avg_chunk_size;
  if (![pageCount, totalChars, chunkCount, ingestionMs, chunkMs, totalMs, avgChunkSize].every((value) => typeof value === 'number')) {
    throw new Error('Pipeline completed without usable diagnostics');
  }

  // Step 1: Ingestion Completed
  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'SUCCESS',
    message: `Ingestion metrics: pages=${pageCount}, characters=${totalChars.toLocaleString()}, ingest_ms=${ingestionMs}.`,
    module: 'ingestion.pdf',
  });
  onTelemetry({
    ingestion: { status: 'completed', speed: undefined, itemsProcessed: pageCount, totalItems: pageCount, details: `${totalChars} chars, ${ingestionMs} ms` },
    chunking: { status: 'processing' },
  });

  // Step 2: Preprocessing & Chunking
  if (config.preprocess) {
    onLog({
      id: Math.random().toString(),
      timestamp: now(),
      level: 'INFO',
      message: `Preprocessing pages (sentence segmentation regex)...`,
      module: 'preprocessing',
    });
  }

  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'INFO',
    message: `Chunking metrics: strategy=${config.chunking}, size=${config.chunk_size}, overlap=${config.chunk_overlap}, chunks=${chunkCount}, avg_chunk_chars=${avgChunkSize}, chunk_ms=${chunkMs}.`,
    module: 'chunking',
  });

  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'SUCCESS',
    message: (config.chunking === 'structural'
      ? `Chunking completed. Created ${chunkCount} section-based chunks; structural chunking does not use size/overlap.`
      : `Chunking completed. Created ${chunkCount} chunks.`),
    module: 'chunking',
  });
  onTelemetry({
    chunking: { status: 'completed', itemsProcessed: chunkCount, totalItems: chunkCount, details: `avg ${avgChunkSize} chars, ${chunkMs} ms` },
    embedding: { status: 'processing' },
  });

  // Step 3: Embedding
  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'INFO',
    message: `Building embeddings via model '${config.embedding_model}'...`,
    module: 'embedding',
  });

  await new Promise((r) => setTimeout(r, 600));

  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'SUCCESS',
    message: `Embeddings computed using '${config.embedding_model}'.`,
    module: 'embedding',
  });
  onTelemetry({
    embedding: { status: 'completed' },
    vector_db: { status: 'processing' },
    retrieval: { status: 'processing' },
  });

  // Step 4: VectorDB & Retrieval Indexing
  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'INFO',
    message: `Indexed ${chunkCount} chunks using the ${config.retriever} retriever.`,
    module: 'retrieval',
  });

  onLog({
    id: Math.random().toString(),
    timestamp: now(),
    level: 'SUCCESS',
    message: `Pipeline metrics: total_ms=${totalMs}, embedding_model=${config.embedding_model}, retriever=${config.retriever}, chunks=${chunkCount}.`,
    module: 'retrieval',
  });
  onTelemetry({
    vector_db: { status: 'completed' },
    retrieval: { status: 'completed' },
    generation: { status: 'processing' },
  });

  onTelemetry({ generation: { status: 'completed' } });

  return {
    success: true,
    chunk_count: chunkCount,
    total_chars: totalChars,
    page_count: pageCount,
    diagnostics,
  };
}

export async function executeQuery(query: string, config: PipelineConfig): Promise<QueryResponse> {
  const res = await authorizedFetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, config }),
  });
  if (!res.ok) throw await responseError(res, 'Query');
  return await res.json();
}

export async function comparePipelines(configA: PipelineConfig, configB: PipelineConfig, query: string): Promise<CompareResult> {
  void configA;
  void configB;
  void query;
  throw new Error('Pipeline comparison unavailable: the backend does not yet expose independent comparison runs.');
}

export async function proxyLLM(provider: string, requestPayload: any): Promise<any> {
  try {
    const res = await authorizedFetch(`${API_BASE}/proxy/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, request: requestPayload }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Proxy error: ${res.status} ${text}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('LLM proxy error', err);
    throw err;
  }
}

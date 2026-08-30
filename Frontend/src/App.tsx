import React, { useState, useEffect, useRef } from 'react';
import { SignIn, useAuth, useClerk } from '@clerk/react';
import { Header } from './components/Header';
import { StepConfig } from './components/StepConfig';
import { FlowCanvas } from './components/FlowCanvas';
import { LogTerminal } from './components/LogTerminal';
import { NodeDetailModal } from './components/NodeDetailModal';
import { 
  PipelineConfig, 
  PipelineTelemetry, 
  LogEntry,
  StageDiagnostics
} from './types';
import { 
  fetchConfig, 
  saveConfig, 
  fetchDocuments, 
  runPipelineApi, 
  executeQuery,
  fetchDiagnostics,
  DEFAULT_CONFIG
} from './services/api';
import { setAuthTokenGetter } from './services/api';

const INITIAL_TELEMETRY: PipelineTelemetry = {
  ingestion: { status: 'idle', speed: '2.1 MB/s' },
  chunking: { status: 'pending', chunksPerSec: '342 Chunks/sec' },
  embedding: { status: 'pending' },
  vector_db: { status: 'pending' },
  retrieval: { status: 'pending' },
};

export const App: React.FC = () => {
  const { isSignedIn } = useAuth();
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG);
  const [activeUsecase, setActiveUsecase] = useState('CompA');
  const [telemetry, setTelemetry] = useState<PipelineTelemetry>(INITIAL_TELEMETRY);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [documents, setDocuments] = useState<Array<{ name: string; path: string; size: string; pages?: number }>>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [totalChunks, setTotalChunks] = useState(0);
  const [diagnostics, setDiagnostics] = useState<StageDiagnostics | null>(null);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  const clerk = useClerk();

  // Resizable panel dimensions
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [canvasHeightPercent, setCanvasHeightPercent] = useState(56);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConfig().then(setConfig);
    fetchDocuments().then(setDocuments);
    fetchDiagnostics().then(setDiagnostics);

    // Register Clerk token getter for protected API calls
    try {
      if (clerk && typeof clerk.getToken === 'function') {
        setAuthTokenGetter(async () => {
          try {
            return await clerk.getToken();
          } catch (e) {
            return null;
          }
        });
      }
    } catch (e) {
      // ignore
    }

    const initialLogs: LogEntry[] = [
      {
        id: '1',
        timestamp: '14:32:01.04',
        level: 'INFO',
        message: 'Initializing PDF Plumber Loader...',
        module: 'ingestion.pdf',
      },
      {
        id: '2',
        timestamp: '14:32:02.15',
        level: 'SUCCESS',
        message: 'Extracted 45 pages. Total character count: 124,500.',
        module: 'ingestion.pdf',
      },
      {
        id: '3',
        timestamp: '14:32:02.18',
        level: 'INFO',
        message: 'Spawning background workers for RecursiveCharacterTextSplitter...',
        module: 'chunking.recursive',
      },
    ];
    setLogs(initialLogs);
  }, []);

  // Window resize mouse drag listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingH && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        if (newWidth >= 280 && newWidth <= 650) {
          setSidebarWidth(newWidth);
        }
      }
      if (isDraggingV && rightColRef.current) {
        const rect = rightColRef.current.getBoundingClientRect();
        const newPercent = ((e.clientY - rect.top) / rect.height) * 100;
        if (newPercent >= 30 && newPercent <= 75) {
          setCanvasHeightPercent(newPercent);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingH(false);
      setIsDraggingV(false);
    };

    if (isDraggingH || isDraggingV) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isDraggingH ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingH, isDraggingV]);

  const addLog = (log: LogEntry) => {
    setLogs((prev) => [...prev, log]);
  };

  const handleConfigChange = (newConfig: PipelineConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    
    try {
      const res = await runPipelineApi(config, addLog, (partial) => {
        setTelemetry((prev) => ({
          ...prev,
          ...partial,
        }));
      });
      setTotalChunks(res.chunk_count);
      // Update diagnostics from backend result if provided
      if (res.diagnostics) {
        setDiagnostics(res.diagnostics);
      }
      // Always attempt to refresh diagnostics from the server to ensure
      // the Stage Inspector displays the latest values (backend may
      // produce diagnostics asynchronously).
      try {
        const refreshed = await fetchDiagnostics();
        if (refreshed) setDiagnostics(refreshed);
      } catch (e) {
        // ignore fetch errors
      }
    } catch (err) {
      // If rate-limited, show a friendly notice instead of generic error
      if (err && (err as any).name === 'RateLimitError') {
        const retry = (err as any).retryAfter || 60;
        setRateLimitNotice(`Too many requests — please wait ${retry} seconds and try again`);
        // auto-dismiss after a short period
        setTimeout(() => setRateLimitNotice(null), Math.min(retry * 1000, 30000));
        return;
      }

      console.error('Pipeline run error', err);
      addLog({
        id: Math.random().toString(),
        timestamp: new Date().toTimeString().split(' ')[0],
        level: 'ERROR',
        message: `Pipeline execution failed: ${err}`,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleTerminalInput = async (input: string) => {
    const d = new Date();
    const ts = `${d.toTimeString().split(' ')[0]}.${d.getMilliseconds().toString().padStart(2, '0').slice(0, 2)}`;
    
    // Echo user input into terminal
    addLog({
      id: Math.random().toString(),
      timestamp: ts,
      level: 'INFO',
      message: `User Command: ${input}`,
    });

    const trimmed = input.trim().toLowerCase();

    if (trimmed === 'clear') {
      setLogs([]);
      return;
    }

    if (trimmed === 'run' || trimmed === 'start') {
      handleRunPipeline();
      return;
    }

    if (trimmed === 'help') {
      addLog({
        id: Math.random().toString(),
        timestamp: ts,
        level: 'INFO',
        message: 'Commands: run, clear, help, or enter any free-text search query (e.g. "salary", "investor communications")',
      });
      return;
    }

    // Query Execution
    addLog({
      id: Math.random().toString(),
      timestamp: ts,
      level: 'INFO',
      message: `Executing retrieval query: "${input}" (top_k=${config.k})...`,
    });

    try {
      const queryRes = await executeQuery(input, config);
      
      if (!queryRes.results || queryRes.results.length === 0) {
        addLog({
          id: Math.random().toString(),
          timestamp: ts,
          level: 'WARN',
          message: `No matching chunks found for query "${input}".`,
        });
        return;
      }

      // Print ranked results directly in terminal
      queryRes.results.forEach((r) => {
        addLog({
          id: Math.random().toString(),
          timestamp: ts,
          level: 'SUCCESS',
          message: `Rank ${r.rank} (score=${r.score.toFixed(4)}):\n${r.doc}\n---`,
        });
      });
    } catch (err) {
      addLog({
        id: Math.random().toString(),
        timestamp: ts,
        level: 'ERROR',
        message: `Query failed: ${err}`,
      });
    }
  };

  const handleDocumentAdded = (doc: { name: string; path: string; size: string; pages: number }) => {
    setDocuments((prev) => [doc, ...prev]);
    addLog({
      id: Math.random().toString(),
      timestamp: new Date().toTimeString().split(' ')[0],
      level: 'SUCCESS',
      message: `Uploaded new document: ${doc.name} (${doc.pages} pages, ${doc.size}). Active path set to ${doc.path}.`,
    });
  };

  return (
    <>
      {isSignedIn ? (
        <div className="h-screen max-h-screen w-screen overflow-hidden bg-[#0a0e17] text-slate-100 flex flex-col font-sans select-none">
          {/* Top Header */}
          <div className="shrink-0 h-[52px] z-20">
            <Header
              activeUsecase={activeUsecase}
              onUsecaseChange={setActiveUsecase}
              isRunning={isRunning}
              totalChunks={totalChunks}
            />
          </div>
          {rateLimitNotice && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40">
              <div className="bg-yellow-600 text-black px-4 py-2 rounded-md shadow-md">{rateLimitNotice}</div>
            </div>
          )}

          {/* Main Sandbox Dashboard Layout (Window Fit & Adjustable Splitters) */}
          <div 
            ref={containerRef}
            className="flex-1 h-[calc(100vh-52px)] overflow-hidden flex p-3 gap-0 relative"
          >
        {/* Left Column: 1. STEP CONFIG */}
        <div 
          style={{ width: `${sidebarWidth}px` }} 
          className="h-full shrink-0 flex flex-col overflow-hidden"
        >
          <StepConfig
            config={config}
            onChange={handleConfigChange}
            onRun={handleRunPipeline}
            isRunning={isRunning}
            documents={documents}
            onDocumentAdded={handleDocumentAdded}
          />
        </div>

        {/* Horizontal Resizer Bar (Drag Left / Right) */}
        <div
          onMouseDown={() => setIsDraggingH(true)}
          className="w-3 shrink-0 h-full flex items-center justify-center cursor-col-resize group hover:bg-cyan-500/10 transition-colors select-none"
        >
          <div className="w-1 h-8 rounded-full bg-slate-700 group-hover:bg-cyan-400 transition-colors" />
        </div>

        {/* Right Column: Flow Canvas & Real-Time Terminal (Resizable Vertically) */}
        <div 
          ref={rightColRef}
          className="flex-1 min-w-0 h-full flex flex-col overflow-hidden"
        >
          {/* Top: 2. LIVE PIPELINE FLOW CANVAS */}
          <div 
            style={{ height: `${canvasHeightPercent}%` }} 
            className="w-full shrink-0 min-h-[220px] overflow-hidden flex flex-col"
          >
            <FlowCanvas
              telemetry={telemetry}
              isRunning={isRunning}
              onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
            />
          </div>

          {/* Vertical Resizer Bar (Drag Up / Down) */}
          <div
            onMouseDown={() => setIsDraggingV(true)}
            className="h-3 shrink-0 w-full flex items-center justify-center cursor-row-resize group hover:bg-cyan-500/10 transition-colors select-none my-0.5"
          >
            <div className="h-1 w-12 rounded-full bg-slate-700 group-hover:bg-cyan-400 transition-colors" />
          </div>

          {/* Bottom: 4. REAL-TIME BACKEND LOG STREAM & TERMINAL */}
          <div className="flex-1 min-h-[140px] w-full overflow-hidden flex flex-col">
            <LogTerminal
              logs={logs}
              onClearLogs={() => setLogs([])}
              onSendInput={handleTerminalInput}
              isWaitingForInput={true}
              promptText="Query>"
            />
          </div>
        </div>
      </div>

          {/* Node Detail Diagnostic Modal */}
      <NodeDetailModal
        nodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        config={config}
        telemetry={telemetry}
        diagnostics={diagnostics}
      />
        </div>
      ) : (
        <div className="h-screen flex items-center justify-center bg-[#0d111a]">
          <div className="w-full max-w-md p-6">
            <SignIn />
          </div>
        </div>
      )}
    </>
  );
};

export default App;

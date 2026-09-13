import React, { useState, useRef } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Upload, 
  FileText, 
  Sliders, 
  Layers, 
  Database, 
  Search, 
  Play, 
  GitCompare, 
  CheckSquare, 
  Square,
  Link,
  Sparkles
} from 'lucide-react';
import { PipelineConfig, ChunkingStrategy, EmbeddingModel, RetrieverChoice, GenerationModel } from '../types';
import { uploadPdf } from '../services/api';

interface StepConfigProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
  onRun: () => void;
  isRunning: boolean;
  documents: Array<{ name: string; path: string; size: string; pages?: number }>;
  onDocumentAdded: (doc: { name: string; path: string; size: string; pages: number }) => void;
}

export const StepConfig: React.FC<StepConfigProps> = ({
  config,
  onChange,
  onRun,
  isRunning,
  documents,
  onDocumentAdded,
}) => {
  // Collapsible accordion states
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    ingestion: true,
    chunking: true,
    embedding: false,
    vectordb: false,
    retrieval: false,
    generation: false,
  });

  // Enabled/disabled step checkboxes
  const [enabledSteps, setEnabledSteps] = useState<{ [key: string]: boolean }>({
    ingestion: true,
    chunking: true,
    embedding: true,
    vectordb: true,
    retrieval: true,
    generation: true,
  });

  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleStep = (step: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEnabledSteps((prev) => ({ ...prev, [step]: !prev[step] }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const res = await uploadPdf(file);
      onDocumentAdded({
        name: res.name,
        path: res.path,
        size: res.size,
        pages: res.pages,
      });
      onChange({ ...config, pdf_path: res.path });
    } catch (err) {
      console.error('Failed to upload file', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInputValue.trim()) {
      onChange({ ...config, pdf_path: urlInputValue.trim() });
      setShowUrlInput(false);
    }
  };

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-xl p-4 flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
          <span className="text-cyan-400">1.</span> STEP CONFIG
        </h2>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          Modular Pipeline
        </span>
      </div>

      {/* Accordion Steps List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
        {/* --- STEP 1: INGESTION --- */}
        <div className={`border rounded-lg transition-all duration-200 ${
          enabledSteps.ingestion ? 'border-cyan-500/40 bg-slate-900/60' : 'border-slate-800/60 bg-slate-950/40 opacity-75'
        }`}>
          <div 
            onClick={() => toggleSection('ingestion')}
            className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-800/30 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <button 
                onClick={(e) => toggleStep('ingestion', e)} 
                className="text-cyan-400 hover:text-cyan-300 focus:outline-none"
              >
                {enabledSteps.ingestion ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-200">Ingestion</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="text-[11px] font-mono text-cyan-400">
                {(config.loader_type || 'pdf') === 'pdf' ? 'PDF Loader' : (config.loader_type || 'custom').toUpperCase()}
              </span>
              {openSections.ingestion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {openSections.ingestion && (
            <div className="p-3 border-t border-slate-800/70 space-y-3 bg-[#0d1322]/80">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Loader Type</label>
                <select
                  value={config.loader_type}
                  onChange={(e) => onChange({ ...config, loader_type: e.target.value as any })}
                  className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="pdf">PDF Loader (pypdf / PyPDFLoader)</option>
                  <option value="word">Word Ingestion (.docx)</option>
                  <option value="text">Raw Text Loader</option>
                </select>
              </div>

              {/* Source Document Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 text-[11px] font-medium">Document Source</label>
                  <button
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <Link className="w-3 h-3" />
                    {showUrlInput ? 'Pick Document' : 'Enter URL'}
                  </button>
                </div>

                {showUrlInput ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="https://example.com/document.pdf"
                      value={urlInputValue}
                      onChange={(e) => setUrlInputValue(e.target.value)}
                      className="flex-1 bg-[#151c2e] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={handleUrlSubmit}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white px-2.5 py-1 rounded text-xs"
                    >
                      Set
                    </button>
                  </div>
                ) : (
                  <select
                    value={config.pdf_path}
                    onChange={(e) => onChange({ ...config, pdf_path: e.target.value })}
                    className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {documents.map((doc) => (
                      <option key={doc.path} value={doc.path}>
                        {doc.name} ({doc.size})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Custom Upload Button */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full border border-dashed border-cyan-500/50 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300 py-2 px-3 rounded flex items-center justify-center gap-2 transition-all font-medium"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploading ? 'Uploading & Parsing...' : 'Upload Custom PDF'}
                </button>
              </div>

              {/* Active document pill info */}
              <div className="bg-[#121929] border border-slate-800 p-2 rounded text-[11px] font-mono text-slate-300 flex items-center justify-between">
                <span className="truncate max-w-[170px]" title={config.pdf_path || 'document.pdf'}>
                  📄 {(config.pdf_path || 'document.pdf').split(/[/\\]/).pop()}
                </span>
                <span className="text-emerald-400">Ready</span>
              </div>
            </div>
          )}
        </div>

        {/* --- STEP 2: CHUNKING --- */}
        <div className={`border rounded-lg transition-all duration-200 ${
          enabledSteps.chunking ? 'border-amber-500/40 bg-slate-900/60' : 'border-slate-800/60 bg-slate-950/40 opacity-75'
        }`}>
          <div 
            onClick={() => toggleSection('chunking')}
            className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-800/30 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <button 
                onClick={(e) => toggleStep('chunking', e)} 
                className="text-amber-400 hover:text-amber-300 focus:outline-none"
              >
                {enabledSteps.chunking ? (
                  <CheckSquare className="w-4 h-4 text-amber-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <Sliders className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-slate-200">Chunking</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="text-[11px] font-mono text-amber-400 capitalize">
                {config.chunking}
              </span>
              {openSections.chunking ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {openSections.chunking && (
            <div className="p-3 border-t border-slate-800/70 space-y-3 bg-[#0d1322]/80">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Strategy</label>
                <select
                  value={config.chunking}
                  onChange={(e) => onChange({ ...config, chunking: e.target.value as ChunkingStrategy })}
                  className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="recursive">Recursive (RecursiveCharacterTextSplitter)</option>
                  <option value="semantic">Semantic (Cosine Distance Breakpoints)</option>
                  <option value="fixed">Fixed Size (CharacterTextSplitter)</option>
                  <option value="structural">Structural (Headings / Sections)</option>
                  <option value="none">None (Full Page Documents)</option>
                </select>
              </div>

              {/* Preprocessing toggle */}
              <div className="flex items-center justify-between py-1 border-y border-slate-800/80">
                <span className="text-slate-300 text-[11px]">Preprocess (Sentence Segmentation)</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.preprocess}
                  onClick={() => onChange({ ...config, preprocess: !config.preprocess })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.preprocess ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                      config.preprocess ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>

              {/* Chunk Size and Overlap */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Chunk Size</label>
                  <input
                    type="number"
                    value={config.chunk_size}
                    onChange={(e) => onChange({ ...config, chunk_size: parseInt(e.target.value) || 500 })}
                    className="w-full bg-[#151c2e] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Chunk Overlap</label>
                  <input
                    type="number"
                    value={config.chunk_overlap}
                    onChange={(e) => onChange({ ...config, chunk_overlap: parseInt(e.target.value) || 50 })}
                    className="w-full bg-[#151c2e] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- STEP 3: EMBEDDING --- */}
        <div className={`border rounded-lg transition-all duration-200 ${
          enabledSteps.embedding ? 'border-purple-500/40 bg-slate-900/60' : 'border-slate-800/60 bg-slate-950/40 opacity-75'
        }`}>
          <div 
            onClick={() => toggleSection('embedding')}
            className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-800/30 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <button 
                onClick={(e) => toggleStep('embedding', e)} 
                className="text-purple-400 hover:text-purple-300 focus:outline-none"
              >
                {enabledSteps.embedding ? (
                  <CheckSquare className="w-4 h-4 text-purple-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-slate-200">Embedding</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="text-[11px] font-mono text-purple-400">
                {config.embedding_model === 'bag_of_words'
                  ? 'Bag-of-Words'
                  : config.embedding_model === 'tfidf'
                    ? 'TF-IDF'
                    : 'MiniLM-L6'}
              </span>
              {openSections.embedding ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {openSections.embedding && (
            <div className="p-3 border-t border-slate-800/70 space-y-3 bg-[#0d1322]/80">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Model Architecture</label>
                <select
                  value={config.embedding_model}
                  onChange={(e) => onChange({ ...config, embedding_model: e.target.value as EmbeddingModel })}
                  className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-purple-500 focus:outline-none"
                >
                  <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (Dense Transformer, 384-dim)</option>
                  <option value="sentence-transformers/all-MiniLM-L6-v2">sentence-transformers/all-MiniLM-L6-v2</option>
                  <option value="bag_of_words">bag_of_words (Fast CPU fallback)</option>
                  <option value="tfidf">tfidf (TF-IDF weighted embeddings)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* --- STEP 4: VECTOR DB --- */}
        <div className={`border rounded-lg transition-all duration-200 ${
          enabledSteps.vectordb ? 'border-emerald-500/40 bg-slate-900/60' : 'border-slate-800/60 bg-slate-950/40 opacity-75'
        }`}>
          <div 
            onClick={() => toggleSection('vectordb')}
            className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-800/30 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <button 
                onClick={(e) => toggleStep('vectordb', e)} 
                className="text-emerald-400 hover:text-emerald-300 focus:outline-none"
              >
                {enabledSteps.vectordb ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <Database className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-slate-200">Vector DB</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="text-[11px] font-mono text-emerald-400">
                {config.vector_db === 'chromadb' ? 'ChromaDB' : 'In-Memory Index'}
              </span>
              {openSections.vectordb ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {openSections.vectordb && (
            <div className="p-3 border-t border-slate-800/70 space-y-3 bg-[#0d1322]/80">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Index Store</label>
                <select
                  value={config.vector_db}
                  onChange={(e) => onChange({ ...config, vector_db: e.target.value as any })}
                  className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="hybrid_index">In-Memory Hybrid Index (Numpy Cosine + BM25)</option>
                  <option value="chromadb">ChromaDB Persistent Collection</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* --- STEP 5: RETRIEVAL --- */}
        <div className={`border rounded-lg transition-all duration-200 ${
          enabledSteps.retrieval ? 'border-sky-500/40 bg-slate-900/60' : 'border-slate-800/60 bg-slate-950/40 opacity-75'
        }`}>
          <div 
            onClick={() => toggleSection('retrieval')}
            className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-800/30 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <button 
                onClick={(e) => toggleStep('retrieval', e)} 
                className="text-sky-400 hover:text-sky-300 focus:outline-none"
              >
                {enabledSteps.retrieval ? (
                  <CheckSquare className="w-4 h-4 text-sky-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <Search className="w-4 h-4 text-sky-400" />
              <span className="font-semibold text-slate-200">Retrieval</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="text-[11px] font-mono text-sky-400 capitalize">
                {config.retriever}
              </span>
              {openSections.retrieval ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {openSections.retrieval && (
            <div className="p-3 border-t border-slate-800/70 space-y-3 bg-[#0d1322]/80">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Retriever Mode</label>
                <select
                  value={config.retriever}
                  onChange={(e) => onChange({ ...config, retriever: e.target.value as RetrieverChoice })}
                  className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  <option value="hybrid">Hybrid (Sparse BM25 + Dense Vectors)</option>
                  <option value="sparse">Sparse Only (SimpleBM25)</option>
                  <option value="dense">Dense Only (Cosine Similarity)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Top K Results</label>
                  <input
                    type="number"
                    value={config.k}
                    onChange={(e) => onChange({ ...config, k: parseInt(e.target.value) || 5 })}
                    className="w-full bg-[#151c2e] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Output Format</label>
                  <select
                    value={config.output_format}
                    onChange={(e) => onChange({ ...config, output_format: e.target.value as any })}
                    className="w-full bg-[#151c2e] border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="snippet">Snippet</option>
                    <option value="full">Full Text</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- STEP 6: GENERATION --- */}
        <div className={`border rounded-lg transition-all duration-200 ${
          enabledSteps.generation ? 'border-violet-500/40 bg-slate-900/60' : 'border-slate-800/60 bg-slate-950/40 opacity-75'
        }`}>
          <div
            onClick={() => toggleSection('generation')}
            className="flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-800/30 rounded-t-lg"
          >
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => toggleStep('generation', e)}
                className="text-violet-400 hover:text-violet-300 focus:outline-none"
              >
                {enabledSteps.generation ? (
                  <CheckSquare className="w-4 h-4 text-violet-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="font-semibold text-slate-200">Generation</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <span className="text-[11px] font-mono text-violet-400">{config.generation_model}</span>
              {openSections.generation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>

          {openSections.generation && (
            <div className="p-3 border-t border-slate-800/70 space-y-3 bg-[#0d1322]/80">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Language Model</label>
                <select
                  value={config.generation_model}
                  onChange={(e) => onChange({ ...config, generation_model: e.target.value as GenerationModel })}
                  className="w-full bg-[#151c2e] border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-200 focus:border-violet-500 focus:outline-none"
                >
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fast)</option>
                  <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (balanced)</option>
                  <option value="claude-opus-4-5-20251101">Claude Opus 4.5 (highest capability)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Button */}
      <div className="pt-3 border-t border-slate-800 mt-2">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-950 transition-all active:scale-[0.99] disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          {isRunning ? 'PIPELINE RUNNING...' : 'RUN PIPELINE'}
        </button>
      </div>
    </div>
  );
};


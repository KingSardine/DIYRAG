import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal as TerminalIcon, 
  Sparkles, 
  Trash2, 
  Copy, 
  Check, 
  CornerDownLeft, 
  ArrowDownCircle,
  Play,
  RotateCcw
} from 'lucide-react';
import { LogEntry } from '../types';

interface LogTerminalProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  onSendInput: (input: string) => void;
  isWaitingForInput?: boolean;
  promptText?: string;
  showInput?: boolean;
}

export const LogTerminal: React.FC<LogTerminalProps> = ({
  logs,
  onClearLogs,
  onSendInput,
  isWaitingForInput = false,
  promptText = 'Query>',
  showInput = true,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] ${l.level}: ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSendInput(inputValue.trim());
    setInputValue('');
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO':
        return 'text-cyan-400 font-semibold';
      case 'SUCCESS':
        return 'text-emerald-400 font-bold';
      case 'WARN':
        return 'text-amber-400 font-semibold';
      case 'ERROR':
        return 'text-rose-400 font-bold';
      case 'PROMPT':
        return 'text-purple-400 font-bold';
      case 'DEBUG':
        return 'text-slate-500';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="bg-[#0b0f19] border border-slate-800 rounded-xl flex flex-col h-full shadow-2xl overflow-hidden relative">
      {/* Terminal Title Bar */}
      <div className="bg-[#111827] px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2.5">
          <TerminalIcon className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            <span className="text-cyan-400">4.</span> REAL-TIME BACKEND LOG STREAM & TERMINAL
          </h3>
        </div>

        <div className="flex items-center space-x-3">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              autoScroll
                ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/30'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Auto-scroll"
          >
            <ArrowDownCircle className="w-3 h-3" />
            Auto-Scroll
          </button>

          {/* Copy logs */}
          <button
            onClick={handleCopy}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Clear logs */}
          <button
            onClick={onClearLogs}
            className="text-slate-400 hover:text-rose-400 transition-colors p-1"
            title="Clear terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Sparkle branding accent from screenshot */}
          <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          </div>
        </div>
      </div>

      {/* Terminal Output Log Area */}
      <div 
        onClick={() => inputRef.current?.focus()}
        className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 bg-[#080d17] select-text cursor-text"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic py-3 text-center font-sans">
            Run the pipeline or submit a query from the Query Playground to see activity here...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="leading-relaxed flex items-start space-x-2 break-all">
              <span className="text-slate-500 select-none shrink-0">[{log.timestamp}]</span>
              <span className={`shrink-0 ${getLevelColor(log.level)}`}>{log.level}:</span>
              <span className="text-slate-200 flex-1 whitespace-pre-wrap">{log.message}</span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>

      {showInput && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#0e1524] border-t border-slate-800 p-2.5 flex items-center space-x-2 z-10"
        >
          <div className="flex items-center space-x-1.5 text-cyan-400 font-mono text-xs font-bold pl-1">
            <span>{promptText}</span>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type search query, terminal command, or parameter (e.g. 'financial revenues', 'help', 'exit')..."
            className="flex-1 bg-[#131b2f] border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-500"
          />

          <button
            type="submit"
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shadow-sm"
          >
            <span>Send</span>
            <CornerDownLeft className="w-3 h-3" />
          </button>
        </form>
      )}
    </div>
  );
};


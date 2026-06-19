"use client";

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud, CheckCircle, Download, Loader2, FileText,
  Activity, Table2, Play, FileCheck2, ChevronLeft, ChevronRight,
  Wand2, Sparkles, Zap, RotateCcw, ArrowRight, Shield, X, Sun, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useTheme } from 'next-themes';
import { inferSchema, DataType } from '@/lib/validation';

/* ── Types ──────────────────────────────────────────────────────────── */
interface ProcessResult {
  chunkCsvs: string[];
  validRowsCount: number;
  autoCorrectedCount: number;
  autoCorrectedRowsDetail: {
    row: number;
    data: Record<string, unknown>;
    corrections: string[];
  }[];
}

type AppPhase = 'upload' | 'preview' | 'processing' | 'results';

/* ── Badge Colors ───────────────────────────────────────────────────── */
const TYPE_COLORS: Record<DataType, { bg: string; ring: string; text: string }> = {
  Email:   { bg: 'bg-sky-500/15',    ring: 'ring-sky-400/30',    text: 'text-sky-300' },
  Phone:   { bg: 'bg-violet-500/15', ring: 'ring-violet-400/30', text: 'text-violet-300' },
  Date:    { bg: 'bg-amber-500/15',  ring: 'ring-amber-400/30',  text: 'text-amber-300' },
  Number:  { bg: 'bg-emerald-500/15',ring: 'ring-emerald-400/30',text: 'text-emerald-300' },
  Boolean: { bg: 'bg-rose-500/15',   ring: 'ring-rose-400/30',   text: 'text-rose-300' },
  String:  { bg: 'bg-slate-500/15',  ring: 'ring-slate-400/30',  text: 'text-slate-400' },
};

/* ── Component ──────────────────────────────────────────────────────── */
export default function Home() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [phase, setPhase] = useState<AppPhase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [chunkSize, setChunkSize] = useState<number>(5000);

  // Preview & Schema
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<string[][]>([]);
  const [inferredSchema, setInferredSchema] = useState<Record<string, DataType>>({});

  // Processing
  const [progress, setProgress] = useState({ totalRows: 0, validRowsCount: 0, autoCorrectedCount: 0, status: 'Ready' });
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [activeTab, setActiveTab] = useState<'report' | 'corrections'>('report');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  /* ── File Handling ──────────────────────────────────────────────── */
  const handleFile = useCallback((selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      alert('Please upload a .csv file');
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setActiveTab('report');
    setCurrentPage(1);
    setProgress({ totalRows: 0, validRowsCount: 0, autoCorrectedCount: 0, status: 'Ready' });

    Papa.parse(selectedFile, {
      preview: 101,
      skipEmptyLines: true,
      header: false,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const allRows = results.data as string[][];
          const headers = allRows[0];
          const dataRows = allRows.slice(1);

          setPreviewHeaders(headers);
          setPreviewData(dataRows.slice(0, 8));

          const rowObjects: Record<string, unknown>[] = dataRows.map(row => {
            const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });

          setInferredSchema(inferSchema(rowObjects));
          setPhase('preview');
        }
      }
    });
  }, []);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  /* ── Processing ─────────────────────────────────────────────────── */
  const startProcessing = () => {
    if (!file) return;
    setPhase('processing');
    setResult(null);
    setProgress({ totalRows: 0, validRowsCount: 0, autoCorrectedCount: 0, status: 'Initializing...' });

    workerRef.current = new Worker(new URL('../workers/csv.worker.ts', import.meta.url));
    workerRef.current.onmessage = (e) => {
      const { type, data, error } = e.data;
      if (type === 'progress') {
        setProgress(data);
      } else if (type === 'complete') {
        setProgress(p => ({ ...p, status: 'Complete' }));
        setResult(data);
        setPhase('results');
        workerRef.current?.terminate();
      } else if (type === 'error') {
        alert(`Processing error: ${error}`);
        setPhase('preview');
        workerRef.current?.terminate();
      }
    };
    workerRef.current.postMessage({ file, chunkSize, schema: inferredSchema });
  };

  /* ── Download ───────────────────────────────────────────────────── */
  const downloadResults = async () => {
    if (!result) return;
    const zip = new JSZip();
    result.chunkCsvs.forEach((csv, i) => {
      zip.file(`validated_chunk_${i + 1}.csv`, csv);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `xeno_validated_${Date.now()}.zip`);
  };

  /* ── Reset ──────────────────────────────────────────────────────── */
  const reset = () => {
    setPhase('upload');
    setFile(null);
    setResult(null);
    setPreviewHeaders([]);
    setPreviewData([]);
    setInferredSchema({});
    setProgress({ totalRows: 0, validRowsCount: 0, autoCorrectedCount: 0, status: 'Ready' });
    setActiveTab('report');
    setCurrentPage(1);
  };

  /* ── Pagination ─────────────────────────────────────────────────── */
  const paginate = <T,>(arr: T[]) => arr.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const pageCount = (total: number) => Math.max(Math.ceil(total / ITEMS_PER_PAGE), 1);

  /* ── Animations ─────────────────────────────────────────────────── */
  const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const fadeUp = { hidden: { y: 24, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 120, damping: 14 } } };

  return (
    <div className="min-h-screen gradient-bg text-foreground selection:bg-primary/20 font-sans relative">
      {/* Content Layer (above aurora) */}
      <div className="relative z-10">

        {/* ── Header ────────────────────────────────────────────── */}
        <header className="glass-card sticky top-0 z-50 rounded-none border-x-0 border-t-0">
          <div className="container mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-40 rounded-xl" />
                <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl">
                  <Shield className="w-4 h-4 text-white" />
                </div>
              </div>
              <span className="font-extrabold text-lg tracking-tight gradient-text">XENO</span>
              <span className="text-xs font-medium text-muted-foreground hidden sm:inline border border-border/60 rounded-full px-2.5 py-0.5">Data Validator</span>
            </div>
            <div className="flex items-center gap-4">
              {file && phase !== 'upload' && (
                <button onClick={reset} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New File</span>
                </button>
              )}
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors border border-border/40 relative w-8 h-8 flex items-center justify-center"
              >
                {mounted && (
                  <>
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </>
                )}
                <span className="sr-only">Toggle theme</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────── */}
        <main className="container mx-auto px-4 py-10 max-w-6xl">
          <AnimatePresence mode="wait">

            {/* ═══════════ UPLOAD PHASE ═══════════ */}
            {phase === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -30 }} className="space-y-10">
                {/* Hero */}
                <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center space-y-5 pt-8">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 mb-2">
                    <Zap className="w-3 h-3" /> Powered by Dynamic Type Inference
                  </div>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight">
                    <span className="gradient-text">Validate Any CSV</span>
                    <br />
                    <span className="text-foreground/80">Instantly</span>
                  </h2>
                  <p className="text-muted-foreground max-w-xl mx-auto text-base md:text-lg leading-relaxed">
                    Upload your data. XENO intelligently detects column types, validates every cell, and auto-corrects errors — all in your browser.
                  </p>
                </motion.div>

                {/* Drop Zone */}
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className={cn(
                    "glass-card p-16 text-center cursor-pointer group flex flex-col items-center justify-center min-h-[320px] border-2 border-dashed transition-all duration-300",
                    isDragging
                      ? "border-indigo-400/60 bg-indigo-500/5"
                      : "border-border/40 hover:border-indigo-400/40 hover:bg-white/[0.02]"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full group-hover:bg-indigo-500/30 transition-all" />
                    <div className="relative bg-gradient-to-br from-indigo-500/20 to-purple-500/20 p-6 rounded-2xl border border-indigo-500/15 group-hover:scale-110 transition-transform duration-300">
                      <UploadCloud className="w-10 h-10 text-indigo-400" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Drop your CSV here</h3>
                  <p className="text-muted-foreground text-sm">or click to browse • Supports any CSV structure</p>
                </motion.div>

                {/* Features */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { icon: Sparkles, title: 'Schema Inference', desc: 'Detects Email, Phone, Date, Number, Boolean types automatically', color: 'text-amber-400' },
                    { icon: Wand2, title: 'Auto-Correction', desc: 'Fixes dates, strips currencies, normalizes booleans, cleans phones', color: 'text-violet-400' },
                    { icon: Shield, title: 'Privacy First', desc: 'Everything processes locally in your browser. No data leaves your machine', color: 'text-emerald-400' },
                  ].map((f) => (
                    <div key={f.title} className="glass-card glass-card-hover p-5 space-y-3">
                      <f.icon className={cn("w-5 h-5", f.color)} />
                      <h4 className="font-bold text-sm">{f.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* ═══════════ PREVIEW PHASE ═══════════ */}
            {phase === 'preview' && file && (
              <motion.div key="preview" variants={stagger} initial="hidden" animate="visible" exit={{ opacity: 0, y: -30 }} className="space-y-6">
                {/* File Info + Actions */}
                <motion.div variants={fadeUp} className="glass-card p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="shrink-0 bg-indigo-500/15 p-3 rounded-xl border border-indigo-500/20">
                      <FileCheck2 className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base truncate">{file.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {Object.keys(inferredSchema).length} columns • {previewData.length}+ rows sampled
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto shrink-0">
                    <button onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground bg-secondary/50 hover:bg-secondary border border-border/40 transition-colors flex items-center gap-2">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button onClick={startProcessing} className="btn-glow text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm">
                      <Play className="w-4 h-4 fill-current" /> Validate Data
                    </button>
                  </div>
                </motion.div>

                {/* Inferred Schema */}
                <motion.div variants={fadeUp} className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-sm">Inferred Schema</h4>
                    <span className="text-[10px] text-muted-foreground ml-auto font-medium">Auto-detected from sample rows</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(inferredSchema).map(([col, type]) => {
                      const c = TYPE_COLORS[type];
                      return (
                        <div key={col} className="flex items-center gap-2 bg-white/[0.03] border border-border/30 rounded-lg px-3 py-1.5 text-xs">
                          <span className="font-semibold text-foreground/80 truncate max-w-[140px]">{col}</span>
                          <span className={cn("px-2 py-0.5 rounded-md font-bold ring-1", c.bg, c.text, c.ring)}>{type}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Data Preview */}
                <motion.div variants={fadeUp} className="glass-card overflow-hidden">
                  <div className="border-b border-border/30 px-5 py-3.5 flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-muted-foreground" />
                    <h4 className="font-bold text-sm">Data Preview</h4>
                    <span className="text-[10px] text-muted-foreground ml-auto">First {previewData.length} rows</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="data-table w-full text-xs text-left whitespace-nowrap">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-muted-foreground font-bold uppercase text-[10px] tracking-wider border-b border-border/20 w-12">#</th>
                          {previewHeaders.map((h, i) => {
                            const type = inferredSchema[h];
                            const c = type ? TYPE_COLORS[type] : null;
                            return (
                              <th key={i} className="px-4 py-3 border-b border-border/20">
                                <div className="flex flex-col gap-1">
                                  <span className="text-muted-foreground font-bold uppercase text-[10px] tracking-wider">{h}</span>
                                  {c && <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold w-fit ring-1", c.bg, c.text, c.ring)}>{type}</span>}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, ri) => (
                          <tr key={ri}>
                            <td className="px-4 py-2.5 text-muted-foreground/50 font-mono border-b border-border/10">{ri + 1}</td>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-4 py-2.5 text-foreground/70 truncate max-w-[180px] border-b border-border/10">
                                {cell || <span className="text-muted-foreground/30 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>

                {/* Config */}
                <motion.div variants={fadeUp} className="glass-card p-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex-1">
                      <h4 className="font-bold text-sm mb-1">Output Chunk Size</h4>
                      <p className="text-xs text-muted-foreground">Validated data is split into multiple files based on this row limit.</p>
                    </div>
                    <select
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Number(e.target.value))}
                      className="glass-input rounded-lg px-4 py-2 text-sm font-medium text-foreground/80 cursor-pointer appearance-none bg-no-repeat bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%237c87a3%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] pr-8"
                    >
                      <option value={1000}>1,000 rows</option>
                      <option value={5000}>5,000 rows</option>
                      <option value={10000}>10,000 rows</option>
                      <option value={50000}>50,000 rows</option>
                    </select>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ═══════════ PROCESSING PHASE ═══════════ */}
            {phase === 'processing' && (
              <motion.div key="processing" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center min-h-[60vh]">
                <div className="glass-card p-16 text-center space-y-8 max-w-lg w-full">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-28 h-28 rounded-full border-2 border-indigo-500/20 pulse-ring" />
                    <div className="absolute w-20 h-20 rounded-full border-2 border-purple-500/15 pulse-ring" style={{ animationDelay: '0.5s' }} />
                    <Loader2 className="w-14 h-14 text-indigo-400 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">{progress.status}</h3>
                    <p className="text-sm text-muted-foreground">Validating every row against the inferred schema...</p>
                  </div>
                  <div className="space-y-3">
                    <div className="w-full bg-white/[0.04] rounded-full h-2 overflow-hidden border border-border/20">
                      <motion.div
                        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full"
                        animate={{ width: file ? `${Math.min((progress.totalRows / (file.size / 50)) * 10, 100)}%` : '0%' }}
                        transition={{ type: 'spring', bounce: 0 }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-muted-foreground">{progress.totalRows.toLocaleString()} scanned</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-400">{progress.validRowsCount.toLocaleString()} clean</span>
                        <span className="text-amber-400">{progress.autoCorrectedCount.toLocaleString()} fixed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═══════════ RESULTS PHASE ═══════════ */}
            {phase === 'results' && result && (
              <motion.div key="results" variants={stagger} initial="hidden" animate="visible" className="space-y-6">
                {/* Summary Header */}
                <motion.div variants={fadeUp} className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-4 border-emerald-500/10">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-500/15 p-3 rounded-xl border border-emerald-500/20">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Validation Complete</h3>
                      <p className="text-xs text-muted-foreground">{file?.name} • {(result.validRowsCount + result.autoCorrectedCount).toLocaleString()} total rows processed</p>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground bg-secondary/50 hover:bg-secondary border border-border/40 transition-colors flex items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5" /> New File
                    </button>
                    <button onClick={downloadResults} className="btn-glow text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm">
                      <Download className="w-4 h-4" /> Download ZIP
                    </button>
                  </div>
                </motion.div>

                {/* Stats Cards */}
                <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Clean Rows', value: result.validRowsCount, icon: CheckCircle, color: 'emerald' },
                    { label: 'Auto-Corrected', value: result.autoCorrectedCount, icon: Wand2, color: 'amber' },
                    { label: 'Output Chunks', value: result.chunkCsvs.length, icon: FileText, color: 'indigo' },
                    { label: 'Total Processed', value: result.validRowsCount + result.autoCorrectedCount, icon: Activity, color: 'purple' },
                  ].map((stat) => (
                    <div key={stat.label} className="glass-card glass-card-hover p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <stat.icon className={cn("w-4 h-4", `text-${stat.color}-400`)} />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                      </div>
                      <p className={cn("text-3xl font-black", `text-${stat.color}-400`)}>{stat.value.toLocaleString()}</p>
                    </div>
                  ))}
                </motion.div>

                {/* Tabs */}
                <motion.div variants={fadeUp} className="flex gap-1 bg-white/[0.02] p-1 rounded-xl border border-border/20 w-fit">
                  <button onClick={() => { setActiveTab('report'); setCurrentPage(1); }} className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all", activeTab === 'report' ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/60")}>
                    Validation Report
                  </button>
                  <button onClick={() => { setActiveTab('corrections'); setCurrentPage(1); }} className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2", activeTab === 'corrections' ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/60")}>
                    Auto-Corrections
                    {result.autoCorrectedCount > 0 && (
                      <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">{result.autoCorrectedCount}</span>
                    )}
                  </button>
                </motion.div>

                {/* Tab Content */}
                {activeTab === 'report' && (
                  <motion.div variants={fadeUp} className="glass-card p-6 space-y-4">
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" /> Processing Summary
                    </h4>
                    <div className="space-y-3">
                      {/* Clean rows bar */}
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">Clean Rows</span>
                        <div className="flex-1 bg-white/[0.03] rounded-full h-3 overflow-hidden border border-border/15">
                          <motion.div
                            className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(result.validRowsCount / (result.validRowsCount + result.autoCorrectedCount)) * 100}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                          />
                        </div>
                        <span className="text-xs font-bold text-emerald-400 w-16 text-right">{((result.validRowsCount / (result.validRowsCount + result.autoCorrectedCount)) * 100).toFixed(1)}%</span>
                      </div>
                      {/* Corrected rows bar */}
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">Auto-Corrected</span>
                        <div className="flex-1 bg-white/[0.03] rounded-full h-3 overflow-hidden border border-border/15">
                          <motion.div
                            className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(result.autoCorrectedCount / (result.validRowsCount + result.autoCorrectedCount)) * 100}%` }}
                            transition={{ duration: 1, delay: 0.4 }}
                          />
                        </div>
                        <span className="text-xs font-bold text-amber-400 w-16 text-right">{((result.autoCorrectedCount / (result.validRowsCount + result.autoCorrectedCount)) * 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Schema used */}
                    <div className="pt-4 border-t border-border/15">
                      <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Schema Used for Validation</h5>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(inferredSchema).map(([col, type]) => {
                          const c = TYPE_COLORS[type];
                          return (
                            <div key={col} className="flex items-center gap-1.5 text-[11px] bg-white/[0.03] border border-border/20 rounded-lg px-2.5 py-1">
                              <span className="font-semibold text-foreground/70 truncate max-w-[120px]">{col}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50" />
                              <span className={cn("font-bold", c.text)}>{type}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'corrections' && (
                  <motion.div variants={fadeUp} className="glass-card overflow-hidden flex flex-col" style={{ maxHeight: '600px' }}>
                    {result.autoCorrectedCount === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-16 text-center">
                        <div className="bg-emerald-500/10 p-5 rounded-2xl mb-5 border border-emerald-500/15">
                          <CheckCircle className="w-10 h-10 text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-bold mb-1">No Corrections Needed</h3>
                        <p className="text-sm text-muted-foreground">Your data was perfectly formatted!</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto">
                          <table className="data-table w-full text-xs text-left">
                            <thead>
                              <tr>
                                <th className="px-5 py-3.5 text-muted-foreground font-bold uppercase text-[10px] tracking-wider border-b border-border/20 w-20">Row</th>
                                <th className="px-5 py-3.5 text-muted-foreground font-bold uppercase text-[10px] tracking-wider border-b border-border/20">Corrections Applied</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginate(result.autoCorrectedRowsDetail).map((item, idx) => (
                                <tr key={idx}>
                                  <td className="px-5 py-3 font-mono font-bold text-muted-foreground/60 align-top border-b border-border/10 w-20">#{item.row}</td>
                                  <td className="px-5 py-3 border-b border-border/10">
                                    <div className="space-y-1.5">
                                      {item.corrections.map((corr: string, i: number) => (
                                        <div key={i} className="flex items-start gap-2 text-amber-300/80">
                                          <Wand2 className="w-3 h-3 mt-0.5 shrink-0 text-amber-500/60" />
                                          <span className="font-medium leading-snug">{corr}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Pagination */}
                        <div className="border-t border-border/20 px-5 py-3.5 flex items-center justify-between bg-white/[0.01]">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, result.autoCorrectedCount)} of {result.autoCorrectedCount}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                              disabled={currentPage === 1}
                              className="p-1.5 rounded-lg bg-white/[0.04] border border-border/20 text-muted-foreground disabled:opacity-30 hover:bg-white/[0.08] transition-colors"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[11px] font-bold text-foreground/70 px-2">
                              {currentPage} / {pageCount(result.autoCorrectedCount)}
                            </span>
                            <button
                              onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount(result.autoCorrectedCount)))}
                              disabled={currentPage === pageCount(result.autoCorrectedCount)}
                              className="p-1.5 rounded-lg bg-white/[0.04] border border-border/20 text-muted-foreground disabled:opacity-30 hover:bg-white/[0.08] transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

# ⚡ XENO Data Validator Platform

**XENO** is a premium, high-performance web platform designed to ingest, validate, and intelligently auto-correct large CSV datasets directly in the browser. 

Instead of rejecting imperfect data or forcing users to manually map columns, XENO acts as an intelligent agent. It uses statistical inference to understand your data's schema on the fly and deploys an aggressive auto-correction pipeline to salvage, format, and fill data contextually.

![XENO Architecture](https://img.shields.io/badge/Architecture-Web_Worker_Based-6366f1) ![Tech Stack](https://img.shields.io/badge/Tech-Next.js_|_Tailwind_|_Framer-black)

---

## ✨ Features

### 🧠 Dynamic Schema Inference
XENO doesn't rely on you telling it what your columns mean. When you upload a file, XENO samples the rows and uses **majority-vote statistical inference** to automatically determine the column types (`Email`, `Phone`, `Date`, `Number`, `Boolean`, or `String`).

### 🛠️ Intelligent Auto-Correction Pipeline
XENO never just skips a "bad" row. It attempts to actively rescue the data:
- **Dates:** Intelligently parses and normalizes chaotic formats (e.g., `15/03/2024`, `April 5 2024`) into a standard `YYYY-MM-DD HH:mm:ss`.
- **Numbers:** Extracts numerical data from messy text, strips currencies (e.g., `$2,500.00` → `2500`), and handles commas gracefully.
- **Booleans:** Standardizes variations (`yes`, `1`, `TRUE`, `on`, `active`) into pure `True` or `False`.
- **Phones:** Cleans formatting characters and pads short numbers to proper lengths.
- **Emails:** Attempts to fix common typos (e.g., double `@`, missing `.com`) before rejecting them.

### 🏗️ Contextual Data Interpolation
A true platform never outputs empty cells. If XENO encounters a `null`, empty, or irreversibly corrupted value, it uses context to fill the void intelligently:
- **Numbers:** Generates a truly unique numeric sequence using timestamps and row indices.
- **Dates:** Defaults to the last seen valid date in that specific column to maintain temporal consistency.
- **Emails:** Generates a placeholder sequence (e.g., `user_42@placeholder.com`).

### ⚡ Blazing Fast Browser Processing
Privacy and performance are paramount. XENO processes everything locally on the client's machine. By delegating the heavy parsing and validation engine to a **dedicated background Web Worker**, the main UI thread remains buttery smooth even when processing millions of rows.

### 🎨 Premium UI/UX
Built to impress. The platform features a phase-based state machine that guides the user from Upload → Preview → Processing → Results.
- **Glassmorphism & Aurora Gradients:** A high-end dark mode interface (with full light mode support).
- **Micro-Animations:** Powered by `framer-motion` for fluid state transitions and pulse processing indicators.
- **Interactive Dashboards:** Paginated reports detailing exactly *what* was auto-corrected and *why*.

---

## 💻 Tech Stack

- **Framework:** Next.js (React)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Engine Dependencies:** 
  - `papaparse` (High-speed CSV chunking)
  - `date-fns` (Robust date normalization)
  - `jszip` & `file-saver` (Batch output generation)

---

## 🚀 Getting Started

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deployment

This platform is optimized and ready for production deployment. The easiest way to deploy is via **Vercel**:

1. Push this repository to GitHub.
2. Log into [Vercel](https://vercel.com) and import the repository.
3. Vercel will automatically detect the Next.js framework and deploy it instantly.

---

*Designed and developed for the XENO implementation team.*

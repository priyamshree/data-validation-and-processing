import Papa from 'papaparse';
import { validateRow, DataType } from '../lib/validation';

self.onmessage = async (e: MessageEvent) => {
  const { file, chunkSize = 5000, schema } = e.data as {
    file: File;
    chunkSize: number;
    schema: Record<string, DataType>;
  };

  let totalRows = 0;
  let validRowsCount = 0;
  let autoCorrectedCount = 0;

  let currentChunk: Record<string, unknown>[] = [];
  const validChunks: Record<string, unknown>[][] = [];
  const autoCorrectedRows: { row: number; data: Record<string, unknown>; corrections: string[] }[] = [];

  const columnStats: Record<string, { sum: number; count: number; lastValid: string }> = {};

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    step: (results) => {
      totalRows++;

      const row = results.data as Record<string, unknown>;
      const validation = validateRow(row, schema, totalRows, columnStats);

      if (validation.cleanedRow) {
        currentChunk.push(validation.cleanedRow);

        if (validation.isAutoCorrected) {
          autoCorrectedCount++;
          autoCorrectedRows.push({
            row: totalRows + 1,
            data: row,
            corrections: validation.corrections
          });
        } else {
          validRowsCount++;
        }

        if (currentChunk.length >= chunkSize) {
          validChunks.push([...currentChunk]);
          currentChunk = [];

          self.postMessage({
            type: 'progress',
            data: { totalRows, validRowsCount, autoCorrectedCount, status: 'Processing...' }
          });
        }
      }

      if (totalRows % 500 === 0) {
        self.postMessage({
          type: 'progress',
          data: { totalRows, validRowsCount, autoCorrectedCount, status: 'Processing...' }
        });
      }
    },
    complete: () => {
      self.postMessage({
        type: 'progress',
        data: { totalRows, validRowsCount, autoCorrectedCount, status: 'Finalizing...' }
      });

      if (currentChunk.length > 0) {
        validChunks.push(currentChunk);
      }

      const chunkCsvs = validChunks.map(chunk => Papa.unparse(chunk as Record<string, unknown>[]));

      self.postMessage({
        type: 'complete',
        data: {
          totalRows,
          validRowsCount,
          autoCorrectedCount,
          chunkCsvs,
          autoCorrectedRowsDetail: autoCorrectedRows
        }
      });
    },
    error: (error) => {
      self.postMessage({
        type: 'error',
        error: error.message
      });
    }
  });
};

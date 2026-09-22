import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedWorkbook, MatchResult, FillOutcome } from "@/types";
import type { NeedsColumnSelection } from "@/parser/xlsxParser";
import { parseWorkbook } from "@/parser/xlsxParser";
import { matchStudents } from "@/matcher/matchStudents";
import type { FillPlanEntry } from "@/espro/fillPlan";
import { FillStatusBadge, PreviewTable, StatusBadge } from "./PreviewTable";
import { getActiveTab, isExtensionContext, restoreBrowserWindow, sendToBackground, sendToContent } from "./messaging";

type Phase =
  | { name: "no-file" }
  | { name: "column-selection"; buffer: ArrayBuffer; fileName: string; needs: NeedsColumnSelection }
  | { name: "file-ready"; workbook: ParsedWorkbook }
  | { name: "checking"; workbook: ParsedWorkbook }
  | {
      name: "preview";
      workbook: ParsedWorkbook;
      results: MatchResult[];
      maxMarks: number | null;
      pagination: { currentPage: number; totalPages: number } | null;
      pageWarnings: string[];
    }
  | { name: "filling"; workbook: ParsedWorkbook; results: MatchResult[] }
  | { name: "completed"; outcomes: FillOutcome[] };

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: "no-file" });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [includeAlreadyFilled, setIncludeAlreadyFilled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore a workbook already loaded earlier this session (popup unmounts on close).
  useEffect(() => {
    if (!isExtensionContext()) return;
    sendToBackground({ type: "GET_WORKBOOK" }).then((res) => {
      if (res.type === "WORKBOOK" && res.workbook) {
        setPhase({ name: "file-ready", workbook: res.workbook });
      }
    });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Only .xlsx files are supported right now. Please export or save your mark list as .xlsx.");
      return;
    }
    const buffer = await readFileAsArrayBuffer(file);
    const result = parseWorkbook(buffer);

    if (result.status === "error") {
      setError(result.message);
      return;
    }
    if (result.status === "needs-column-selection") {
      setPhase({ name: "column-selection", buffer, fileName: file.name, needs: result });
      return;
    }
    const workbook: ParsedWorkbook = { ...result.workbook, fileName: file.name };
    if (isExtensionContext()) await sendToBackground({ type: "SET_WORKBOOK", workbook });
    setPhase({ name: "file-ready", workbook });
  }, []);

  const confirmColumns = useCallback(
    async (selection: { identifierColumn: string; markColumn: string; nameColumn: string | null }) => {
      if (phase.name !== "column-selection") return;
      setError(null);
      const result = parseWorkbook(phase.buffer, {
        sheetName: phase.needs.sheetName,
        identifierColumn: selection.identifierColumn,
        markColumn: selection.markColumn,
        nameColumn: selection.nameColumn,
      });
      if (result.status !== "ok") {
        setError(result.status === "error" ? result.message : "These columns are still ambiguous. Please pick specific columns.");
        return;
      }
      const workbook: ParsedWorkbook = { ...result.workbook, fileName: phase.fileName };
      if (isExtensionContext()) await sendToBackground({ type: "SET_WORKBOOK", workbook });
      setPhase({ name: "file-ready", workbook });
    },
    [phase],
  );

  const importDifferentFile = useCallback(async () => {
    if (isExtensionContext()) await sendToBackground({ type: "CLEAR_WORKBOOK" });
    setError(null);
    setPhase({ name: "no-file" });
  }, []);

  const checkEspro = useCallback(async () => {
    if (phase.name !== "file-ready") return;
    setError(null);
    setPhase({ name: "checking", workbook: phase.workbook });

    if (!isExtensionContext()) {
      setError("Standalone preview mode — open this popup as an installed extension to detect a live ESPro page.");
      setPhase({ name: "file-ready", workbook: phase.workbook });
      return;
    }

    const tab = await getActiveTab();
    if (!tab) {
      setError("Could not determine the active tab.");
      setPhase({ name: "file-ready", workbook: phase.workbook });
      return;
    }

    const response = await sendToContent(tab.tabId, { type: "DETECT_STUDENTS" });

    if (response.type === "ERROR") {
      setError(response.message);
      setPhase({ name: "file-ready", workbook: phase.workbook });
      return;
    }
    if (response.type !== "DETECT_RESULT") return;

    if (!response.pageRecognized) {
      setError(
        "ESPro page not detected. Open the ESPro internal marks-entry page for this class, then click \"Check ESPro page\" again.",
      );
      setPhase({ name: "file-ready", workbook: phase.workbook });
      return;
    }
    if (response.students.length === 0) {
      setError("This ESPro page was recognized, but no student rows were found on it.");
      setPhase({ name: "file-ready", workbook: phase.workbook });
      return;
    }

    const results = matchStudents(phase.workbook.records, response.students, { maxMarks: response.maxMarks });
    setPhase({
      name: "preview",
      workbook: phase.workbook,
      results,
      maxMarks: response.maxMarks,
      pagination: response.pagination,
      pageWarnings: response.warnings,
    });
  }, [phase]);

  const fillMarks = useCallback(async () => {
    if (phase.name !== "preview") return;
    setError(null);

    const statusesToFill = includeAlreadyFilled ? ["MATCHED", "ALREADY_FILLED"] : ["MATCHED"];
    const plan: FillPlanEntry[] = phase.results
      .filter((r) => statusesToFill.includes(r.status) && r.markToWrite !== null && r.esproStudent)
      .map((r) => ({ rowIndex: r.esproStudent!.rowIndex, identifier: r.esproStudent!.identifierRaw, value: r.markToWrite! }));

    if (plan.length === 0) {
      setError("Nothing is ready to fill yet.");
      return;
    }

    setPhase({ name: "filling", workbook: phase.workbook, results: phase.results });

    if (!isExtensionContext()) {
      setError("Standalone preview mode — filling only works against a live ESPro tab.");
      setPhase(phase);
      return;
    }

    const tab = await getActiveTab();
    if (!tab) {
      setError("Could not determine the active tab.");
      setPhase(phase);
      return;
    }

    const response = await sendToContent(tab.tabId, { type: "FILL_MARKS", plan });
    if (response.type === "ERROR") {
      setError(response.message);
      setPhase(phase);
      return;
    }
    if (response.type !== "FILL_RESULT") return;

    setPhase({ name: "completed", outcomes: response.outcomes });
  }, [phase, includeAlreadyFilled]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <div className="app__title">Mark</div>
          <div className="app__tagline">Fill ESPro marks from Excel</div>
        </div>
        {phase.name !== "no-file" && (
          <button className="link-button" onClick={importDifferentFile}>
            Import a different file
          </button>
        )}
      </header>

      {error && (
        <div className="banner banner--error">
          <span>{error}</span>
          <button className="banner__dismiss" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {phase.name === "no-file" && (
        <ImportScreen dragOver={dragOver} setDragOver={setDragOver} onFile={handleFile} fileInputRef={fileInputRef} />
      )}

      {phase.name === "column-selection" && <ColumnSelectionScreen needs={phase.needs} onConfirm={confirmColumns} />}

      {phase.name === "file-ready" && <FileReadyScreen workbook={phase.workbook} onCheck={checkEspro} />}

      {phase.name === "checking" && (
        <div className="status-block">
          <div className="spinner" />
          <div>Looking for ESPro on this tab…</div>
        </div>
      )}

      {phase.name === "preview" && (
        <PreviewScreen
          results={phase.results}
          pagination={phase.pagination}
          pageWarnings={phase.pageWarnings}
          includeAlreadyFilled={includeAlreadyFilled}
          setIncludeAlreadyFilled={setIncludeAlreadyFilled}
          onFill={fillMarks}
        />
      )}

      {phase.name === "filling" && (
        <div className="status-block">
          <div className="spinner" />
          <div>Filling marks…</div>
        </div>
      )}

      {phase.name === "completed" && (
        <CompletedScreen
          outcomes={phase.outcomes}
          onDone={() => {
            void restoreBrowserWindow();
            window.close();
          }}
        />
      )}
    </div>
  );
}

function ImportScreen({
  dragOver,
  setDragOver,
  onFile,
  fileInputRef,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFile: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className={`dropzone ${dragOver ? "dropzone--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <div className="dropzone__title">Import your mark list</div>
      <div className="dropzone__hint">Drag an Excel file here</div>
      <div className="dropzone__or">or</div>
      <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
        Choose Excel file
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ColumnSelectionScreen({
  needs,
  onConfirm,
}: {
  needs: NeedsColumnSelection;
  onConfirm: (s: { identifierColumn: string; markColumn: string; nameColumn: string | null }) => void;
}) {
  const [identifierColumn, setIdentifierColumn] = useState(needs.identifier.resolved ?? "");
  const [markColumn, setMarkColumn] = useState(needs.mark.resolved ?? "");
  const [nameColumn, setNameColumn] = useState(needs.name.resolved ?? "");

  return (
    <div className="screen">
      <div className="screen__title">Confirm columns</div>
      <div className="screen__hint">
        We couldn't tell for certain which columns to use in sheet "{needs.sheetName}". Please choose them below.
      </div>

      <label className="field">
        <span>Student identifier column *</span>
        <select value={identifierColumn} onChange={(e) => setIdentifierColumn(e.target.value)}>
          <option value="" disabled>
            Choose a column…
          </option>
          {needs.headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Marks column *</span>
        <select value={markColumn} onChange={(e) => setMarkColumn(e.target.value)}>
          <option value="" disabled>
            Choose a column…
          </option>
          {needs.headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Name column (optional)</span>
        <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
          <option value="">None</option>
          {needs.headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>

      <button
        className="btn btn--primary"
        disabled={!identifierColumn || !markColumn}
        onClick={() => onConfirm({ identifierColumn, markColumn, nameColumn: nameColumn || null })}
      >
        Continue
      </button>
    </div>
  );
}

function FileReadyScreen({ workbook, onCheck }: { workbook: ParsedWorkbook; onCheck: () => void }) {
  const [peeking, setPeeking] = useState(false);

  return (
    <div className="screen">
      <div className="screen__title">Marks ready</div>
      <div className="summary-card">
        <div className="summary-row">
          <span>Students found</span>
          <strong>{workbook.records.length}</strong>
        </div>
        <div className="summary-row">
          <span>Excel file</span>
          <strong className="summary-row__truncate">{workbook.fileName}</strong>
        </div>
        <div className="summary-row">
          <span>Identifier column</span>
          <strong>{workbook.identifierColumn}</strong>
        </div>
        <div className="summary-row">
          <span>Marks column</span>
          <strong>{workbook.markColumn}</strong>
        </div>
      </div>
      {workbook.warnings.length > 0 && (
        <div className="banner banner--warn">
          {workbook.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <button className="link-button link-button--block" onClick={() => setPeeking((v) => !v)}>
        {peeking ? "Hide imported data" : "Peek at imported data"}
      </button>
      {peeking && <ExcelPeekTable workbook={workbook} />}

      <button className="btn btn--primary" onClick={onCheck}>
        Check ESPro page
      </button>
    </div>
  );
}

function ExcelPeekTable({ workbook }: { workbook: ParsedWorkbook }) {
  return (
    <div className="preview-table-wrap">
      <table className="preview-table">
        <thead>
          <tr>
            <th>Row</th>
            <th>{workbook.identifierColumn}</th>
            {workbook.nameColumn && <th>{workbook.nameColumn}</th>}
            <th>{workbook.markColumn}</th>
          </tr>
        </thead>
        <tbody>
          {workbook.records.map((r) => (
            <tr key={r.rowNumber}>
              <td>{r.rowNumber}</td>
              <td className="preview-table__id">{r.identifierRaw || "—"}</td>
              {workbook.nameColumn && <td className="preview-table__name">{r.nameRaw ?? "—"}</td>}
              <td>{r.markRaw ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewScreen({
  results,
  pagination,
  pageWarnings,
  includeAlreadyFilled,
  setIncludeAlreadyFilled,
  onFill,
}: {
  results: MatchResult[];
  pagination: { currentPage: number; totalPages: number } | null;
  pageWarnings: string[];
  includeAlreadyFilled: boolean;
  setIncludeAlreadyFilled: (v: boolean) => void;
  onFill: () => void;
}) {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const matched = counts.MATCHED ?? 0;
  const alreadyFilled = counts.ALREADY_FILLED ?? 0;
  const issues = results.length - matched - alreadyFilled;
  const readyCount = matched + (includeAlreadyFilled ? alreadyFilled : 0);

  return (
    <div className="screen">
      <div className="screen__title">Ready to fill {matched} student{matched === 1 ? "" : "s"}</div>

      {pagination && pagination.totalPages > 1 && (
        <div className="banner banner--info">
          This ESPro page shows page {pagination.currentPage} of {pagination.totalPages}. Only students visible on the
          current page were matched. Repeat this on each page.
        </div>
      )}
      {pageWarnings.map((w, i) => (
        <div key={i} className="banner banner--warn">
          {w}
        </div>
      ))}

      <div className="summary-line">
        <span className="summary-line__good">✓ {matched} matched</span>
        {issues > 0 && <span className="summary-line__warn">⚠ {issues} issue{issues === 1 ? "" : "s"}</span>}
      </div>

      {alreadyFilled > 0 && (
        <label className="checkbox-field">
          <input type="checkbox" checked={includeAlreadyFilled} onChange={(e) => setIncludeAlreadyFilled(e.target.checked)} />
          <span>
            Also overwrite {alreadyFilled} field{alreadyFilled === 1 ? "" : "s"} that already {alreadyFilled === 1 ? "has" : "have"} a
            mark in ESPro
          </span>
        </label>
      )}

      <PreviewTable results={results} />

      <button className="btn btn--primary" disabled={readyCount === 0} onClick={onFill}>
        Fill {readyCount} mark{readyCount === 1 ? "" : "s"}
      </button>
    </div>
  );
}

function CompletedScreen({ outcomes, onDone }: { outcomes: FillOutcome[]; onDone: () => void }) {
  const verified = outcomes.filter((o) => o.status === "VERIFIED").length;
  const failed = outcomes.filter((o) => o.status !== "VERIFIED");

  return (
    <div className="screen">
      <div className="screen__title">Marks filled</div>
      <div className="summary-line">
        <span className="summary-line__good">
          ✓ {verified} / {outcomes.length} verified
        </span>
        {failed.length > 0 && <span className="summary-line__warn">⚠ {failed.length} need attention</span>}
      </div>

      {failed.length > 0 && (
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((o, i) => (
                <tr key={i}>
                  <td className="preview-table__id">{o.identifier}</td>
                  <td>{o.expected}</td>
                  <td>{o.actual ?? "blank"}</td>
                  <td>
                    <FillStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="screen__hint">
        Nothing was submitted. Review the values in ESPro, then use ESPro's own Save/Submit to finish.
      </div>

      <button className="btn btn--primary" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

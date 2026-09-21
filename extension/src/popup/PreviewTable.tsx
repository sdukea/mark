import type { MatchResult, MatchStatus } from "@/types";

const STATUS_META: Record<MatchStatus, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  MATCHED: { label: "Ready", tone: "good" },
  NOT_FOUND: { label: "Not found", tone: "bad" },
  DUPLICATE_EXCEL: { label: "Duplicate in sheet", tone: "bad" },
  DUPLICATE_ESPRO: { label: "Duplicate on page", tone: "bad" },
  MISSING_MARK: { label: "No mark", tone: "neutral" },
  INVALID_MARK: { label: "Invalid mark", tone: "bad" },
  IDENTIFIER_CONFLICT: { label: "Name mismatch", tone: "warn" },
  ALREADY_FILLED: { label: "Already filled", tone: "warn" },
  LOW_CONFIDENCE: { label: "Low confidence", tone: "warn" },
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  const meta = STATUS_META[status];
  return <span className={`badge badge--${meta.tone}`}>{meta.label}</span>;
}

const FILL_STATUS_META: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  VERIFIED: { label: "Verified", tone: "good" },
  MISMATCH: { label: "Mismatch", tone: "bad" },
  FAILED: { label: "Failed", tone: "bad" },
  SKIPPED: { label: "Skipped", tone: "neutral" },
};

export function FillStatusBadge({ status }: { status: string }) {
  const meta = FILL_STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <span className={`badge badge--${meta.tone}`}>{meta.label}</span>;
}

function displayName(result: MatchResult): string {
  return result.excelRecord?.nameRaw ?? result.esproStudent?.nameRaw ?? "—";
}

function displayId(result: MatchResult): string {
  return result.excelRecord?.identifierRaw || result.esproStudent?.identifierRaw || "—";
}

export function PreviewTable({ results }: { results: MatchResult[] }) {
  return (
    <div className="preview-table-wrap">
      <table className="preview-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>ID</th>
            <th>Excel mark</th>
            <th>ESPro</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td className="preview-table__name">{displayName(r)}</td>
              <td className="preview-table__id">{displayId(r)}</td>
              <td>{r.excelRecord?.markRaw ?? "—"}</td>
              <td>{r.esproStudent?.currentValue || "blank"}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

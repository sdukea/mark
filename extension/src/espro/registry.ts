import type { EsproPageAdapter } from "./adapter";
import { mockEsproAdapter } from "./mockAdapter";

// Once we have the real ESPro DOM, its adapter gets added here. The rest of
// the extension only ever calls getActiveAdapter() and never imports a
// specific adapter directly.
const ADAPTERS: EsproPageAdapter[] = [mockEsproAdapter];

export function getActiveAdapter(doc: Document = document): EsproPageAdapter | null {
  return ADAPTERS.find((adapter) => adapter.matchesCurrentPage(doc)) ?? null;
}

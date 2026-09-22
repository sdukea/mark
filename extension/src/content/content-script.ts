import type { ContentRequest, ContentResponse } from "@/types/messages";
import { getActiveAdapter } from "@/espro/registry";
import { discoverEsproStudents, toSnapshot } from "@/espro/discoverStudents";
import { executeFillPlan } from "@/espro/fillPlan";

chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
  sendResponse(handleMessage(message));
  return false; // synchronous response
});

function handleMessage(message: ContentRequest): ContentResponse {
  const adapter = getActiveAdapter(document);

  switch (message.type) {
    case "PING": {
      return { type: "PONG", pageRecognized: adapter !== null, adapterId: adapter?.id ?? null };
    }

    case "DETECT_STUDENTS": {
      if (!adapter) {
        return { type: "DETECT_RESULT", pageRecognized: false, students: [], maxMarks: null, pagination: null, warnings: [] };
      }
      const result = discoverEsproStudents(document, adapter);
      return {
        type: "DETECT_RESULT",
        pageRecognized: true,
        students: result.students.map(toSnapshot),
        maxMarks: result.maxMarks,
        pagination: result.pagination,
        warnings: result.warnings,
      };
    }

    case "FILL_MARKS": {
      if (!adapter) {
        return { type: "ERROR", message: "This is no longer an ESPro marks page — nothing was filled." };
      }
      const outcomes = executeFillPlan(document, adapter, message.plan);
      return { type: "FILL_RESULT", outcomes };
    }
  }
}

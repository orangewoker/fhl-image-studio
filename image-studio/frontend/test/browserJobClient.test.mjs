import assert from "node:assert/strict";
import test from "node:test";

import { subscribeToBrowserJob } from "../src/platform/runtime/browserJobClient.ts";

test("browser job subscriptions notify when an SSE stream ends without a terminal event", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  try {
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          'data: {"type":"snapshot","slot":{"jobId":"job-1"},"group":{"groupId":"group-1","workspaceId":"ws-1","createdAt":1,"mode":"generate","apiMode":"responses","prompt":"prompt","batchCount":1,"size":"864x1536","quality":"medium","outputFormat":"png","slotIds":["job-1"],"slots":[{"jobId":"job-1","groupId":"group-1","workspaceId":"ws-1","batchIndex":0,"status":"running","createdAt":1,"updatedAt":2}]}}\n\n',
        ));
        controller.close();
      },
    }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const events = [];
    await new Promise((resolve) => {
      subscribeToBrowserJob("job-1", (event) => {
        events.push(event);
      }, undefined, () => {
        resolve(undefined);
      });
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "snapshot");
    assert.equal(events[0].slot.jobId, "job-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

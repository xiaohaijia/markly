import "fake-indexeddb/auto";
if (!globalThis.CSS)
  Object.defineProperty(globalThis, "CSS", {
    value: { escape: (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "\\$&") },
  });

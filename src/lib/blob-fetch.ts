import { fetch as directFetch } from "undici";

// Next patches global fetch with its own cache lifecycle. Blob operations also
// run before the route handler, so they must not depend on that lifecycle.
export const blobFetch: typeof fetch = (input, init) => {
  const transport = process.env.NETLIFY ? directFetch : globalThis.fetch;
  return (transport as typeof fetch)(input, { ...init, cache: "no-store" });
};

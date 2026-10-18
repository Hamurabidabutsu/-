import { fetch as directFetch } from "undici";

// Next patches global fetch with its own cache lifecycle. Blob operations also
// run before the route handler, so they must not depend on that lifecycle.
export const blobFetch: typeof fetch = async (input, init) => {
  // NETLIFY is a build variable and need not exist in a deployed function.
  const testing = process.env.NODE_ENV === "test" && !process.env.NETLIFY;
  const transport = testing ? globalThis.fetch : directFetch;
  const response = await (transport as typeof fetch)(input, {
    ...init,
    cache: "no-store",
  });
  return response;
};


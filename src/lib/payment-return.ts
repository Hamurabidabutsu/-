// A saved application is a fallback when an access gateway drops return queries.
// Neither a visit without checkout evidence nor an explicit cancellation captures.
export function paymentReturnApplication(
  params: { get(name: string): string | null },
  saved: string | null,
) {
  if (params.get("cancelled") === "1") return null;
  const application = params.get("application") || saved;
  return application && (params.get("token") || saved === application)
    ? application
    : null;
}


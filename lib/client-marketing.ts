export function currentMarketingContext(extra: { destinationSlug?: string; packageSlug?: string } = {}) {
  const params = new URLSearchParams(window.location.search);
  return {
    sourcePath: window.location.pathname,
    destinationSlug: extra.destinationSlug || params.get("destination_slug") || undefined,
    packageSlug: extra.packageSlug || params.get("package") || undefined,
    utmSource: params.get("utm_source") || undefined,
    utmMedium: params.get("utm_medium") || undefined,
    utmCampaign: params.get("utm_campaign") || undefined,
  };
}

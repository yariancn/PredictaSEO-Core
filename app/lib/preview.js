export function describePreviewChanges(item, copy = {}) {
  const changes = item?.changes ?? {};
  const lines = [];
  if (changes.seoTitle) {
    const label = copy.changeSearchTitle || "Search title";
    lines.push(`${label}: ${changes.seoTitle}`);
  }
  if (changes.seoDescription) {
    const label = copy.changeSearchDesc || "Search description";
    const desc = changes.seoDescription;
    lines.push(`${label}: ${desc.length > 72 ? `${desc.slice(0, 72)}…` : desc}`);
  }
  if (changes.descriptionHtml) {
    lines.push(copy.changeProductDesc || copy.previewDesc || "Product description added");
  }
  return lines;
}

export function getPreviewChangeStats(preview) {
  const items = preview?.items ?? [];
  let searchTitles = 0;
  let searchDescs = 0;
  let productDescs = 0;

  for (const item of items) {
    if (item.changes?.seoTitle) searchTitles += 1;
    if (item.changes?.seoDescription) searchDescs += 1;
    if (item.changes?.descriptionHtml) productDescs += 1;
  }

  return {
    searchTitles,
    searchDescs,
    productDescs,
    productCount: preview?.productCount ?? items.length,
    batchCount: preview?.batchCount ?? 0,
    mirrorCount: preview?.mirrorCount ?? 0,
    schemaWillApply: Boolean(preview?.schema?.willApply),
  };
}

export function copyText(copy, key, fallback = "") {
  const text = copy?.[key];
  return typeof text === "string" && text.length > 0 ? text : fallback;
}

export function fillCopy(template, vars = {}) {
  let out = template ?? "";
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return out;
}

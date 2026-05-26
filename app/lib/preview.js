export function describePreviewChanges(item) {
  const changes = item?.changes ?? {};
  const lines = [];
  if (changes.seoTitle) lines.push(`Search title: ${changes.seoTitle}`);
  if (changes.seoDescription) {
    const desc = changes.seoDescription;
    lines.push(`Search description: ${desc.length > 72 ? `${desc.slice(0, 72)}…` : desc}`);
  }
  if (changes.descriptionHtml) lines.push("Product description added");
  return lines;
}

export function copyText(copy, key, fallback = "") {
  const text = copy?.[key];
  return typeof text === "string" && text.length > 0 ? text : fallback;
}

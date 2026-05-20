export function extractTemplateVariables(body: string) {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]))];
}

export function renderTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

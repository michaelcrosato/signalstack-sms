import { templatePlaceholderRegExp } from "@/lib/messaging/template-placeholders";

export function extractTemplateVariables(body: string) {
  return [...new Set([...body.matchAll(templatePlaceholderRegExp())].map((match) => match[1]))];
}

export function renderTemplate(body: string, values: Record<string, string>) {
  return body.replace(templatePlaceholderRegExp(), (_match, key: string) => values[key] ?? "");
}

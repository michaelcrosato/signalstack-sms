import { templatePlaceholderRegExp } from "@/lib/messaging/template-placeholders";

export function extractTemplateVariables(body: string) {
  return [...new Set([...body.matchAll(templatePlaceholderRegExp())].map((match) => match[1]))];
}

export function renderTemplate(body: string, values: Record<string, string>) {
  // Only substitute own properties. Placeholder names like `constructor`, `__proto__`, or `toString`
  // resolve to inherited Object.prototype members, which would otherwise leak JS-engine internals into
  // the outbound message. This matches the own-property guard the preview path already applies.
  return body.replace(templatePlaceholderRegExp(), (_match, key: string) =>
    Object.hasOwn(values, key) ? values[key] ?? "" : ""
  );
}

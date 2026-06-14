/**
 * Render template body by replacing placeholders in the format {{variableName}} with values.
 * Returns the fully rendered output and lists of missing or unused variables.
 */
export function renderTemplatePreview(body: string, variables: Record<string, string>) {
  const missing: string[] = [];
  const unused = new Set(Object.keys(variables));

  const placeholderRegex = /\{\{([a-zA-Z_$][\w$]*)\}\}/g;
  const matches = [...body.matchAll(placeholderRegex)];
  const requiredKeys = [...new Set(matches.map((m) => m[1]))];

  let rendered = body;

  for (const key of requiredKeys) {
    if (key in variables) {
      const val = variables[key] ?? "";
      rendered = rendered.replaceAll(`{{${key}}}`, val);
      unused.delete(key);
    } else {
      missing.push(key);
    }
  }

  return {
    rendered,
    success: missing.length === 0,
    missing,
    unused: Array.from(unused)
  };
}

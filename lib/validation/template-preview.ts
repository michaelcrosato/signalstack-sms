/**
 * Render template body by replacing placeholders in the format {{variableName}} with values.
 * Returns the fully rendered output and lists of missing or unused variables.
 */
export function renderTemplatePreview(body: string, variables: Record<string, string>) {
  const missing: string[] = [];
  const unused = new Set(Object.keys(variables));
  const missingKeys = new Set<string>();

  const placeholderRegex = /\{\{([a-zA-Z_$][\w$]*)\}\}/g;
  const rendered = body.replace(placeholderRegex, (placeholder, key: string) => {
    if (Object.hasOwn(variables, key)) {
      unused.delete(key);
      return variables[key] ?? "";
    }

    if (!missingKeys.has(key)) {
      missingKeys.add(key);
      missing.push(key);
    }
    return placeholder;
  });

  return {
    rendered,
    success: missing.length === 0,
    missing,
    unused: Array.from(unused)
  };
}
import { z } from "zod";

const templateVariableNameSchema = z.string().regex(/^[a-zA-Z_$][\w$]*$/);

export const templatePreviewSchema = z.object({
  templateId: z.string().trim().min(1),
  variables: z.record(templateVariableNameSchema, z.string().max(1600))
});

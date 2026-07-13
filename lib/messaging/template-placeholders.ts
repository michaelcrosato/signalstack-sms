// Canonical template placeholder grammar. A placeholder is recognized identically by authoring
// (`extractTemplateVariables`), preview (`renderTemplatePreview`), and send (`renderTemplate`), so a
// template never renders differently when previewed than it does when sent. Variable names must also
// satisfy `templateVariableNameSchema`, which is derived from the same pattern.
//
// Grammar: `{{ name }}` where `name` starts with a letter, underscore, or `$` and continues with word
// characters or `$`. Surrounding whitespace inside the braces is tolerated. Anything else (e.g.
// `{{first-name}}`, `{{a.b}}`) is not a placeholder and is left as literal text by every path.
export const TEMPLATE_VARIABLE_NAME_PATTERN = "[a-zA-Z_$][\\w$]*";

/**
 * A fresh stateful global RegExp for matching placeholders. Returned per call because a `/g` RegExp
 * carries `lastIndex` state that must not be shared between `matchAll`/`replace` invocations.
 */
export function templatePlaceholderRegExp(): RegExp {
  return new RegExp(`\\{\\{\\s*(${TEMPLATE_VARIABLE_NAME_PATTERN})\\s*\\}\\}`, "g");
}

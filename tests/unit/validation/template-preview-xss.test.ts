import { describe, expect, it } from "vitest";
import { renderTemplatePreview } from "@/lib/validation/template-preview";

describe("Message Template Validation XSS Security", () => {
  it("escapes HTML in template variables to prevent XSS injection", () => {
    const body = "Welcome {{name}}! Check out your profile {{bio}}";

    // Inject malicious HTML
    const variables = {
      name: "<script>alert(1)</script>",
      bio: "<b>bold</b> & \"quoted\" 'string'"
    };

    const res = renderTemplatePreview(body, variables);

    expect(res.success).toBe(true);
    // Ensure all unsafe characters are escaped
    expect(res.rendered).not.toContain("<script>");
    expect(res.rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(res.rendered).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; &#039;string&#039;");
  });
});

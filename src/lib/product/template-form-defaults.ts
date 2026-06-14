const productTemplateFormDefaultItems = {
  name: "Product demo follow-up",
  body: "Hi {{firstName}}, your SignalStack demo is ready. Reply STOP to opt out."
} as const;

export const productTemplateFormDefaults = Object.freeze({ ...productTemplateFormDefaultItems });

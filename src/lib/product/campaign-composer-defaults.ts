const productCampaignComposerDefaultItems = {
  name: "Product demo campaign",
  body: "Hi {{firstName}}, this is SignalStack Demo Co. Reply STOP to opt out.",
  copyPrompt: "Invite opted-in leads to book a quick demo",
  aiBusinessName: "SignalStack Demo Co",
  aiTone: "concise"
} as const;

export const productCampaignComposerDefaults = Object.freeze({ ...productCampaignComposerDefaultItems });

const productInboxWorkspaceDefaultItems = {
  inboundReply: "YES, please send the starter plan details.",
  internalNote: "Follow up with pricing context after demo."
} as const;

export const productInboxWorkspaceDefaults = Object.freeze({ ...productInboxWorkspaceDefaultItems });

const productComplianceFieldItems = [
  {
    key: "businessName",
    label: "Business name",
    guidance: "Legal sender identity for campaign registration and customer trust."
  },
  {
    key: "messagingUseCase",
    label: "Messaging use case",
    guidance: "Plain-language description of expected SMS content."
  },
  {
    key: "optInDescription",
    label: "Opt-in description",
    guidance: "How contacts knowingly consent before receiving messages."
  },
  {
    key: "privacyPolicyUrl",
    label: "Privacy policy URL",
    guidance: "Public policy link required before live registration review."
  },
  {
    key: "termsOfServiceUrl",
    label: "Terms of service URL",
    guidance: "Public terms link required before live registration review."
  }
] as const;

export const productComplianceFields = Object.freeze(
  productComplianceFieldItems.map((field) => Object.freeze({ ...field }))
);

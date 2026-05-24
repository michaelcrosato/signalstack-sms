import { ConsentStatus } from "@prisma/client";

const productContactConsentOptionItems = [
  { value: ConsentStatus.UNKNOWN, label: "UNKNOWN" },
  { value: ConsentStatus.OPTED_IN, label: "OPTED_IN" },
  { value: ConsentStatus.OPTED_OUT, label: "OPTED_OUT" }
] as const;

export const productContactConsentOptions = Object.freeze(
  productContactConsentOptionItems.map((option) => Object.freeze({ ...option }))
);

import { ConsentStatus, type Contact } from "@prisma/client";

export type CampaignPreflightRecipient = {
  contactId: string;
  phone: string;
  allowed: boolean;
  reasons: string[];
};

export type CampaignPreflightResult = {
  allowed: boolean;
  totalRecipients: number;
  allowedRecipients: number;
  blockedRecipients: number;
  recipients: CampaignPreflightRecipient[];
};

export function preflightCampaignRecipients(
  contacts: Array<Pick<Contact, "id" | "phone" | "consentStatus" | "optedOutAt" | "archivedAt">>
): CampaignPreflightResult {
  const recipients = contacts.map((contact) => {
    const reasons: string[] = [];

    if (contact.archivedAt) {
      reasons.push("CONTACT_ARCHIVED");
    }
    if (contact.consentStatus !== ConsentStatus.OPTED_IN) {
      reasons.push("CONSENT_NOT_OPTED_IN");
    }
    if (contact.optedOutAt || contact.consentStatus === ConsentStatus.OPTED_OUT) {
      reasons.push("CONTACT_OPTED_OUT");
    }

    return {
      contactId: contact.id,
      phone: contact.phone,
      allowed: reasons.length === 0,
      reasons
    };
  });

  const allowedRecipients = recipients.filter((recipient) => recipient.allowed).length;
  const blockedRecipients = recipients.length - allowedRecipients;

  return {
    allowed: recipients.length > 0 && blockedRecipients === 0,
    totalRecipients: recipients.length,
    allowedRecipients,
    blockedRecipients,
    recipients
  };
}

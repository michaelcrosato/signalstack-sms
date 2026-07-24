import { ConsentStatus, type Contact } from "@prisma/client";
import { isWithinQuietHours } from "@/lib/compliance/quiet-hours";
import { resolveTimezoneFromPhone } from "@/lib/compliance/area-codes";

export type PreflightOptions = {
  now?: Date;
  timeZone?: string;
  state?: string;
  checkQuietHours?: boolean;
};

export type PreflightContactInput = Pick<
  Contact,
  "id" | "phone" | "consentStatus" | "optedOutAt" | "archivedAt"
> & {
  timezone?: string | null;
  state?: string | null;
};

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
  contacts: Array<PreflightContactInput>,
  selectedContactIds?: string[],
  options?: PreflightOptions
): CampaignPreflightResult {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const recipientRows = selectedContactIds
    ? [...new Set(selectedContactIds)].map((contactId) => ({
        contactId,
        contact: contactsById.get(contactId) ?? null
      }))
    : contacts.map((contact) => ({ contactId: contact.id, contact }));

  const recipients = recipientRows.map(({ contactId, contact }) => {
    const reasons: string[] = [];

    if (!contact) {
      return {
        contactId,
        phone: "unknown",
        allowed: false,
        reasons: ["CONTACT_NOT_FOUND"]
      };
    }

    if (contact.archivedAt) {
      reasons.push("CONTACT_ARCHIVED");
    }
    if (contact.consentStatus === ConsentStatus.PENDING_DOUBLE_OPT_IN) {
      reasons.push("PENDING_DOUBLE_OPT_IN");
    } else if (contact.consentStatus !== ConsentStatus.OPTED_IN) {
      reasons.push("CONSENT_NOT_OPTED_IN");
    }
    if (contact.optedOutAt || contact.consentStatus === ConsentStatus.OPTED_OUT) {
      reasons.push("CONTACT_OPTED_OUT");
    }
    if (options?.checkQuietHours && options?.now) {
      const recipientTz =
        contact.timezone || resolveTimezoneFromPhone(contact.phone, options.timeZone);
      const recipientState = contact.state || options.state;
      if (isWithinQuietHours(options.now, recipientTz, recipientState ?? undefined)) {
        reasons.push("QUIET_HOURS");
      }
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

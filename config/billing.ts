/**
 * Billing settings shown to customers.
 *
 * The bank details below are PLACEHOLDERS. Replace them with your real company
 * details (or set the environment variables) before inviting anyone to pay —
 * nothing here is a working account.
 */

export const billingContactEmail =
  process.env.BILLING_CONTACT_EMAIL ?? "billing@skylark.dev";

export const bankTransfer = {
  accountName: process.env.BILLING_ACCOUNT_NAME ?? "[Your company name]",
  iban: process.env.BILLING_IBAN ?? "[Your IBAN]",
  bic: process.env.BILLING_BIC ?? "[Your BIC/SWIFT]",
  bankName: process.env.BILLING_BANK_NAME ?? "[Your bank]",
};

/** True once real details have been supplied. */
export const bankDetailsConfigured = !bankTransfer.iban.startsWith("[");

/** Preset top-up amounts, in whole dollars. */
export const topupPresets = [10, 25, 50, 100, 250];

export const minTopupDollars = 5;
export const maxTopupDollars = 10_000;

/**
 * How customers pay today. `manual` means invoice + bank transfer, which is a
 * normal way to bill your first business customers and costs no card fees.
 * Switching to a provider is a config change: the ledger, not the provider,
 * is the source of truth for balances.
 */
export const activeBillingProvider: "manual" | "stripe" | "revolut" = "manual";

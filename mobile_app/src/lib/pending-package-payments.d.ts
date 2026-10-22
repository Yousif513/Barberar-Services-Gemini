import type { CheckoutClient, CheckoutLocale } from "./payment-checkout.js";
export interface PendingPackagePayment { id: string; amount: number; sessions: number; createdAt: string; name: { en: string; ar: string }; }
export const PENDING_PACKAGE_PAGE_SIZE: number;
export function loadPendingPackagePayments(client: any, page?: number, locale?: CheckoutLocale): Promise<{actorId: string | null; items: PendingPackagePayment[]; total: number}>;
export function resumePendingPackagePayment(client: CheckoutClient, purchaseId: string, options: {locale: CheckoutLocale; returnUrl: string; openCheckout: (url: string) => Promise<void>; refresh: () => void | Promise<void>}): Promise<void>;

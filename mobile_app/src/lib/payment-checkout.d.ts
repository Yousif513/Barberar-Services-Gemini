export type CheckoutLocale = "en" | "ar";
export interface CheckoutStorage { getItem(key: string): string | null | Promise<string | null>; setItem(key: string, value: string): void | Promise<void>; removeItem(key: string): void | Promise<void>; }
export interface CheckoutClient { auth: { getSession(): Promise<{data: {session: {user: {id: string}} | null}}> }; functions: { invoke(name: string, options: {body: object}): Promise<{data: unknown; error: unknown}> }; }
export interface CheckoutTarget { bookingId?: string; purchaseType?: string; purchaseId?: string; returnUrl?: string; }
export interface CheckoutReceipt { success: true; state: "ready"; attemptId: string; checkoutUrl: string; chargeId: string; }
export interface PurchaseRecord { id: string; status: string; matches: boolean; settled?: boolean; }
export class CheckoutStateError extends Error { state: string; code?: string; attemptId?: string; }
export const browserCheckoutStorage: CheckoutStorage;
export function requestCheckout(client: CheckoutClient, target: CheckoutTarget, locale?: CheckoutLocale, options?: {recoverFirst?: boolean; onCaptured?: () => void | Promise<void>}): Promise<CheckoutReceipt>;
export function ensurePurchase(options: {actorId: string; scope: string; locale?: CheckoutLocale; storage: CheckoutStorage; lookup: () => Promise<PurchaseRecord[]>; inspect: (id: string) => Promise<PurchaseRecord | null>; create: (requestKey?: string) => Promise<string>; makeKey?: () => string; idempotent?: boolean; onSettled?: () => void | Promise<void>}): Promise<{id: string; reused: boolean}>;

export function preparePurchase(client: any, options: {type: "package" | "gift_card" | "tip" | "subscription" | "membership"; actorId?: string; ownerId?: string; scope: string; material: Record<string, string | number | null>; locale?: CheckoutLocale; storage: CheckoutStorage; create: (requestKey?: string) => Promise<string>; makeKey?: () => string; idempotent?: boolean; onSettled?: () => void | Promise<void>}): Promise<{id: string; reused: boolean}>;

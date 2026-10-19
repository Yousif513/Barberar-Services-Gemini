// One-time codes the local GoTrue e-mails, read from the stack's Mailpit (never a real mailbox).

import { expect } from "@playwright/test";
import { stack } from "./stack";

type Summary = { ID: string; Created: string; To: { Address: string }[] };

async function messagesTo(address: string): Promise<Summary[]> {
  const url = `${stack().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=50`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mailpit search answered ${response.status}`);
  const body = (await response.json()) as { messages?: Summary[] };
  return body.messages ?? [];
}

export async function mailCount(address: string): Promise<number> {
  return (await messagesTo(address)).length;
}

/** Waits (by polling Mailpit, no fixed sleep) for a message newer than `seen` and returns the 6-digit code in it. */
export async function nextEmailCode(address: string, seen: number): Promise<string> {
  let latest: Summary | undefined;
  await expect.poll(async () => {
    const found = await messagesTo(address);
    if (found.length > seen) latest = found[0];
    return found.length;
  }, { message: `a new e-mail to the test account`, timeout: 20_000 }).toBeGreaterThan(seen);
  const response = await fetch(`${stack().mailpitUrl}/api/v1/message/${latest!.ID}`);
  const message = (await response.json()) as { Text?: string; HTML?: string };
  const code = `${message.Text ?? ""} ${message.HTML ?? ""}`.match(/\b(\d{6})\b/);
  if (!code) throw new Error("the e-mail holds no 6-digit code");
  return code[1];
}

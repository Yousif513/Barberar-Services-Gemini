"use client";

import React from "react";
import { OperationsPanel, type OperationsLocale } from "@/components/operations-ui";
import {
  API_SETTING_KEYS, BACKOFF_CAP_HOURS, DELIVERY_TIMEOUT_SECONDS, LEASE_MINUTES, MAX_URL_LENGTH, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX,
  RATE_LIMIT_WINDOW_SECONDS, SIGNATURE_TOLERANCE_SECONDS, type ApiSettings,
} from "@/lib/developer-api";
import type { DeveloperCopy } from "./copy";
import { StatusBadge } from "./shared";

export function LimitsTab({ locale, t, settings }: { locale: OperationsLocale; t: DeveloperCopy; settings: ApiSettings }) {
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA");
  const contract: Array<[string, number]> = [
    [t.contractRows.pageDefault, PAGE_SIZE_DEFAULT],
    [t.contractRows.pageMax, PAGE_SIZE_MAX],
    [t.contractRows.window, RATE_LIMIT_WINDOW_SECONDS],
    [t.contractRows.tolerance, SIGNATURE_TOLERANCE_SECONDS],
    [t.contractRows.timeout, DELIVERY_TIMEOUT_SECONDS],
    [t.contractRows.backoff, BACKOFF_CAP_HOURS],
    [t.contractRows.lease, LEASE_MINUTES],
    [t.contractRows.url, MAX_URL_LENGTH],
  ];
  return (
    <div className="space-y-6">
      <OperationsPanel title={t.limitsTitle}>
        <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.limitsIntro}</p>
        <h3 className="mt-5 text-sm font-black text-[#101828]">{t.limitsPlatform}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-start text-sm">
            <caption className="sr-only">{t.limitsPlatform}</caption>
            <tbody>
              {API_SETTING_KEYS.map((key) => {
                const value = settings[key];
                return (
                  <tr key={key} className="border-b border-[#F2F4F7] align-top">
                    <th scope="row" className="px-2 py-3 text-start font-bold text-[#101828]">
                      {t.settingLabel[key]}
                      <bdi dir="ltr" className="mt-0.5 block font-mono text-xs font-normal text-[#667085]">{key}</bdi>
                    </th>
                    <td className="px-2 py-3">
                      {value === null ? <StatusBadge tone="warn">{t.notSet}</StatusBadge> : <span className="font-black">{number.format(value)}</span>}
                    </td>
                    <td className="px-2 py-3 text-xs text-[#667085]">{value === null ? t.settingUnset[key] : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </OperationsPanel>
      <OperationsPanel title={t.limitsContract}>
        <table className="w-full min-w-[24rem] border-collapse text-start text-sm">
          <caption className="sr-only">{t.limitsContract}</caption>
          <tbody>
            {contract.map(([label, value]) => (
              <tr key={label} className="border-b border-[#F2F4F7]">
                <th scope="row" className="px-2 py-2 text-start font-semibold text-[#344054]">{label}</th>
                <td className="px-2 py-2 font-black">{number.format(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </OperationsPanel>
    </div>
  );
}

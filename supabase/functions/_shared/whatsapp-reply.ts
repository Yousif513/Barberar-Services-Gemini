// Reply composer for the WhatsApp receptionist: Arabic and English templates, filled only with facts the caller read from the database.
// Pure. Dates and times are shown in Asia/Riyadh with Western digits (the way Saudi customers type them) and am/pm in the customer's language.
// A reply never states a price, an opening hour or an address that was not passed in: when a fact is missing the template says a person will answer.

import type { Locale } from "./whatsapp-intent.ts"

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const pick = (locale: Locale, ar: string, en: string): string => (locale === "ar" ? ar : en)

/** "الجمعة 9 أكتوبر" / "Friday 9 October" for a YYYY-MM-DD date. */
export function dateLabel(ymd: string, locale: Locale): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return locale === "ar" ? `${AR_DAYS[dow]} ${d} ${AR_MONTHS[m - 1]}` : `${EN_DAYS[dow]} ${d} ${EN_MONTHS[m - 1]}`
}

export function weekdayLabel(ymd: string, locale: Locale): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return locale === "ar" ? AR_DAYS[dow] : EN_DAYS[dow]
}

/** "4:30 م" / "4:30 PM" for minutes after midnight; 1440 or more is the next day ("12:30 ص"). */
export function timeLabel(minutes: number, locale: Locale): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour24 = Math.floor(total / 60)
  const minute = total % 60
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const suffix = hour24 < 12 ? pick(locale, "ص", "AM") : pick(locale, "م", "PM")
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`
}

export function priceLabel(price: number | string, locale: Locale): string {
  const value = Number(price)
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return locale === "ar" ? `${text} ر.س` : `SAR ${text}`
}

export interface NamedService { name_ar: string; name_en: string }
export const nameOf = (item: NamedService, locale: Locale): string => (locale === "ar" ? item.name_ar : item.name_en)

const bullets = (lines: string[]): string => lines.map((line) => `• ${line}`).join("\n")

export const replies = {
  greeting(locale: Locale, businessName: string): string {
    return pick(locale,
      `أهلاً بك في ${businessName}. أنا المساعد الآلي للحجز. اكتب الخدمة واليوم، مثلاً: أبغى حجز قص شعر بكرة العصر. أو اسأل عن الأسعار، المواعيد، الموقع أو ساعات الدوام. ولو تبغى موظف اكتب: موظف.`,
      `Welcome to ${businessName}. I am the booking assistant. Tell me the service and the day, for example: book a haircut tomorrow afternoon. You can also ask about prices, times, location or opening hours. To talk to a person, write: agent.`)
  },
  welcomeBack(locale: Locale, businessName: string): string {
    return pick(locale, `أهلاً بك من جديد في ${businessName}. كيف نقدر نخدمك؟`, `Welcome back to ${businessName}. How can we help?`)
  },
  thanks(locale: Locale): string {
    return pick(locale, "العفو، يسعدنا خدمتك. اكتب لنا متى احتجت.", "You are welcome. Write to us any time.")
  },
  askService(locale: Locale, services: NamedService[], hasMore: boolean): string {
    return pick(locale,
      `أي خدمة تبغى؟\n${bullets(services.map((s) => s.name_ar))}${hasMore ? "\nواكتب اسم الخدمة التي تريدها." : ""}`,
      `Which service would you like?\n${bullets(services.map((s) => s.name_en))}${hasMore ? "\nWrite the name of the service you want." : ""}`)
  },
  chooseService(locale: Locale, services: NamedService[]): string {
    return pick(locale, `قصدك أي واحدة من هذه؟\n${bullets(services.map((s) => s.name_ar))}`, `Which of these do you mean?\n${bullets(services.map((s) => s.name_en))}`)
  },
  offer(locale: Locale, input: {
    businessName: string
    serviceName: string
    ymd: string
    requestedYmd: string | null
    options: { time: string; branch: string | null }[]
    periodMissed: boolean
    link: string | null
  }): string {
    const lines = input.options.map((o) => (o.branch ? `${o.time} (${o.branch})` : o.time))
    const shifted = input.requestedYmd && input.requestedYmd !== input.ymd
    const lead = shifted
      ? pick(locale, `ما عندنا مواعيد متاحة يوم ${dateLabel(input.requestedYmd as string, locale)}. أقرب يوم متاح هو ${dateLabel(input.ymd, locale)}:`,
        `We have no free times on ${dateLabel(input.requestedYmd as string, locale)}. The nearest day with free times is ${dateLabel(input.ymd, locale)}:`)
      : input.periodMissed
        ? pick(locale, `ما عندنا مواعيد في الوقت اللي طلبته يوم ${dateLabel(input.ymd, locale)}. هذه أقرب المتاح:`,
          `Nothing is free at the time you asked for on ${dateLabel(input.ymd, locale)}. The nearest free times:`)
        : pick(locale, `مواعيد متاحة لخدمة ${input.serviceName} يوم ${dateLabel(input.ymd, locale)}:`,
          `Free times for ${input.serviceName} on ${dateLabel(input.ymd, locale)}:`)
    const serviceLine = shifted || input.periodMissed ? pick(locale, `الخدمة: ${input.serviceName}\n`, `Service: ${input.serviceName}\n`) : ""
    const tail = input.link
      ? pick(locale, `لحجز أحد هذه المواعيد والدفع أكمل من هنا (الحجز يتم من الموقع وليس من المحادثة):\n${input.link}`,
        `To book one of these and pay, continue here (booking is completed on the website, not in this chat):\n${input.link}`)
      : pick(locale, "سيتواصل معك أحد موظفينا لإكمال الحجز.", "A member of our team will follow up with you to complete the booking.")
    return `${lead}\n${serviceLine}${bullets(lines)}\n${tail}`
  },
  nothingAvailable(locale: Locale, serviceName: string, days: number, link: string | null): string {
    const base = pick(locale,
      `ما لقيت مواعيد متاحة لخدمة ${serviceName} خلال ${days} أيام القادمة.`,
      `I found no free times for ${serviceName} in the next ${days} days.`)
    const tail = link
      ? pick(locale, `تقدر تشوف المواعيد وتحجز من هنا:\n${link}`, `You can check times and book here:\n${link}`)
      : pick(locale, "سيتواصل معك أحد موظفينا قريباً.", "A member of our team will follow up with you.")
    return `${base}\n${tail}`
  },
  prices(locale: Locale, items: { service: NamedService; price: number | string | null }[], more: boolean): string {
    const lines = items.map((i) => (i.price === null || i.price === undefined || Number.isNaN(Number(i.price))
      ? `${nameOf(i.service, locale)}: ${pick(locale, "سيجيبك أحد موظفينا", "a person will tell you")}`
      : `${nameOf(i.service, locale)}: ${priceLabel(i.price, locale)}`))
    return `${pick(locale, "الأسعار (السعر الأساسي للخدمة، وقد يختلف حسب الأخصائي):", "Prices (the base price of the service; it can differ by professional):")}\n${bullets(lines)}${
      more ? pick(locale, "\nاكتب اسم خدمة معينة لأعطيك سعرها.", "\nWrite a service name for its price.") : ""}`
  },
  noServices(locale: Locale): string {
    return pick(locale, "ما عندي قائمة خدمات أعرضها الحين. سيجيبك أحد موظفينا.", "I have no service list to show right now. A member of our team will answer you.")
  },
  hours(locale: Locale, blocks: { branch: string | null; lines: string[] }[]): string {
    const body = blocks.map((b) => (b.branch ? `${b.branch}\n${bullets(b.lines)}` : bullets(b.lines))).join("\n")
    return `${pick(locale, "ساعات الدوام للأيام السبعة القادمة:", "Opening hours for the next seven days:")}\n${body}`
  },
  closedLabel: (locale: Locale): string => pick(locale, "مغلق", "closed"),
  nextDayMark: (locale: Locale): string => pick(locale, " (بعد منتصف الليل)", " (after midnight)"),
  hoursUnknown(locale: Locale): string {
    return pick(locale, "ما عندي ساعات الدوام مسجلة. سيجيبك أحد موظفينا.", "I do not have the opening hours on record. A member of our team will answer you.")
  },
  location(locale: Locale, items: { branch: string | null; address: string | null; mapUrl: string | null }[]): string {
    const lines = items.map((i) => [i.branch, i.address, i.mapUrl].filter((x): x is string => Boolean(x)).join(" - "))
    return `${pick(locale, "موقعنا:", "Our location:")}\n${bullets(lines)}`
  },
  locationUnknown(locale: Locale): string {
    return pick(locale, "ما عندي عنوان مسجل. سيجيبك أحد موظفينا.", "I do not have an address on record. A member of our team will answer you.")
  },
  cancelHelp(locale: Locale, link: string | null): string {
    return link
      ? pick(locale, `لإلغاء موعدك أو تغييره ادخل على حجوزاتك من هنا:\n${link}\nوسيتواصل معك أحد موظفينا لو احتجت مساعدة.`,
        `To cancel or change your appointment open your bookings here:\n${link}\nA member of our team will follow up if you need help.`)
      : pick(locale, "سيتواصل معك أحد موظفينا لمساعدتك في إلغاء الموعد أو تغييره.", "A member of our team will contact you to help cancel or change your appointment.")
  },
  handoff(locale: Locale): string {
    return pick(locale, "تم تحويل محادثتك إلى أحد موظفينا وسيرد عليك قريباً.", "Your conversation was passed to a member of our team, who will reply soon.")
  },
  handoffUnavailable(locale: Locale): string {
    return pick(locale, "للأسف التحويل لموظف غير متاح حالياً. اكتب الخدمة واليوم وأعرض لك المواعيد المتاحة.", "Transfer to a person is not available right now. Tell me the service and the day and I will show you the free times.")
  },
  notBookable(locale: Locale): string {
    return pick(locale, "الحجز عبر الواتساب غير متاح حالياً. سيجيبك أحد موظفينا.", "Booking over WhatsApp is not available right now. A member of our team will answer you.")
  },
  dateProblem(locale: Locale, kind: "past" | "invalid"): string {
    return kind === "past"
      ? pick(locale, "هذا التاريخ مضى. أي يوم تبغى؟ مثلاً: بكرة أو الجمعة.", "That date has passed. Which day would you like? For example: tomorrow or Friday.")
      : pick(locale, "ما فهمت هذا التاريخ. اكتب اليوم بصيغة مثل: بكرة، الجمعة، أو 12/10.", "I could not read that date. Write the day like: tomorrow, Friday, or 12/10.")
  },
  fallback(locale: Locale): string {
    return pick(locale,
      "ما فهمت طلبك تماماً. اكتب الخدمة واليوم، مثلاً: قص شعر بكرة العصر. أو اكتب: الأسعار، المواعيد، الموقع، الدوام، أو موظف.",
      "I did not quite understand. Tell me the service and the day, for example: haircut tomorrow afternoon. Or write: prices, times, location, hours, or agent.")
  },
}

// Request bodies for the WhatsApp Cloud API messages endpoint (POST /{version}/{phone-number-id}/messages). Pure.
// A template message is the approved-template path the booking notifications use; a text message is a free-form reply, which Meta only
// accepts inside the customer-service window that opens when the customer writes (the database enforces our configured window first).

export interface TemplateRequest {
  to: string
  template: string
  language: string
  body_params?: string[]
}

export interface TextRequest {
  to: string
  text: string
}

const digitsOnly = (value: string): string => String(value).replace(/^\+/, "")

export function buildTemplateBody(message: TemplateRequest): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to: digitsOnly(message.to),
    type: "template",
    template: {
      name: message.template,
      language: { code: message.language },
      components: message.body_params?.length
        ? [{ type: "body", parameters: message.body_params.map((text) => ({ type: "text", text: String(text) })) }]
        : [],
    },
  }
}

export function buildTextBody(message: TextRequest): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digitsOnly(message.to),
    type: "text",
    text: { preview_url: true, body: message.text },
  }
}

/** The WhatsApp message id from a successful response, or null (a message is only recorded as sent with this id). */
export function extractMessageId(result: unknown): string | null {
  const messages = (result as { messages?: unknown })?.messages
  if (!Array.isArray(messages)) return null
  const id = (messages[0] as { id?: unknown } | undefined)?.id
  return typeof id === "string" && id.length > 0 ? id : null
}

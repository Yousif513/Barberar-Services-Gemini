# Regional audition readiness and observed results

Prepared 22 October 2026. **Scripts are prepared; Saudi/Lebanese audio generation and listening evaluation are pending.** No regional audition is accepted or connected to an active company employee.

| Evaluation | Observed result |
|---|---|
| Original roster and current accent direction | 15 proposed personas: 6 Saudi male and 9 Lebanese female; see AUDITION_INPUT.json |
| New regional audio generated | **0**; no TTS synthesis request submitted |
| Naturalness and regional authenticity | Not evaluated; needs actual audio and Saudi/Lebanese native listeners |
| Distinct identity | Not evaluated; the two proposed regional stock voices provide two base timbres, not 15 verified identities |
| Names, numbers, SAR, dates and refund terminology | Test scripts/lexicon prepared; pronunciation not evaluated |
| Arabic/English switching | Test scripts prepared; actual mixed-language pronunciation and identity continuity unverified |
| Blind same-script speaker test | Protocol/forms prepared; no listener results collected |
| Native script approval or CEO voice selection | Pending; no selected voice is implied by a script or provider candidate |
| Existing audio | 15 US-English offline previews retained, not reclassified as Saudi/Lebanese auditions |

## Why audio is pending

The installed offline engines are US-English David/Zira. The connected Hermes speech tool currently uses `edge` with `en-US-AriaNeural`; its voice/provider are user-configured. Calling that tool as configured would produce the wrong candidate. No local configuration was changed.

The proposed official Azure API has named regional candidates (`ar-SA-HamedNeural`, `ar-LB-LaylaNeural`). No authorized named Speech resource/environment, applicable account terms and capped new-paid-service approval have been established for this task. The root environment lacks the checked Azure Speech credential variables; that is not a claim about every other credential store. Do not post a key in chat. Once the named integration is approved, use secure, development-scoped credential setup.

Microsoft's current terms expressly scope prebuilt output-use rights to paid-tier customers. A free quota or an unauthenticated consumer voice endpoint is not a licence receipt for the intended assets. [Current terms](https://www.microsoft.com/licensing/terms/en-US/product/MicrosoftAzure/all). These exact stock voices are non-multilingual; SSML language switching cannot be assumed to work. [Voice/language documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice).

## Costed, bounded next synthesis pass — proposed only

The official retail API returned **USD15 per million standard neural characters** in East US and UAE North. At the SAMA reference conversion of 3.75, this is **SAR56.25 per million**, before tax, bank charges or other services. This is public retail evidence, not a tenant quotation. Preserve the raw [price responses and receipt](../../../.admin-console/evidence/volabi-first-loop/voice-provider-research/receipt.json) and confirm the actual resource meter before use. [API documentation](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [SAMA exchange rate](https://www.sama.gov.sa/ar-SA/Currency/FinExc/Pages/Currency.aspx).

Proposed generation ceiling: **100,000 characters aggregate across all rounds, anchors and retries, up to 3 rounds, maximum SAR10 total speech charges**, including any applicable tax/fees. The retail synthesis component at the character ceiling is USD1.50 / SAR5.625 before exclusions. This ceiling is an authorization request, not money already approved or spent. It excludes native reviewer fees, translation, customer research, custom voices, avatars and new ongoing subscriptions. Obtain separate quotes before any such commitment.

The prepared role samples contain 11,403 Unicode text characters; all five common blind passages for all15 add 13,587. Three complete text rounds total 74,970 characters: approximately **SAR4.22** of retail synthesis before exclusions. This is a text-count estimate, not a billable-usage receipt, and excludes extra anchor clips and additional corrections. Retain the 100,000-character/SAR10 ceiling rather than promising an exact charge. Start with representative Saudi male and Lebanese female tests including English and numbers. If a candidate cannot meet the required accent, identity or bilingual gate, record the failure; do not silently change the accent, speaker or provider. Render the remaining role variants only within the approved allowance. All 15 need individual evaluation. Prosody variants of two stock voices may fail the blind identity test; if so, return with a separately costed licensed voice/talent shortlist. Do not buy more services automatically.

## What reviewers must hear

Use the prepared native-speaker rubric and same-script blind test. Separate native authenticity, comprehensibility, character delivery, distinct identity and code-switching. Financial numbers, dates, names and authorization words must be heard accurately. A natural-sounding voice that changes an amount or presents a proposed refund as completed fails. Record actual reviewer identity/language qualification, candidate ID, model/voice/settings, audio hash, version, scores and defects. No machine-only transcript or voice-locale label substitutes for native listening.

Keep captions/text available. Interruption and live meeting latency need a later runtime test; a static recording cannot prove either. A voiced decision never substitutes for authenticated, scoped approval. Meeting participation, recording, invitations, employee activation, business permissions and financial execution remain held.

## Next step and ready-to-send prompt

Review the rollout, scripts and proposed allowance. Audio generation needs your explicit new-paid-service exception because that hold is still in force.

> Approve one development-only Azure Speech audition pass for the 15 proposed management agents, using fictional scripts only, up to 100,000 characters aggregate across every role sample, blind trial, anchor and retry and at most three rounds, with total speech charges capped at SAR10 including applicable fees. Confirm the named account, environment, region and actual price before synthesis, then request credentials securely. Preserve Saudi male and Lebanese female accents. Produce the audio and evaluation packet; obtain separate approval for paid native reviews or additional voice services. Keep every other production, business activation, permission, external business-write and financial hold.

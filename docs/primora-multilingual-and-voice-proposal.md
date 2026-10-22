# PRIMORA multilingual rollout and Volabi voice auditions

Prepared 22 October 2026. Status: proposal and audition preparation; no customer-language release or management-voice selection is approved by this document.

Start with the [multilingual rollout proposal](../planning/primora-multilingual/PROPOSAL.md) and [15-agent audition package](../planning/volabi/voice-auditions/README.md). Provider findings and the exact synthesis dependency are recorded in [provider-report.json](../planning/volabi/voice-auditions/provider-report.json); actual generation and evaluation status is in [RESULTS.md](../planning/volabi/voice-auditions/RESULTS.md).

## Recommendation for the CEO

Pilot **Bangla, Urdu and Hindi as three separate customer languages**, alongside the existing Arabic/English experience, across the full booking and support journey. Let customers choose their language; nationality, country code and browser settings are not proof of language preference. Pilot quality and demand should determine expansion. Plan German and French as later, separately measured releases.

The competitive opportunity is a journey customers can complete and understand: service selection, provider/staff/time choice, payment and confirmation, reminders, changes, completion, support, complaints and refunds. A translated landing page alone will not establish that advantage. Validate demand and economics with actual customers rather than assuming language population equals paying demand.

Management voices retain the CEO's direction: **Saudi male voices for Adam, Alexander, Ethan, Daniel, Omar and Rayan; Lebanese female voices for Nora, Sarah, Victoria, Emma, Maya, Sophia, Layla, Olivia and Lina**. Customer-language support does not change their management identities, accents or authorities.

## What this package establishes

| Area | Prepared here | Acceptance still required |
|---|---|---|
| Customer languages | Phased scope, booking/support requirements, quality gates, measurement and cost model | Local implementation approval; native-speaker evidence; later release approval |
| Agent voices | Source-linked scripts and delivery directions for all 15, pronunciation cases, blind identity test and evaluator forms | Provider access, permitted usage and budget; actual synthesis; listening/native-speaker scores; CEO voice selection |
| Roles and skills | Proposed responsibility and verified capability gaps | Demonstrated language competence and any eventual business activation/permissions |
| Commercial rules | Existing first-acquisition/repeat and refund controls retained as dependencies | The existing unresolved commercial/provider evidence; no numerical rule is adopted here |

Prepared text is not an audio audition. Existing 15 US-English WAV previews remain legacy delivery samples and do not satisfy the Saudi/Lebanese requirement. No naturalness, accent, speaker-identity or code-switching score may be marked passed until reviewers hear the generated candidates. Availability of a provider locale also does not prove that quality.

## Technical decision and dependency

Use the **official Azure paid-tier prebuilt Speech API as the first proposed regional-accent baseline**, subject to a named account, region, applicable terms and a bounded audition allowance. Its catalogue lists `ar-SA-HamedNeural` and `ar-LB-LaylaNeural`; this gives two stock base identities. Rate, pitch and role-specific writing can differentiate delivery but do not establish 15 unique timbres. Distinct identity must be tested without names or role clues. If stock voices fail, prepare a separate costed shortlist of appropriately licensed voices/talent before any additional service commitment. [Voice catalogue](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts).

These two voices are not documented as multilingual voices. Keep the same base voice during the mixed-language audition to expose its actual English pronunciation; do not silently switch to another English speaker. Multilingual SSML language switching is not supported for non-multilingual voices. [SSML documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice).

The current Microsoft terms expressly grant prebuilt TTS output-use rights to paid-tier customers. A free character allowance alone does not establish the required output rights. Confirm the agreement applying to the actual account before reuse or distribution. No account was created or upgraded for this package. [Microsoft Product Terms](https://www.microsoft.com/licensing/terms/en-US/product/MicrosoftAzure/all).

The requested voice budget is a **proposed one-time SAR10 ceiling**, with a 100,000-character aggregate limit across all rounds, anchors and retries and up to three rounds. The prepared text workload estimates about SAR4.22 of standard synthesis before taxes/fees, extra anchors and human review; no money has been spent. Translation, native-speaker fees and customer testing still need actual quotes. See RESULTS.md for the exact assumptions and approval prompt.

No voice cloning, external meetings, recording, stakeholder invitations or live conversation service is enabled. In a later implementation, captions/text, interruption handling, uncertain number confirmation, permission-aware meeting material and authenticated decision records remain mandatory. Spoken approval alone must not authorize a refund or business action.

## Holds and real missing decisions

Production deployment/merges, business-employee activation, business permission grants, external business writes, financial transactions and new paid services remain on hold. Proposed owners are inactive management identities; development workers do not acquire their business authority.

This proposal changes no prices, acquisition rules, commission rates, refund thresholds or settlement allocation. The existing finance/refund decision and evidence queue remains in [the finance gap report](volabi-finance-refund-gaps.md), including precise commercial terms, the acquisition relationship/event, reversal allocation and licensed-provider acceptance. Adopted conditional governance decisions are not reopened. Translations must preserve approved policy and distinguish requested, recommended, approved, submitted, pending and actually completed refunds.

The concrete dependency for audio generation is a permitted named speech account and capped spending authorization. Native-speaker recruitment, translation and review prices also require actual quotes before a paid commitment. Technical provider selection and routine reversible preparation are handled by the development team; no secrets should be posted into chat.

## Next step and ready-to-send prompt

Review the detailed proposal and audition preparation. The next development step is a local three-language booking/support slice with actual native-speaker validation; regional audio generation additionally needs the separately scoped provider/account and budget approval described in the audition results.

> Proceed with the proposed local Bangla, Urdu and Hindi booking/support pilot. Keep German and French planned for later. Preserve the Saudi male and Lebanese female management voices. Present the named speech-account setup and final capped audition quote for approval before any paid synthesis. Keep all other existing holds.

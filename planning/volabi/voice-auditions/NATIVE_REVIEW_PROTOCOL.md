# Native review and blind identity protocol

Status: proposed evaluation protocol; no reviewer has been sourced, contacted, appointed or paid by this package. Every score remains blank. This is not a native-language endorsement of the scripts.

## Source the panel without inventing acceptance

Prepare a shortlist of at least three independent adult first-language Saudi Arabic reviewers and three independent adult first-language Lebanese Arabic reviewers. They should regularly use the relevant dialect, understand professional Arabic/English switching, and have no financial incentive tied to a particular voice passing. Seek at least one person experienced in phonetics/voice direction and one ordinary professional listener per group; record actual experience without inventing credentials. Allow overlap only where genuine first-language/dialect competence is documented; do not manufacture six people from reviewer slots.

Record self-described regional/dialect background and current familiarity. Saudi and Lebanese speech have real internal variation; broad national labels do not select a city, subvariety, social identity or nationality biography for an AI persona. Ask the panel to agree a natural professional target range before rating; preserve the CEO's national accent requirement. A specific contested regional direction remains explicit rather than being silently guessed. Prefer naturalness over exaggerated dialect tokens.

Actual outreach, personal-data collection, recording or payment follows the existing authorized channel, applicable notice and current holds. This protocol authorizes none of them. Do not send invitations or buy a service. Prepare the reviewer brief and scoped data requirements for the already authorized coordinator. Use nonpersonal fixture scripts only; no customer/company/private-office data is sent to a TTS provider or reviewer.

## Text calibration first

Give reviewers the role/character brief, requested accent, exact script revision and unapproved pronunciation targets. Review colloquial naturalness, gendered phrasing, names, loanwords, finance terminology, meaning, number reading and cultural neutrality. Preserve independent comments; log each actual correction and its reason. A changed script gets a new hash and invalidates old audio evaluation for that text. No invented IPA or automatic replacement from the provisional lexicon is accepted as expert guidance.

## Listen and record actual observations

Use the same documented normal-volume playback setup, then repeat on an ordinary phone speaker if permitted. No speed manipulation or hidden effects during rating. Each listener gets at most two listens for the material transcription task before seeing the transcript. Record audio hash, script hash, candidate configuration, date, listener, timecodes and verbatim transcription. Separate a technical delivery fault from regional accent, meaning, and identity judgments. Blank cells mean not evaluated, never zero or pass. Missing listeners/criteria prevent a weighted score. Retain failed takes and changes; do not average a catastrophic number error away.

## Blind identity design

Role passages and self-introductions are excluded: knowing that a clip says finance is not recognizing Daniel's timbre. Use the five identical-content passages for that accent group in AUDITION_INPUT.json. Render each with the actual candidate configuration; the supplied blind SSML is trial one only. All candidate voices in a group must speak the same words in the same trial. No speaker name, role, person-labelled filename, provider ID or metadata reaches the listener. Strip identifying audio metadata on a separate derivative; retain the original hash and derivative mapping. Do not alter pitch/rate to hide a known failure.

First provide labelled anchor clips from separate text to familiarize each listener. Then present five held-out trials per persona in balanced randomized order, avoiding adjacent duplicate identities. The coordinator retains the opaque-code key and randomization seed privately until ratings are locked; the evaluation sheet has no prefilled identity key. Do not pre-populate invented clip codes or pretend audio exists. Score all15 decisions per persona (5trials ×3listeners). Require at least12correct per persona and retain the full within-accent confusion matrix. Any candidate pair confused in more than20percent of the30directional opportunities (15each) is held together for revision. Two base timbres and small prosody shifts are a baseline hypothesis, not evidence of fifteen distinguishable voices.

## Gates, independence and escalation

Apply G0–G5 from EVALUATION_RUBRIC.json in order for offline auditions. G6 is separately held until a real, authorized interaction runtime exists; prerecorded interruption text cannot pass it. Synthesizer/implementer does not independently accept its own audio. If panel disagreement remains, preserve it and seek an independent qualified review instead of discarding the dissent. A failing accent, material number or identity is a hold/revision, not a renamed pass. Do not lower thresholds after hearing weak candidates.

Passing offline audition gates accepts only those versioned candidate clips for that test context. It does not license a provider, select a paid plan, authorize production, activate a company employee, grant data/tools, permit live meetings, or certify live bilingual conversation. Root-owned provider-report.json and RESULTS.md report actual generation/listening status separately.

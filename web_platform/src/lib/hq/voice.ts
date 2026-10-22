export function localVoiceChoices<T extends {localService: boolean; lang: string}>(voices: T[], locale: "ar" | "en"): T[] {
  return voices.filter(voice => voice.localService === true && voice.lang.toLowerCase().split(/[-_]/)[0] === locale);
}
export function speakLocally(synthesis: Pick<SpeechSynthesis,"getVoices" | "speak" | "cancel">, Utterance: new(text: string) => SpeechSynthesisUtterance, voice: SpeechSynthesisVoice, text: string, options: {rate?: number; pitch?: number} = {}) {
  const installed = synthesis.getVoices().find(candidate => candidate.voiceURI === voice.voiceURI && candidate.localService === true);
  if (voice.localService !== true || !installed || !text.trim()) throw new Error("local_voice_unavailable");
  const utterance = new Utterance(text);
  utterance.voice = installed;
  utterance.lang = installed.lang;
  utterance.rate = Math.max(0.5, Math.min(1.5, options.rate ?? 1));
  utterance.pitch = Math.max(0.5, Math.min(1.5, options.pitch ?? 1));
  synthesis.cancel(); synthesis.speak(utterance);
}
export interface LocalRecognition { processLocally: boolean; lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void; }
export interface LocalRecognitionConstructor { new(): LocalRecognition; available?: (options: {langs: string[]; processLocally: true}) => Promise<string>; }
export async function createLocalRecognizer(Recognition: LocalRecognitionConstructor | undefined, locale: "ar" | "en"): Promise<LocalRecognition> {
  const lang = locale === "ar" ? "ar-SA" : "en-US";
  if (!Recognition || typeof Recognition.available !== "function" || await Recognition.available({langs:[lang],processLocally:true}) !== "available") throw new Error("local_dictation_unavailable");
  const recognition = new Recognition();
  if (!("processLocally" in recognition)) throw new Error("local_dictation_unavailable");
  recognition.processLocally = true;
  if (recognition.processLocally !== true) throw new Error("local_dictation_unavailable");
  recognition.lang = lang; recognition.continuous = false; recognition.interimResults = false;
  return recognition;
}

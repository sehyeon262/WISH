type SpeakFeedbackOptions = {
  lang?: string
  rate?: number
  pitch?: number
  volume?: number
}

const DEFAULT_FEEDBACK_LANG = 'ko-KR'

function getSpeechSynthesis() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null
  }

  return window.speechSynthesis
}

function getFeedbackVoice(speechSynthesis: SpeechSynthesis, lang: string) {
  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return null

  const language = lang.toLowerCase()
  const baseLanguage = language.split('-')[0]

  return (
    voices.find(voice => voice.lang.toLowerCase() === language) ??
    voices.find(voice => voice.lang.toLowerCase().startsWith(baseLanguage)) ??
    null
  )
}

export function speakFeedback(text: string, options: SpeakFeedbackOptions = {}) {
  const normalizedText = text.trim()
  if (!normalizedText) return

  const speechSynthesis = getSpeechSynthesis()
  if (!speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    console.warn('[feedbackTts] Web Speech API is not available in this browser.')
    return
  }

  speechSynthesis.cancel()

  const lang = options.lang ?? DEFAULT_FEEDBACK_LANG
  const utterance = new SpeechSynthesisUtterance(normalizedText)
  const voice = getFeedbackVoice(speechSynthesis, lang)

  utterance.lang = lang
  if (voice) {
    utterance.voice = voice
  }
  utterance.rate = options.rate ?? 1
  utterance.pitch = options.pitch ?? 1
  utterance.volume = options.volume ?? 1
  utterance.onerror = event => {
    console.warn('[feedbackTts] Failed to speak feedback.', event.error)
  }

  try {
    speechSynthesis.speak(utterance)
  } catch (error) {
    console.warn('[feedbackTts] Failed to start feedback speech.', error)
  }
}

export function stopFeedbackSpeech() {
  const speechSynthesis = getSpeechSynthesis()
  if (!speechSynthesis) return

  speechSynthesis.cancel()
}

export const languageOptions = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'cs', label: 'Czech' },
  { code: 'el', label: 'Greek' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'ro', label: 'Romanian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
] as const

export type LanguageCode = (typeof languageOptions)[number]['code']

export const defaultSourceLanguage: LanguageCode = 'en'
export const defaultTargetLanguage: LanguageCode = 'es'

export function isLanguageCode(value: string): value is LanguageCode {
  return languageOptions.some((language) => language.code === value)
}

export interface PrimitiveTranslationBlock {
  id: string
  sourceSentence: string
  translatedSentence: string
  sourceTokens: string[]
  translatedTokens: string[]
}

interface TranslatePrimitiveTextResult {
  blocks: PrimitiveTranslationBlock[]
  totalTokens: number
}

interface WordAffixes {
  leading: string
  core: string
  trailing: string
}

interface TranslationProvider {
  translateWord(
    word: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
  ): Promise<string>
}

const translationCache = new Map<string, string>()
const pendingRequests = new Map<string, Promise<string>>()

function createProvider(): TranslationProvider {
  return {
    async translateWord(word, sourceLanguage, targetLanguage) {
      const requestUrl = new URL('https://translate.googleapis.com/translate_a/single')
      requestUrl.searchParams.set('client', 'gtx')
      requestUrl.searchParams.set('sl', sourceLanguage)
      requestUrl.searchParams.set('tl', targetLanguage)
      requestUrl.searchParams.set('dt', 't')
      requestUrl.searchParams.set('q', word)

      const response = await fetch(requestUrl.toString())
      if (!response.ok) {
        throw new Error('The translation service responded with an error.')
      }

      // Google Translate returns a nested array. The first element is an array
      // of translation segments; each segment's first item is the translated text.
      const payload = (await response.json()) as any
      const segments = Array.isArray(payload) && Array.isArray(payload[0]) ? payload[0] : null

      if (!segments) {
        return word
      }

      const translated = segments.map((seg: any) => (Array.isArray(seg) ? seg[0] : '')).join('')
      return (translated || word).trim()
    },
  }
}

function normalizeText(inputText: string): string {
  return inputText.replace(/\s+/g, ' ').trim()
}

export function splitSentences(inputText: string): string[] {
  const normalizedText = normalizeText(inputText)
  if (!normalizedText) {
    return []
  }

  const sentenceMatches = normalizedText.match(/[^.!?]+[.!?]*/gu)
  return sentenceMatches?.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0) ?? [normalizedText]
}

export function tokenizeSentence(sentence: string): string[] {
  return sentence.split(/\s+/u).map((token) => token.trim()).filter((token) => token.length > 0)
}

function splitWordAffixes(token: string): WordAffixes {
  const leading = token.match(/^[^\p{L}\p{N}'’-]+/u)?.[0] ?? ''
  const trailing = token.match(/[^\p{L}\p{N}'’-]+$/u)?.[0] ?? ''
  const core = token.slice(leading.length, token.length - trailing.length)

  return {
    leading,
    core,
    trailing,
  }
}

async function translateCoreWord(
  token: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  provider: TranslationProvider,
): Promise<string> {
  const { leading, core, trailing } = splitWordAffixes(token)

  if (!core) {
    return token
  }
  const coreLower = core.toLowerCase()
  const cacheKey = `${sourceLanguage}|${targetLanguage}|${coreLower}`
  const cachedTranslation = translationCache.get(cacheKey)
  if (cachedTranslation) {
    return `${leading}${cachedTranslation}${trailing}`
  }

  const pendingTranslation = pendingRequests.get(cacheKey)
  if (pendingTranslation) {
    return `${leading}${(await pendingTranslation)}${trailing}`
  }

  const wasCapitalized = core[0] === core[0].toUpperCase()

  const request = provider
    .translateWord(coreLower, sourceLanguage, targetLanguage)
    .then((translatedWord) => {
      // normalize obvious all-caps responses and restore capitalization
      let normalized = translatedWord
      if (normalized === normalized.toUpperCase()) {
        normalized = normalized.toLowerCase()
      }

      if (wasCapitalized && normalized.length > 0) {
        normalized = normalized[0].toUpperCase() + normalized.slice(1)
      }

      translationCache.set(cacheKey, normalized)
      pendingRequests.delete(cacheKey)
      return normalized
    })
    .catch((error) => {
      pendingRequests.delete(cacheKey)
      throw error
    })

  pendingRequests.set(cacheKey, request)

  const translatedCoreWord = await request
  return `${leading}${translatedCoreWord}${trailing}`
}

async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  mapper: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
}

export async function translatePrimitiveText(
  inputText: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  onProgress?: (completed: number, total: number) => void,
): Promise<TranslatePrimitiveTextResult> {
  const provider = createProvider()
  const sentences = splitSentences(inputText)
  const totalTokens = sentences.reduce(
    (total, sentence) => total + tokenizeSentence(sentence).length,
    0,
  )

  let completedTokens = 0
  const blocks = await Promise.all(
    sentences.map(async (sentence, sentenceIndex) => {
      const sourceTokens = tokenizeSentence(sentence)
      const translatedTokens = await mapWithConcurrency(sourceTokens, 4, async (token) => {
        const translatedWord = await translateCoreWord(
          token,
          sourceLanguage,
          targetLanguage,
          provider,
        )

        completedTokens += 1
        onProgress?.(completedTokens, totalTokens)

        return translatedWord
      })

      return {
        id: `${sentenceIndex}-${sentence}`,
        sourceSentence: sentence,
        translatedSentence: translatedTokens.join(' '),
        sourceTokens,
        translatedTokens,
      }
    }),
  )

  return {
    blocks,
    totalTokens,
  }
}
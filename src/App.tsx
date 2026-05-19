import { useEffect, useRef, useState } from 'react'
import './App.css'
import { TranslationPreview } from './components/TranslationPreview'
import { downloadPrimitiveTranslationDocx } from './lib/docxExport'
import {
  defaultSourceLanguage,
  defaultTargetLanguage,
  isLanguageCode,
  languageOptions,
  type LanguageCode,
  type PrimitiveTranslationBlock,
  translatePrimitiveText,
} from './lib/primitiveTranslation'

const STORAGE_KEY = 'primitive-translator:draft'

type Draft = {
  sourceText: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
}

function loadDraft(): Draft {
  if (typeof window === 'undefined') {
    return {
      sourceText: '',
      sourceLanguage: defaultSourceLanguage,
      targetLanguage: defaultTargetLanguage,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    if (!rawValue) {
      return {
        sourceText: '',
        sourceLanguage: defaultSourceLanguage,
        targetLanguage: defaultTargetLanguage,
      }
    }

    const parsedValue = JSON.parse(rawValue) as Partial<Record<keyof Draft, string>>

    return {
      sourceText: typeof parsedValue.sourceText === 'string' ? parsedValue.sourceText : '',
      sourceLanguage:
        typeof parsedValue.sourceLanguage === 'string' && isLanguageCode(parsedValue.sourceLanguage)
          ? parsedValue.sourceLanguage
          : defaultSourceLanguage,
      targetLanguage:
        typeof parsedValue.targetLanguage === 'string' && isLanguageCode(parsedValue.targetLanguage)
          ? parsedValue.targetLanguage
          : defaultTargetLanguage,
    }
  } catch {
    return {
      sourceText: '',
      sourceLanguage: defaultSourceLanguage,
      targetLanguage: defaultTargetLanguage,
    }
  }
}

function App() {
  const [sourceText, setSourceText] = useState(() => loadDraft().sourceText)
  const [sourceLanguage, setSourceLanguage] = useState(() => loadDraft().sourceLanguage)
  const [targetLanguage, setTargetLanguage] = useState(() => loadDraft().targetLanguage)
  const [blocks, setBlocks] = useState<PrimitiveTranslationBlock[]>([])
  const [isTranslating, setIsTranslating] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    'Write a few sentences, choose languages, and translate word by word.',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const runIdRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sourceText, sourceLanguage, targetLanguage }),
    )
  }, [sourceLanguage, sourceText, targetLanguage])

  const handleTranslate = async () => {
    const trimmedText = sourceText.trim()

    if (!trimmedText) {
      setErrorMessage('Enter one or more sentences before translating.')
      setStatusMessage('Waiting for source text.')
      return
    }

    if (sourceLanguage === targetLanguage) {
      setErrorMessage('Source and target languages must be different.')
      setStatusMessage('Choose two different languages.')
      return
    }

    const runId = runIdRef.current + 1
    runIdRef.current = runId

    setIsTranslating(true)
    setErrorMessage('')
    setStatusMessage('Translating token by token with a free browser API.')
    setProgress({ completed: 0, total: 0 })

    try {
      const translationResult = await translatePrimitiveText(
        trimmedText,
        sourceLanguage,
        targetLanguage,
        (completed, total) => {
          if (runIdRef.current === runId) {
            setProgress({ completed, total })
          }
        },
      )

      if (runIdRef.current !== runId) {
        return
      }

      setBlocks(translationResult.blocks)
      setStatusMessage(
        `Translated ${translationResult.blocks.length} sentence${
          translationResult.blocks.length === 1 ? '' : 's'
        } using a primitive word-by-word pass.`,
      )
    } catch (error) {
      if (runIdRef.current !== runId) {
        return
      }

      const message = error instanceof Error ? error.message : 'Translation failed.'
      setErrorMessage(message)
      setStatusMessage('Translation failed. The previous result is still visible below.')
    } finally {
      if (runIdRef.current === runId) {
        setIsTranslating(false)
      }
    }
  }

  const handleDownload = async () => {
    if (!blocks.length) {
      return
    }

    await downloadPrimitiveTranslationDocx({
      blocks,
      sourceLanguage,
      targetLanguage,
    })
  }

  const progressLabel =
    progress.total > 0
      ? `${progress.completed}/${progress.total} words processed`
      : 'No translation requests running'

  const sourceLanguageLabel =
    languageOptions.find((option) => option.code === sourceLanguage)?.label ?? sourceLanguage
  const targetLanguageLabel =
    languageOptions.find((option) => option.code === targetLanguage)?.label ?? targetLanguage

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Primitive Translator</span>
          <h1>Build handouts that preserve sentence order and word order.</h1>
          <p>
            Split text into sentences, translate word by word in the same order, preview the
            result, and export a DOCX file for classroom use.
          </p>
        </div>

        <div className="hero-meta">
          <div>
            <span>Source</span>
            <strong>{sourceLanguageLabel}</strong>
          </div>
          <div>
            <span>Target</span>
            <strong>{targetLanguageLabel}</strong>
          </div>
          <div>
            <span>Progress</span>
            <strong>{progressLabel}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <form
          className="control-panel"
          onSubmit={(event) => {
            event.preventDefault()
            void handleTranslate()
          }}
        >
          <div className="field-group">
            <label htmlFor="source-text">Source sentences</label>
            <textarea
              id="source-text"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="The teacher opens the window. The students read the book!"
              rows={10}
            />
          </div>

          <div className="field-row">
            <label>
              <span>Source language</span>
              <select
                value={sourceLanguage}
                onChange={(event) => {
                  const nextValue = event.target.value
                  if (isLanguageCode(nextValue)) {
                    setSourceLanguage(nextValue)
                  }
                }}
              >
                {languageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Target language</span>
              <select
                value={targetLanguage}
                onChange={(event) => {
                  const nextValue = event.target.value
                  if (isLanguageCode(nextValue)) {
                    setTargetLanguage(nextValue)
                  }
                }}
              >
                {languageOptions.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="actions">
            <button type="submit" className="primary-button" disabled={isTranslating}>
              {isTranslating ? 'Translating…' : 'Translate'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleDownload()}
              disabled={!blocks.length || isTranslating}
            >
              Download DOCX
            </button>
          </div>

          <p className={`status-message ${errorMessage ? 'status-message--error' : ''}`}>
            {errorMessage || statusMessage}
          </p>

          <p className="support-note">
            The current build uses a free browser-callable translation API, so quality is
            intentionally primitive and best for classroom structure exercises.
          </p>
        </form>

        <section className="preview-panel" aria-live="polite">
          <div className="preview-header">
            <div>
              <span className="eyebrow">Preview</span>
              <h2>Aligned sentence blocks</h2>
            </div>
            <p>
              Source and translation are rendered below each other, with words kept in the same
              order.
            </p>
          </div>

          <TranslationPreview blocks={blocks} />
        </section>
      </section>
    </main>
  )
}

export default App

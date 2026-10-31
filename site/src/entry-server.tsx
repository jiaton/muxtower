import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { App } from './app'

/** The page as HTML, for `scripts/prerender.mjs`. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

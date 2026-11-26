import { describe, expect, it } from 'vitest'
import { uploadErrorText } from './files'

describe('uploadErrorText', () => {
  it('says a file is too large, by the limit the daemon gave, else its default', () => {
    expect(uploadErrorText(413, { detail: 'larger than 10 MB' })).toBe('Too large: over 10 MB')
    expect(uploadErrorText(413, { detail: 'too large', max_mb: 50 })).toBe('Too large: over 50 MB')
    expect(uploadErrorText(413, null)).toBe('Too large: over 25 MB')
  })
  it('gives a refusal’s reason as it is', () => {
    expect(uploadErrorText(409, { detail: 'this session takes pictures only' })).toBe('this session takes pictures only')
    expect(uploadErrorText(409, {})).toBe('Upload refused (409)')
  })
})

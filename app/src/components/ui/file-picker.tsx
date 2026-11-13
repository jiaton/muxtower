import { forwardRef, type InputHTMLAttributes } from 'react'

/** The system's file chooser, unseen: opened by another control (`ref.current.click()`), it hands over what
 *  was chosen. */
export const FilePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'hidden'>>(
  function FilePicker(props, ref) {
    return <input ref={ref} type="file" hidden {...props} />
  },
)

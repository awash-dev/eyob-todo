import type React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ion-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          name?: string
          size?: 'small' | 'large' | string
          color?: string
          src?: string
          ariaLabel?: string
          class?: string
        },
        HTMLElement
      >
    }
  }
}

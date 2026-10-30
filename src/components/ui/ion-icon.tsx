import React from 'react'

export interface IonIconProps extends React.HTMLAttributes<HTMLElement> {
  name: string
  size?: 'small' | 'large' | string
  color?: string
  className?: string
}

export const IonIcon: React.FC<IonIconProps> = ({
  name,
  className = '',
  size,
  color,
  ...props
}) => {
  return (
    <ion-icon
      name={name}
      class={className}
      size={size}
      color={color}
      {...props}
    />
  )
}

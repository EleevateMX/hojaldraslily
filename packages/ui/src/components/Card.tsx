import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-2xl shadow-sm border border-gray-100',
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow active:scale-95' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

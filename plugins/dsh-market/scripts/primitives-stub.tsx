/**
 * Test stub for the Host-provided UI primitives.
 *
 * The smoke test runs outside the Host, so the real package cannot be
 * resolved. The stub mirrors the real component structure closely enough to
 * exercise the market pages: in particular `Input` wraps the native input in
 * a span, so a class name lands on the wrapper and not on the input.
 */

import * as React from 'react'

interface ButtonProps {
  variant?: string
  size?: string
  disabled?: boolean
  onClick?: () => void
  children?: React.ReactNode
  className?: string
}

export function Button(props: ButtonProps): JSX.Element {
  const { variant = 'ghost', size = 'md', disabled, onClick, children, className } = props
  return React.createElement(
    'button',
    {
      type: 'button',
      className: className,
      'data-variant': variant,
      'data-size': size,
      disabled,
      onClick,
    },
    children,
  )
}

export function Input(props: {
  value?: string
  onChange?: (event: { target: { value: string } }) => void
  placeholder?: string
  className?: string
  onKeyDown?: (event: { key: string }) => void
}): JSX.Element {
  const { value = '', onChange, placeholder, className } = props
  return React.createElement(
    'span',
    { className: `dsm-inputWrap ${className ?? ''}`.trim() },
    React.createElement('input', {
      value,
      placeholder,
      className: 'dsm-input',
      onChange,
    }),
  )
}

export function Pill(props: {
  active?: boolean
  onClick?: () => void
  children?: React.ReactNode
  className?: string
}): JSX.Element {
  const { active = false, onClick, children, className } = props
  if (onClick === undefined) {
    return React.createElement(
      'span',
      { className: className, 'data-active': active },
      children,
    )
  }
  return React.createElement(
    'button',
    { type: 'button', className: className, 'data-active': active, onClick },
    children,
  )
}

export function SegmentedTabs(props: {
  items?: readonly { value: string; label: React.ReactNode; id?: string; panelId?: string }[]
  value?: string
  onChange?: (value: string) => void
  className?: string
  label?: string
}): JSX.Element {
  const { items = [], value, onChange, className, label } = props
  return React.createElement(
    'div',
    { role: 'tablist', 'aria-label': label, className },
    items.map(item =>
      React.createElement(
        'button',
        {
          key: item.value,
          type: 'button',
          role: 'tab',
          id: item.id,
          'aria-controls': item.panelId,
          'aria-selected': item.value === value,
          onClick: () => onChange?.(item.value),
        },
        item.label,
      ),
    ),
  )
}

export function Switch(props: {
  checked?: boolean
  disabled?: boolean
  onChange?: (next: boolean) => void
  label?: string
  title?: string
  className?: string
}): JSX.Element {
  const { checked = false, disabled, onChange, label, title, className } = props
  return React.createElement(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': checked,
      'aria-label': label,
      title,
      disabled,
      className,
      onClick: () => onChange?.(!checked),
    },
    React.createElement('span', { className: 'dsm-switchThumb' }),
  )
}

export function Tag(props: {
  tone?: string
  className?: string
  children?: React.ReactNode
}): JSX.Element {
  const { tone = 'outline', className, children } = props
  return React.createElement('span', { className, 'data-tone': tone }, children)
}

function icon(name: string) {
  return function Icon(props: { size?: number; 'aria-hidden'?: boolean }): JSX.Element {
    return React.createElement('svg', {
      'data-icon': name,
      width: props.size,
      height: props.size,
      'aria-hidden': props['aria-hidden'],
    })
  }
}

export const IconCordisPluginOutlineRegular = icon('cordis-plugin')
export const IconFolderOpenOutlineRegular = icon('folder-open')
export const IconPluginPinwheelOutlineRegular = icon('plugin-pinwheel')
export const IconRefreshOutlineRegular = icon('refresh')
export const IconSkillOutlineRegular = icon('skill')
export const IconTrashOutlineRegular = icon('trash')
export const IconWarningTriangleOutlineRegular = icon('warning-triangle')

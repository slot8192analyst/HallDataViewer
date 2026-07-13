---
name: DevFocus Dark
colors:
  primary: "#2665fd"
  secondary: "#475569"
  surface: "#0d0d0d"
  on-surface: "#dae2fd"
  error: "#ffb4ab"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
rounded:
  md: 8px
---

# Design System

## Overview
A focused, minimal dark interface for a developer productivity tool.
Clean lines, low visual noise, high information density.

## Colors
- **Primary** (#2665fd): CTAs, active states, key interactive elements
- **Secondary** (#475569): Supporting UI, chips, secondary actions
- **Surface** (#0d0d0d): Page backgrounds — pure black base
- **On-surface** (#dae2fd): Primary text on dark backgrounds
- **Error** (#ffb4ab): Validation errors, destructive actions

## Background Palette (dark theme)
実装上は Surface の単色ではなく、以下の階調を使用する。

| 変数              | 値        | 用途                     |
|-------------------|-----------|--------------------------|
| `--bg-base`       | `#0d0d0d` | ページ背景（最も暗い）   |
| `--bg-elevated`   | `#181818` | 行・パネル（1段明るい）  |
| `--bg-surface`    | `#1e1e1e` | セクション背景           |
| `--bg-card`       | `#141414` | カード・サマリー         |
| `--bg-input`      | `#252525` | フォーム入力欄           |

## Typography
- **Headlines**: Inter, semi-bold
- **Body**: Inter, regular, 14–16px
- **Labels**: Inter, medium, 12px, uppercase for section headers

## Components
- **Buttons**: Rounded (8px), primary uses brand blue fill
- **Inputs**: 1px border, subtle surface-variant background
- **Cards**: No elevation, relies on border and background contrast

## Do's and Don'ts
- Do use the primary color sparingly, only for the most important action
- Don't mix rounded and sharp corners in the same view
- Do maintain 4:1 contrast ratio for all text

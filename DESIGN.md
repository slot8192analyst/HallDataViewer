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
spacing:
  base: 4px
touch:
  min-target: 44px
breakpoints:
  sm: 480px
  md: 768px
  lg: 1200px
---

# Design System

## Overview
A focused, minimal dark interface for a developer productivity tool.
Clean lines, low visual noise, high information density.
**スマホ・PC 両対応**を前提に設計する。新しいコンポーネントを追加するときは必ずこの文書のルールに従うこと。

---

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

---

## Typography
- **Headlines**: Inter, semi-bold (600)
- **Body**: Inter, regular (400), 14–16px
- **Labels**: Inter, medium (500), 12px, uppercase for section headers

### フォントサイズスケール（CSS変数）

| 変数               | 基本値 | 用途                       |
|--------------------|--------|----------------------------|
| `--font-size-xs`   | 11px   | 補助テキスト・バッジ       |
| `--font-size-sm`   | 13px   | ラベル・キャプション       |
| `--font-size-md`   | 14px   | 本文（基準）               |
| `--font-size-lg`   | 16px   | やや強調・ボタン           |
| `--font-size-xl`   | 18px   | セクションヘッダー         |
| `--font-size-2xl`  | 20px   | 数値・強調                 |
| `--font-size-3xl`  | 24px   | ページタイトル             |

> スマホ（≤480px）では各段階を 1〜2px 下げて読みやすさとスペース効率を両立する。

---

## Spacing（スペーシング）
**4px ベースユニット**。すべての余白・ギャップは 4 の倍数で指定する。

| 変数            | 値   | 用途の例                           |
|-----------------|------|------------------------------------|
| `--space-1`     | 4px  | アイコンと文字の隙間など最小余白   |
| `--space-2`     | 8px  | コンポーネント内パディング（小）   |
| `--space-3`     | 12px | コンポーネント内パディング（中）   |
| `--space-4`     | 16px | カード内パディング・行間            |
| `--space-5`     | 20px | セクション間の余白                  |
| `--space-6`     | 24px | カード間・グループ間の余白          |
| `--space-8`     | 32px | ページレベルの大きな余白            |

**ルール**:
- 4px / 8px の固定値をコード内に直書きしない → 必ず `--space-*` 変数を使う
- `5px` `10px` `15px` など 4 の倍数でない値は**新規追加禁止**（既存は順次移行）

---

## Breakpoints（ブレークポイント）
3 段階に統一する。

| 名前 | 変数         | 幅     | 対象デバイス                |
|------|--------------|--------|-----------------------------|
| sm   | `--bp-sm`    | 480px  | スマホ縦向き上限            |
| md   | `--bp-md`    | 768px  | タブレット・スマホ横向き上限 |
| lg   | `--bp-lg`    | 1200px | PC（コンテンツ最大幅）      |

**メディアクエリの書き方**:
```css
/* スマホのみ */
@media (max-width: 480px) { ... }

/* タブレット以下 */
@media (max-width: 768px) { ... }

/* PC以上 */
@media (min-width: 769px) { ... }
```

> `600px` `720px` `900px` `1024px` `1400px` などの中間値は**新規追加禁止**（既存は順次 sm/md/lg に統合）。

---

## Touch（タッチ操作）
スマホでの使用感を担保するためのルール。

### タップターゲット最小サイズ
- **すべてのインタラクティブ要素（ボタン・リンク・入力欄）は最小 44×44px** を確保する
- 視覚的サイズが小さくても `min-height: 44px` と `padding` で当たり判定を確保する

```css
/* 例: アイコンボタン */
.icon-btn {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

### タッチフィードバック
- タップ時のハイライトは `-webkit-tap-highlight-color: transparent` で消し、代わりに CSS の `:active` でフィードバックを返す
- スクロール可能な要素には `touch-action: pan-y` を明示する

```css
/* 全ボタン共通に適用 */
button, a, [role="button"] {
  -webkit-tap-highlight-color: transparent;
}
button:active, a:active {
  opacity: 0.75;
}
```

### スクロール
- 横スクロールコンテナには `-webkit-overflow-scrolling: touch` を設定する
- スクロールバーは幅 6px 以下にして指に干渉させない

---

## Buttons（ボタン）
ボタンは**4種類**に絞る。それ以外の亜種を作らない。

| 種別        | クラス           | 用途                                 | 最小高さ |
|-------------|------------------|--------------------------------------|----------|
| Primary     | `.btn-primary`   | 最も重要なアクション（1画面1個が理想）| 44px     |
| Secondary   | `.btn-secondary` | サブアクション・キャンセルなど       | 44px     |
| Ghost       | `.btn-ghost`     | 破壊的でない軽いアクション           | 36px     |
| Destructive | `.btn-danger`    | 削除・リセットなど不可逆な操作       | 44px     |

**スタイルルール**:
- 角丸: `--radius-md`（8px）統一
- フォント: `--font-size-md`（14px）、`font-weight: 500`
- Primary は `--primary-color` 塗り、白文字
- Secondary は `--border-color` ボーダーのみ、`--text-primary` 文字
- Ghost は背景なし・ボーダーなし、`--text-secondary` 文字
- Destructive は `--color-danger` 塗り（またはボーダー）
- `disabled` 時は `opacity: 0.4`、`cursor: not-allowed`

**Do's and Don'ts**:
- Do: 1つのアクションに1種類のボタンを使う
- Don't: Primary ボタンを同一画面に複数置かない
- Don't: 既存の `.btn-small` `.btn-apply` `.btn-reset` などは新規コンポーネントでは使わない（既存コードとの互換は維持しつつ、新規実装は上記4種に統一）

---

## Forms（フォーム・入力欄）
- **すべての input / select / textarea の高さは最低 44px**
- ラベルは入力欄の上に配置（横並びは768px以上のみ許可）
- placeholder のコントラストは `--text-muted`（4:1 未満の薄すぎる色は禁止）
- focus 時は `border-color: --border-focus`（`#2665fd`）に変化させる
- エラー時は `border-color: --color-danger` + エラーメッセージを入力欄の下に表示

```css
/* 標準入力欄 */
.input {
  min-height: 44px;
  padding: var(--space-2) var(--space-3);   /* 8px 12px */
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.input:focus {
  outline: none;
  border-color: var(--border-focus);
}
```

---

## Cards（カード）
- 背景: `--bg-card`、ボーダー: `1px solid --border-color`
- 角丸: `--radius-md`（8px）
- 内部パディング: `--space-4`（16px）PC / `--space-3`（12px）スマホ
- Elevation（影）は使わない。背景色の差とボーダーでの区別を徹底する
- ホバー時は `border-color: --primary-color` に変化（`transform: translateY(-2px)` は任意）

---

## Motion（アニメーション）
- トランジション時間: `0.15s`（インタラクション）/ `0.3s`（パネル展開・モーダル）
- イージング: `ease`（基本）
- スクロール連動アニメーションや過剰な演出は禁止（情報密度を優先）

```css
/* 基本トランジション */
--transition-fast:   0.15s ease;
--transition-normal: 0.3s ease;
```

---

## Do's and Don'ts（全体）
- **Do**: スペーシングは `--space-*` 変数を使う
- **Do**: 新しいコンポーネントは必ずスマホ（480px以下）で動作確認する
- **Do**: タップターゲットは最低 44×44px を確保する
- **Do**: Primary カラーは最も重要な1つのアクションにだけ使う
- **Do**: 4:1 以上のコントラスト比を維持する
- **Don't**: 角丸を 8px と `border-radius: 50%`（丸）以外の値で混在させない
- **Don't**: 中間ブレークポイント（600px / 720px / 900px）を新規追加しない
- **Don't**: ボタン種別を4種（Primary / Secondary / Ghost / Destructive）以外に増やさない
- **Don't**: `5px` `10px` `15px` など 4 の倍数でない余白値を新規追加しない

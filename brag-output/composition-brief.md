# Hyperframes Composition Brief: cc-mod-waitwhat

## Objective

做 cc-sidecar-waitwhat 那支 deadpan 短片的續集：同一個開場與結尾結構，中段換成「不用開第二個視窗，按鈕就在提示框上面」。

## Output

- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24 秒

## Source Material

- Project root: `/Users/linhancheng/Desktop/projects/cc-mod-waitwhat`
- Primary files read: `README.md`、`hooks/register.tsx`、expect 驅動真實 session 的螢幕紀錄
- Product name: cc-mod-waitwhat
- Tagline: 在 Claude Code 提示框上方重講它剛剛說的話。重講內容只畫在畫面上，不進 transcript，模型看不到。
- Key UI moment to recreate: band 那一行 `wait what [ 白話 ] [ 跟丟了 ]`、按下後的收據行與圓角框重講
- Copy that must appear verbatim:
  - `wait what [ 白話 ] [ 跟丟了 ]`
  - `── 白話 · 往回 1 turn · 重講中…`
  - `── 白話 · 往回 1 turn  (送出 201 字 → http:gemini-3.8-flash-high · 6.5s)`
  - 重講內容取自實測輸出：「git stash 是 Git 的『臨時置物櫃』。當你程式碼寫到一半還不想 commit，卻急著切換分支去修別的東西…白話就是：改到一半還不能存檔時，先收進抽屜放著，等一下再拿出來。」
  - CC 那側的對話文字取自 README〈為什麼模型看不到〉

## Creative Direction

- Tone preset: `deadpan`
- Creative direction: 續集。同一個偏執的動機，這次把偷問做成介面的一部分
- Interpretation: 長停頓、一次一行字、無音樂。開場與結尾刻意跟 sidecar 那支同構
- Angle: 上一支賣「不被察覺」，這一支賣「不被察覺，而且不用躲」
- Hook: 技術文字停住、游標閃，壓字「看不懂。」；band 已經在畫面下方但不搶眼
- Outro: 「按鈕在提示框上面」「模型看不到」「cc-mod-waitwhat」
- Avoid: 泛用 SaaS 語言、抽象動態背景、任何第二個視窗（那是上一支的事）

## Visual identity

沿用 sidecar 那支片的配色，讓兩支是同一系列：

| 角色 | 值 |
|---|---|
| 背景 | `#05070a` / 終端機 `#0d1117` |
| Accent | `#2aa198`（cyan；行內程式碼、焦點環反白） |
| Dim | `#7a828d`（band 標題、收據行、清除按鈕；上一支經 contrast 檢查上調後的值） |
| Text | `#c9d1d9` |
| Bold | `#e6edf3` |

全片等寬字。

## Storyboard

見 `brag-output/brag-plan.md`。摘要：

1. 看不懂 — 4.5s — 六行對話、band、提示列；壓字「看不懂。」
2. 想問又不能問 — 4.3s — 打「這什麼意思」、浮出「問了，它會以為那段很重要。」、退格
3. 按鈕就在旁邊 — 3.8s — 焦點環落到 `[ 白話 ]`、按下、出現「重講中…」
4. 重講長在對話底下 — 5.4s — 收據行、圓角框三行重講、`[ 清除 ]` 出現，整組停 3s
5. 清除 — 1.6s — 按清除、band 回到兩顆按鈕、畫面同 Scene 1
6. 落款 — 4.4s — 暗幕、三行依序、靜止 2.2s

## Audio

- Audio role: intentional silence
- Audio arc: 無
- Music: none（刻意；與 sidecar 那支的實作決定一致）
- Music treatment / cue guidance / audio-reactive: 不適用
- Audio-coupled moments: 無
- SFX: none

## Hyperframes Instructions

沿用 sidecar 那支的 composition 結構（單一 GSAP timeline、`data-layout-allow-occlusion` 標記刻意疊放），`npx --yes hyperframes@0.8.30` 釘同版。要求：

- 至少一個真實 UI：band、收據行、重講框都取自實測畫面
- 所有文字在最終 render 可讀；出現後至少停 2s
- 總長 24 秒
- 全片靜音是刻意決定，不補音樂
- `lint` 與 `check` 零錯誤才 render

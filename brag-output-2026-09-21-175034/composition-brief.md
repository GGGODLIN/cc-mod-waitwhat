# Hyperframes Composition Brief: cc-mod-waitwhat（Orca 拆格版）

## Objective

系列第三支。前兩支的結構與配色照舊，中段換成這一版唯一的新行為：在 Orca 底下按下按鈕，畫面自己裂成兩格，右邊那格自己跑 `ww`。

## Output

- Composition directory: `brag-output-2026-09-21-175034/composition/`
- Rendered video: `brag-output-2026-09-21-175034/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21.5 秒

## Source Material

- Project root: `/Users/linhancheng/Desktop/projects/cc-mod-waitwhat`
- Primary files read: `hooks/register.tsx`、`hooks/orca.ts`、`README.md`、sidecar 的 `sidecar/cli.py`（輸出格式）
- Product name: cc-mod-waitwhat
- Tagline: 在 Claude Code 提示框上方重講它剛剛說的話。重講內容不進 transcript，模型看不到。
- Key UI moment to recreate: 單格終端機裂成兩格，右格自動跑 `ww 1`
- Copy that must appear verbatim（全部取自實作，不是示意）:
  - `wait what [ 白話 ] [ 跟丟了 ]`
  - `── 白話 · 往回 1 turn · 已丟給新拆的那格（ww 1）`（`hooks/register.tsx` 的 sent 狀態字串）
  - `ww 1`（`hooks/orca.ts` 的 `commandFor('plain')`）
  - `── 白話：Git stash 是什麼  (e0cd476e，送出 201 字 → cmd:sidecar-webchat)`（sidecar `cli.py` 的收據行格式）
  - `── 6.5s  來源 cmd:sidecar-webchat`（sidecar `cli.py` 的結尾行格式）
  - 重講內容沿用前作實測輸出的 git stash 那段

## Creative Direction

- Tone preset: `deadpan`
- Creative direction: 系列第三支，自嘲上一支的結尾字卡
- Interpretation: 長停頓、一次一行字、全片靜音。唯一的大動作是分割線掃過
- Angle: 上一支賣「不用再開第二個視窗」，這一版又開了一格——差別是它自己開、自己打字、自己講完
- Hook: 技術文字停住、游標閃，壓字「看不懂。」；右半邊刻意留白當伏筆
- Outro: 「視窗又回來了」「但不是你開的」「模型還是看不到」
- Avoid: 泛用 SaaS 語言、抽象動態背景、任何音效

## Visual Identity

沿用系列配色：

| 角色 | 值 |
|---|---|
| 背景 | `#05070a` / 終端機 `#0d1117` |
| Accent | `#2aa198`（cyan；行內程式碼、焦點環、分割線） |
| Dim | `#7a828d`（band 標題、狀態行、收據行） |
| Text | `#c9d1d9` |
| Bold | `#e6edf3` |

全片等寬字。兩格各 850 / 820 寬、600 高，左右對稱。

## Storyboard

見 `brag-plan.md`。摘要：

1. 看不懂 — 4.5s — 左邊單格 CC，右半邊空白；壓字「看不懂。」
2. 按下去 — 2.8s — 焦點環落到 `[ 白話 ]`、按下（刻意短）
3. 畫面自己裂開 — 4.2s — cyan 分割線掃過、右格出現、自動打出 `ww 1`
4. 重講長在右邊 — 6.0s — 右格逐行長出收據與白話重講，左邊完全靜止
5. 落款 — 4.0s — 三行字卡＋專案名

## Audio

- Audio role: intentional silence
- Music: none（刻意，與前兩支一致）
- SFX: none。分割線掃過時特別想加音效，刻意不加

## Hyperframes Instructions

- 版本釘 `hyperframes@0.8.30`（與前兩支同版）
- **打字動畫一律用 `clip-path: inset(0 100% 0 0)` → `inset(0 0% 0 0)` reveal**，不要用 runtime 改 `textContent`——v0.7.6 起 render 是 seek-based + static-frame dedup，抓不到文字 mutation，會 render 出空白或反向亂碼
- GSAP 動 `scaleY` 的元素，CSS 不能同時寫 `transform`，改用 `tl.fromTo` 或先 `tl.set` 開 opacity
- `lint` 與 `check` 零錯誤才 render
- **render 完必須 `ffmpeg` 抽影格人工看過**，不接受只憑 lint exit code 宣告完成

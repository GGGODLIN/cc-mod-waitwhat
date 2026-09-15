# Brag Plan: cc-mod-waitwhat

## What is this app?

Claude Code 的 mod：提示框上方兩顆按鈕，按下去把它剛講的那段重講成白話，畫在同一個畫面裡。重講內容不進 transcript、模型看不到。

## The angle

它是 cc-sidecar-waitwhat 的續集，所以沿用同一個前提：你看不懂 AI 講什麼，但不能問它，因為問的動作本身就是訊號。上一支片的解法是「另外開一個終端機偷問」；這一支的差別只有一件事——**連視窗都不用換**。按鈕就在提示框正上方，按完答案畫在同一個畫面裡，而模型從頭到尾不知道那顆按鈕被按過。

上一支賣「不被察覺」，這一支賣「不被察覺，而且不用躲」。

## Hook (first 2-3 seconds)

跟上一支同一個開場：終端機裡一段技術文字往上捲、停住，游標閃。壓字「看不懂。」

唯一的差別藏在畫面下方：提示框上面多了一條暗色的 `wait what [ 白話 ] [ 跟丟了 ]`。第一次看不會注意到它，它本來就該長得像家具。

## Key moments (the middle)

- **想打字又縮手**：打出「這什麼意思」再一個字一個字退掉。中間浮一行「問了，它會以為那段很重要。」這是全片唯一解釋動機的地方。
- **焦點移到按鈕上**：不開新視窗，焦點環直接落在 `[ 白話 ]` 上，按下去。band 出現「── 白話 · 往回 1 turn · 重講中…」。上面的對話一個像素都沒動。
- **重講長在對話底下**：標題行 `── 白話 · 往回 1 turn  (送出 201 字 → http:gemini-3.8-flash-high · 6.5s)`，然後一個圓角框裡浮出白話版。這行收據是實測輸出，不是示意。
- **清除**：按 `[ 清除 ]`，band 縮回兩顆按鈕。畫面跟第一秒一模一樣。

## Outro / punchline

畫面靜止在毫無變化的終端機上，暗掉。兩行依序：**按鈕在提示框上面**（白）、**模型看不到**（灰）。然後專案名。

## User flow worth showing

entry → key action → result，三拍都是真的，而且全程在同一個視窗：

1. CC 吐出一段看不懂的技術說明，你停在輸入框前
2. `ctrl+x tab` 把焦點移到 band、Enter 按 `白話`
3. 白話版長在對話底下，讀完按清除；transcript 零變化

## Tone

- Preset: `deadpan`
- Creative direction: 續集。同一個偏執的動機，這次把偷問的動作做成介面的一部分，還是用做企業產品的嚴肅度來拍
- Interpretation: 長停頓、一次一行字、不配快節奏音樂。跟上一支刻意共用開場與結尾結構，讓看過的人一眼認出是同一系列，差別只在中段「沒有第二個視窗」

## Format: landscape — 1920x1080
## Duration: 24 秒

## Visual identity (from the project)

專案沒有網頁，視覺來自它在終端機裡的實際樣子（expect 驅動真實 session 的螢幕紀錄）與 sidecar 那支片的既有配色，讓兩支片是同一系列：

- Background: `#05070a` 外框、`#0d1117` 終端機底
- Accent: `#2aa198`（cyan，行內程式碼與焦點環）
- Secondary accent: `#b58900`（amber，退回原因那類警告行，本片沒用到）
- Dim: `#7a828d`（band 標題、收據行、清除按鈕）
- Text: `#c9d1d9`
- Display / body font: 等寬字，全片
- Strongest visual element: band 那一行 `wait what [ 白話 ] [ 跟丟了 ]` 與底下圓角框裡的重講。這是這個 mod 唯一的介面，也是它跟 sidecar 唯一的差別

## Share copy (draft)

上一版要另開終端機偷問第二個模型。這版把按鈕做到 Claude Code 提示框上面：按下去重講長在同一個畫面裡，模型還是看不到。

## Audio direction

- Role: intentional silence。上一支片實作時因為內建音樂與 deadpan 衝突而做成全靜音，這支沿用同一決定，讓系列一致
- Music: none（刻意）
- Music treatment: 無
- Music cue guidance: 不適用
- Audio-reactive treatment: none
- SFX posture: none。上一支的打字聲與退格聲也沒做，這支不單獨加
- Audio-coupled moments: 無
- Restraint rule: 整支片沒有任何聲音。「什麼都沒發生」這個結論用沉默講最準

## Storyboard

### Scene 1 — 看不懂 — 4.5s
全畫面 CC 終端機。六行真實技術文字往上捲半秒停住（取自 README〈為什麼模型看不到〉段落）。文字底下是 band：`wait what [ 白話 ] [ 跟丟了 ]`，暗色、不搶眼。再底下是提示列，游標閃。停 1.5s 什麼都不發生。壓字「看不懂。」淡入，停約 2s。
Sequential/interaction: yes — 捲動後完全靜止，游標持續閃爍
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 無轉場 → Scene 2

### Scene 2 — 想問又不能問 — 4.3s
游標打出「這什麼意思」（0.25s 一個字）。字打完後畫面下方浮出「問了，它會以為那段很重要。」停 2s。退格把字刪光。
Sequential/interaction: yes — 逐字打入再逐字刪除
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 無轉場 → Scene 3

### Scene 3 — 按鈕就在旁邊 — 3.8s
沒有新視窗。焦點環（cyan 反白）落到 band 的 `[ 白話 ]` 上，停 0.8s，按下（按鈕閃一下）。band 下方出現 `── 白話 · 往回 1 turn · 重講中…`（dim）。上面六行對話與提示列完全不動。停 2s。
Sequential/interaction: yes — 焦點移動、按下、狀態行出現，三拍依序
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 無轉場 → Scene 4

### Scene 4 — 重講長在對話底下 — 5.4s
狀態行換成收據 `── 白話 · 往回 1 turn  (送出 201 字 → http:gemini-3.8-flash-high · 6.5s)`，底下浮出圓角框，三行白話重講（實測 git stash 那段：「git stash 是 Git 的『臨時置物櫃』…」）。band 多出 `[ 清除 ]`。全部出現後整組停 3s 讓人讀完。
Sequential/interaction: yes — 收據先、框後，但最後整組停住
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 乾淨收起 → Scene 5

### Scene 5 — 清除 — 1.6s
焦點環落到 `[ 清除 ]`，按下。收據與框消失，band 回到兩顆按鈕。畫面跟 Scene 1 結束時**完全一致**。停 1s。
Sequential/interaction: yes — 「回到原狀」要被看見
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 慢淡 → Scene 6

### Scene 6 — 落款 — 4.4s
暗幕蓋上。「按鈕在提示框上面」先出現，0.9s 後「模型看不到」（較暗），再 0.9s 後小字 `cc-mod-waitwhat`。全部出現後靜止 2.2s。
Sequential/interaction: none
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 直接結束

**總長：4.5 + 4.3 + 3.8 + 5.4 + 1.6 + 4.4 = 24.0 秒**

**Music mood for this video:** none（刻意靜音，與 sidecar 那支一致）
**Audio summary:** 整支片沒有聲音。

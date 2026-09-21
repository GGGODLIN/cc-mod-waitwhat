# Brag Plan: cc-mod-waitwhat（Orca 拆格版）

## What is this app?

Claude Code 的 mod：提示框上方兩顆按鈕，按下去把它剛講的那段重講成白話。重講內容不進 transcript、模型看不到。這一版新增的行為是：在 Orca 終端機底下，重講不再畫在提示框上方那條 band 裡，而是拆一格終端出來跑 `ww`。

## The angle

這是系列第三支，而它要正面處理一個矛盾。

第一支（cc-sidecar-waitwhat）賣的是「另外開一個終端機偷問」。第二支（cc-mod-waitwhat）的結尾字卡是「按鈕在提示框上面」——賣的正是**不用再開第二個視窗**。現在這一版又開了一格終端。

所以這支片不假裝那是進步的必然，它直接把矛盾演出來：**視窗又回來了，但這次不是你去開的。**你沒有切換、沒有選 session、手沒有離開那顆按鈕；畫面自己裂成兩半，右邊那格自己長出來、自己打字、自己把答案講完。

上一支賣「不用躲」。這一支賣「連開窗都不用你動手」。

## Hook (first 2-3 seconds)

沿用系列同一個開場，讓看過前兩支的人一秒認出：終端機裡一段技術文字往上捲、停住，游標閃。壓字「看不懂。」

差別只有一個，而且要到第二拍才會發現：這次整個畫面**滿版只有一個視窗**，右半邊什麼都沒有。那片空白是這支片的伏筆。

## Key moments (the middle)

- **按下去，然後手就離開了。** 焦點環落到 `[ 白話 ]`、按下。這一拍要短，因為重點不在按鈕——上一支已經講完按鈕了。
- **畫面自己裂開。** 一條垂直分隔線由上往下掃出來，右半邊從無到有。這是全片唯一一個大動作，也是這一版唯一的新東西，要讓它獨佔一拍。
- **右邊那格自己打字。** 提示字元出現，`ww 1` 一個字一個字被打進去——不是你打的。底下跟著真實的收據行 `── 白話：Git stash 是什麼  (e0cd476e，送出 201 字 → cmd:sidecar-webchat)`。
- **左邊只多一行。** 整段重講長在右邊時，左邊那六行對話一個像素都沒動，band 只多一行 `── 白話 · 往回 1 turn · 已丟給新拆的那格（ww 1）`。兩邊的對比就是這支片的論點。

## Outro / punchline

畫面靜止在左右分割的終端機上，暗掉。三行依序：**「視窗又回來了」**（白）、**「但不是你開的」**（白）、**「模型還是看不到」**（灰）。然後專案名。

第一行是故意自嘲上一支的結尾字卡。看過前作的人會笑，沒看過的人只會覺得那是一句實話。

## User flow worth showing

entry → key action → result，三拍都是真的：

1. CC 吐出一段看不懂的技術說明，band 在下面、右半邊空白
2. 按 `[ 白話 ]`（焦點環 + Enter），手不再動
3. 右邊自動拆格、自動跑 `ww 1`、白話版長在那裡；左邊 transcript 與對話零變化

## Tone

- Preset: `deadpan`
- Creative direction: 系列第三支。用做企業產品的嚴肅度，演一個「我上一支剛說不用開視窗」的自嘲
- Interpretation: 長停頓、一次一行字、全片靜音，跟前兩支同構。唯一的高能量動作是分割線掃過，正因為其餘都很靜，那一下才會被看見

## Format: landscape — 1920x1080
## Duration: 21.5 秒

## Visual identity (from the project)

沿用系列配色，讓三支是同一系列：

- Background: `#05070a` 外框、`#0d1117` 終端機底
- Accent: `#2aa198`（cyan；行內程式碼、焦點環反白、分割線掃出時的一瞬）
- Dim: `#7a828d`（band 標題、收據行）
- Text: `#c9d1d9`
- Bold: `#e6edf3`
- Display / body font: 等寬字，全片
- Strongest visual element: **畫面從單格變兩格的那一下**。前兩支都是單一畫面，這是系列第一次出現分割，本身就是這一版的全部內容

## Copy that must appear verbatim（取自實作，不是示意）

- band：`wait what [ 白話 ] [ 跟丟了 ]`
- mod 狀態行：`── 白話 · 往回 1 turn · 已丟給新拆的那格（ww 1）`
- 右格指令：`ww 1`
- 右格收據行：`── 白話：Git stash 是什麼  (e0cd476e，送出 201 字 → cmd:sidecar-webchat)`
- 右格結尾行：`── 6.5s  來源 cmd:sidecar-webchat`
- 重講內容沿用前作實測輸出的 git stash 那段

## Share copy (draft)

上一支的結尾字卡是「按鈕在提示框上面，不用再開第二個視窗」。這一版在 Orca 底下又開了一格——差別是它自己開、自己打字、自己講完，你的手沒有離開那顆按鈕。

## Audio direction

- Role: intentional silence。前兩支都是全靜音，系列一致
- Music: none（刻意）
- Music treatment: 無
- Music cue guidance: 不適用
- Audio-reactive treatment: none
- SFX posture: none
- Audio-coupled moments: 無
- Restraint rule: 整支片沒有任何聲音。分割線掃過時特別會想加音效，不要加——沉默才撐得住「它自己做完了」這件事

## Storyboard

### Scene 1 — 看不懂 — 4.5s
滿版單一 CC 終端機，右半邊是空的。六行真實技術文字往上捲半秒停住。底下是 band `wait what [ 白話 ] [ 跟丟了 ]`（暗色），再底下提示列，游標閃。停 1.5s 什麼都不發生。壓字「看不懂。」淡入，停約 2s。
Sequential/interaction: yes — 捲動後完全靜止，游標持續閃爍
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 無轉場 → Scene 2

### Scene 2 — 按下去 — 2.8s
壓字消失。焦點環（cyan 反白）落到 `[ 白話 ]`，停 0.6s，按下（閃一下）。band 下方出現 `── 白話 · 往回 1 turn · 已丟給新拆的那格（ww 1）`。這一拍刻意短——按鈕是上一支的主題，不是這支的。停 1.2s。
Sequential/interaction: yes — 焦點移動、按下、狀態行出現
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 無轉場 → Scene 3

### Scene 3 — 畫面自己裂開 — 4.2s
一條 cyan 垂直線從畫面上緣往下掃到底（0.5s），掃過之後右半邊出現第二格終端：深底、只有一個提示字元 `❯`。左半邊被壓窄但**文字不重排、不跳動**。接著右格自動打出 `ww 1`（0.3s 一個字，沒有人在打），Enter。停 1.8s。
Sequential/interaction: yes — 分割線、右格出現、自動打字，三拍依序
Audio intent: 沉默（這裡最想加音效，刻意不加）
Audio-coupled idea: none
Music: none
Transition mood: 無轉場 → Scene 4

### Scene 4 — 重講長在右邊 — 6.0s
右格浮出收據行 `── 白話：Git stash 是什麼  (e0cd476e，送出 201 字 → cmd:sidecar-webchat)`（dim），底下三行白話重講逐行出現，最後一行 `── 6.5s  來源 cmd:sidecar-webchat`。同時左半邊**一個像素都沒動**：六行對話、band、那一行狀態，全部靜止。全部出現後整組停 3s 讓人讀完。
Sequential/interaction: yes — 右格逐行長出，左格刻意完全靜止形成對比
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 慢淡 → Scene 5

### Scene 5 — 落款 — 4.0s
暗幕蓋上分割畫面。「視窗又回來了」先出現，0.8s 後「但不是你開的」，再 0.8s 後「模型還是看不到」（較暗），最後小字 `cc-mod-waitwhat`。全部出現後靜止 1.6s。
Sequential/interaction: none
Audio intent: 沉默
Audio-coupled idea: none
Music: none
Transition mood: 直接結束

**總長：4.5 + 2.8 + 4.2 + 6.0 + 4.0 = 21.5 秒**

**Music mood for this video:** none（刻意靜音，與前兩支一致）
**Audio summary:** 整支片沒有聲音。

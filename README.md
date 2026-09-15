# cc-mod-waitwhat

在 Claude Code 提示框上方重講它剛剛說的話。重講內容只畫在畫面上，不進 transcript，模型看不到。

這是 [cc-sidecar-waitwhat](https://github.com/GGGODLIN/cc-sidecar-waitwhat) 的 Claude Mods 版：sidecar 跑在 CC 外面、讀 JSONL；這個 mod 跑在 CC 裡面、讀引擎給的對話，換來不用切終端機、不用選 session。

```
┌ transcript
│  …
├ band
│  wait what [ 白話 1 ] [ 白話 3 ] [ 跟丟了 ] [ 清除 ]
│  ── 白話 · 往回 1 turn  (送出 416 字 → haiku · 2.0s)
│  ╭──────────────────────────────────────────────╮
│  │ Prompt cache 是把不會變的內容先存在 API 端…  │
│  ╰──────────────────────────────────────────────╯
├ prompt
│  ❯
```

| 按鈕 | 做什麼 | 送什麼給模型 |
|---|---|---|
| `白話 1` | 看不懂這一輪，白話重講 | 最後一個 turn |
| `白話 3` | 往回三輪都重講 | 最後三個 turn |
| `跟丟了` | 跟丟了，重講整段脈絡 | 整個 session 的對話與工具紀錄 |

一個 turn 算「你問一次加上 CC 那一輪的回應全部」，中間呼叫工具不會拆開算。

## 為什麼模型看不到

- 重講走 `$.model.complete`：一次獨立呼叫，沒有歷史、沒有工具，system prompt 只有你給的那段。
- 結果畫在 `AbovePrompt`（提示框上方那條 band），不回傳任何文字給 transcript。
- 不註冊 slash command。`/wait-what` 這類指令一敲，CC 就會把 `<command-name>` 寫進 transcript、模型下一輪就看到；按鈕走的是 `ui.press`，實測 JSONL 零筆記錄。

## 需求

- Claude Code 2.1.267 以上，並開 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`
- 只在 terminal 有效。桌面版和手機版沒有 band。

## 用

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /path/to/cc-mod-waitwhat
```

按鈕用滑鼠點，或 `ctrl+x tab` 把焦點移進 band、方向鍵選、Enter 按。`ctrl+x ctrl+a` 收合整條 band。

## 設定

| 環境變數 | 預設 | 說明 |
|---|---|---|
| `WW_MODEL` | `haiku` | 交給 `$.model.complete` 的模型別名或完整 id，跟 `--model` 走同一套白名單 |

兩套 system prompt 跟 sidecar 共用同一個覆寫位置：`~/.config/cc-sidecar-waitwhat/wait-what.md`（跟丟了）與 `plain.md`（白話）。檔案存在且非空就用它，否則用內建。

## 開發

```bash
claude plugin validate .claude-plugin/plugin.json   # 列出掛的事件、$ 呼叫、讀的環境變數
```

型別檢查要先在這個資料夾開一個帶 function hooks 的 session、跑 `/plugin-types` 產生 `.claude/types/`，再 `bunx -p typescript tsc -p .`。

改檔會熱重載進正在跑的 session。

## License

MIT

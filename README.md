# sky-computer-use (native, v0.3.0)

Servidor MCP de **Computer Use nativo para Windows — sem Codex, sem login, sem helper externo**.
Com ele, o Claude controla apps nativos: screenshot da janela **mesmo ocluída** (PrintWindow),
árvore de acessibilidade com índices, clique por elemento ou coordenada, digitação, teclas, scroll e drag.

```
Claude Code ──MCP stdio──▶ sky-computer-use ──▶ Win32/PowerShell (janelas)
                                        ├─▶ PrintWindow (captura ocluída) + screenshot-desktop (fallback)
                                        ├─▶ UIAutomationClient (árvore, invoke/value/expand)
                                        ├─▶ nut-js (SendInput: mouse + teclado)
                                        └─▶ overlay WPF (banner + anel + Esc)
```

## Requisitos (para você e seus amigos)

- Windows 10/11, Node ≥ 22.
- Nada mais: `npm install` baixa tudo (`@modelcontextprotocol/sdk`, `@nut-tree-fork/nut-js`, `screenshot-desktop`, `sharp`, `zod`).
- Sem app Codex, sem conta ChatGPT, sem `codex-computer-use.exe`.

## Instalação

```bash
# 1. copiar a pasta para um lugar fixo (ex: Documents) ou git clone do seu repo
# 2. instalar
npm install

# 3. registrar no Claude Code (escopo user)
claude mcp add --scope user sky -- node "C:/caminho/para/sky-computer-use/src/index.js"

# 4. instalar a skill (instruções de uso + segurança)
# copiar skill/windows-computer-use/SKILL.md para ~/.claude/skills/windows-computer-use/SKILL.md
```

Verifique com `claude mcp get sky` (deve mostrar "Connected"). As ferramentas `mcp__sky__*` aparecem numa **sessão nova**.

## Ferramentas

`list_apps`, `list_windows`, `get_window`, `launch_app`, `activate_window`, `get_window_state`, `click`,
`type_text`, `press_key`, `scroll`, `drag`, `set_value`, `perform_secondary_action`.

- `set_value` / `perform_secondary_action` / `click` com `element_index` retornam erro claro na V1 (sem árvore UIA ainda) — use `x`/`y` do screenshot.
- Ferramentas de entrada aceitam `observe` (`screenshot` por padrão) e já devolvem o estado novo.

## Workflow recomendado (importante na V1 nativa)

1. `list_apps` / `list_windows` → escolha **uma** window e copie o objeto verbatim.
2. `activate_window` → traga para frente (a captura é do desktop visível, não há WGC de janela ocluída).
3. `get_window_state` → screenshot + coordenadas.
4. Uma ação com `observe` → inspecione → repita.

## Segurança visível (paridade com Codex)

Durante qualquer ação numa janela, um overlay topmost click-through aparece:
banner "● sky — IA está usando seu computador • Esc para parar" + anel no cursor.
Some após ~15s sem ações ou ao encerrar o servidor.

**Esc para parar:** o overlay detecta Esc físico, aborta a automação e as próximas
chamadas exigem confirmação do usuário via elicitation (`confirmResume`) — mesma
semântica do helper do Codex (exit 130).

## Aprovações

Antes de tocar num app, o servidor pede aprovação via **MCP elicitation** (diálogo no Claude Code), com opção "Lembrar sempre".
- Sessão: vale enquanto o servidor estiver aberto.
- Sempre: salvo em `~/.claude/sky-computer-use/approvals.json` (editável à mão; o servidor relê a cada uso).

## Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `SKY_APPROVALS_PATH` | `~/.claude/sky-computer-use/approvals.json` | apps aprovados "sempre" |
| `SKY_TIMEOUT_MS` / `SKY_LAUNCH_TIMEOUT_MS` | 20000 / 30000 | (reservado, backend nativo é síncrono) |
| `SKY_MAX_IMAGE_EDGE` / `SKY_MAX_IMAGE_PIXELS` | 1568 / 1150000 | tamanho máximo do screenshot enviado ao Claude |
| `SKY_JPEG_QUALITY` | 80 | qualidade quando precisa reduzir |

## Estrutura

```
src/
  index.js              stdio + shutdown
  server.js             monta NativeClient + aprovações + ferramentas
  config.js             só aprovações e imagem (sem Codex)
  safety.js             bloqueio da tecla Windows
  native/
    win32.js            EnumWindows/GetWindowRect/SetForegroundWindow via PowerShell
    screenshot.js       PrintWindow (ocluída) + fallback recorte do monitor
    printwindow.ps1     render PrintWindow -> PNG
    uia-dump.ps1        árvore UIA -> JSON (índices, rects, patterns, runtimeId)
    uia-act.ps1         invoke/setvalue/expand/collapse/select por runtimeId
    uia.js              wrapper dump/format/act
    input.js            nut-js + mapa de teclas X-style -> nut-js Key
    overlay.ps1/js      banner + anel do cursor + Esc
    client.js           NativeClient: mesma interface call(method) das ferramentas
  approvals/            store (arquivo+sessão), prompter (elicitation), manager
  screenshots/          redução de imagem e conversão de coordenadas
  tools/                definições MCP (janelas, entrada, observação)
  helper/               legado Codex (não usado na V1 nativa, mantido p/ referência)
skill/windows-computer-use/SKILL.md
test/                   segurança de teclas, escala, aprovações, mapa de teclas nativo
scripts/e2e-calculator.mjs   teste real via MCP: abre Calculadora, digita 12+30, clica, fecha
```

## Testes

```bash
npm test
npm run e2e
```

O e2e mexe de verdade no desktop (abre a Calculadora). Ele aprova automaticamente só Calculadora/ApplicationFrameHost.

## Captura e acessibilidade (paridade funcional)

- **Janela ocluída:** `PrintWindow(PW_RENDERFULLCONTENT)` renderiza a janela mesmo coberta;
  fallback para recorte do desktop quando o app não renderiza (minimizado/protegido).
- **Árvore UIA:** `get_window_state(include_text=true)` retorna índices `[n] Tipo "nome" (patterns) [x,y w×h]`
  via `UIAutomationClient`; `click_element` (Invoke), `set_value` (Value) e
  `perform_secondary_action` (Expand/Collapse/Select) operam por `runtimeId` da última observação.
- **Aprovações case-insensitive** (Windows): `explorer.exe` == `Explorer.EXE`.

## Limitações conhecidas (v0.3.0)

- **Minimizado/protegido:** PrintWindow não renderiza janela minimizada ou com proteção DRM; nesses casos o fallback de recorte também falha — ative a janela.
- **DPI:** validado em 100%. Em 125%/150% o mapeamento usa razão pixels/logical e deve funcionar, mas valide antes de compartilhar.
- **Janela em 2 monitores (fallback):** no recorte visível, captura a maior interseção e ajusta a origem; coordenadas continuam exatas dentro da parte visível.
- **`list_apps`:** lista apps com janelas abertas (agrupado por exe); apps instalados sem janela não aparecem — use `launch_app` com caminho `.exe`.

## Compartilhar com amigos

1. Zipar a pasta (sem `node_modules/` e `e2e-output/`) ou subir para um repo.
2. Amigo faz `npm install`, `claude mcp add --scope user sky -- node "<caminho>/src/index.js"`, copia a skill.
3. Na primeira automação, ele aprova o app no diálogo — pronto.

# ContextPack

在 AI 开始修改代码之前，先给它一份小而准确的项目上下文。

**中文** | [English](README.md) | [Benchmark](benchmarks/README.md)

[![状态：源码预览版](https://img.shields.io/badge/status-source_preview-orange.svg)](#当前状态)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Cminors/contextpack/actions/workflows/ci.yml/badge.svg)](https://github.com/Cminors/contextpack/actions/workflows/ci.yml)

ContextPack 是一个面向 JavaScript 和 TypeScript 项目的本地命令行工具。你用一句话描述任务，它会从仓库中找出最值得 AI 编程助手优先阅读的代码、测试、项目规则和关联文件，并生成一份可直接交给 Codex、Cursor、Claude Code 等工具的 `context.md`。

```text
你的任务描述
    ↓
ContextPack 本地分析项目
    ↓
.contextpack/tasks/<任务名>/context.md
    ↓
把 context.md 和原任务一起交给 AI 编程助手
```

ContextPack 不调用 LLM、不需要 API Key、不上传仓库，也不会修改你的源代码。

> [!IMPORTANT]
> ContextPack 目前仍是源码预览版，尚未发布 npm 包，也还没有正式 Beta。现在适合按照本文档进行小范围测试，不适合直接宣传为已经完成的产品。

## 它解决什么问题

大型项目可能包含几百甚至几千个文件。AI 编程助手虽然可以自己搜索，但经常会浪费上下文、漏掉测试、忽略 export 入口，或者没有读到项目目录里的 `AGENTS.md` 等规则。

ContextPack 只回答一个问题：

> 针对当前任务，AI 最应该先看哪些文件和代码片段，为什么？

它不会替你写代码，而是先替 AI 整理“开工前需要知道的东西”。

## 谁适合使用

适合：

- 正在使用 Codex、Cursor、Claude Code 或其他 AI 编程助手的人；
- 手上已经有一个 JavaScript 或 TypeScript 项目；
- 想减少 AI 在大仓库里盲目搜索的人；
- 愿意测试实验性工具并反馈问题的人。

暂时不适合：

- 手上没有代码项目，只想普通聊天的人；
- Python、Go、Rust、Java 等非 JS/TS 项目；
- 希望工具自动修改或自动提交代码的人；
- 需要稳定商业 SLA 或已经验证的 Agent 成功率提升的人。

## 零基础快速开始

下面的步骤不要求你理解 ContextPack 的算法，但需要会打开终端并复制命令。

不知道怎样在文件夹中打开终端时：

- Windows 11：在文件夹空白处点击右键，选择“在终端中打开”；也可以点击文件资源管理器地址栏，输入 `powershell` 后按回车。
- macOS：打开“终端”，输入 `cd `（后面保留一个空格），把目标文件夹拖进终端窗口，再按回车。
- VS Code / Cursor：打开项目后，选择菜单中的 **Terminal → New Terminal**。

### 第 0 步：确认你有一个可分析的项目

目标项目中至少要有一个以下类型的源码文件：

```text
.js  .jsx  .ts  .tsx  .mjs  .cjs  .mts  .cts
```

最好从项目根目录运行，也就是通常能看到 `package.json`、`src/` 或 `.git/` 的目录。

### 第 1 步：安装 Node.js

从 [Node.js 官方网站](https://nodejs.org/en/download)安装当前 LTS 版本。ContextPack 最低要求 Node.js 20；新测试者建议直接安装当前 LTS。

安装后重新打开终端，输入：

```bash
node --version
npm --version
```

只要两条命令都能显示版本号，就可以继续。

Git 不是静态分析的硬性要求，但安装 [Git](https://git-scm.com/downloads/) 后，ContextPack 才能使用提交历史和共变关系。获取源码时也会更方便。

### 第 2 步：获取并安装 ContextPack 源码预览版

目前不要执行 `npm install -g contextpack`，因为 npm 包还没有发布。

有 Git 时，在终端执行：

```bash
git clone https://github.com/Cminors/contextpack.git
cd contextpack
npm ci
npm run build
npm link
```

没有 Git 时：

1. 打开 [ContextPack GitHub 页面](https://github.com/Cminors/contextpack)。
2. 点击绿色的 **Code**，再点击 **Download ZIP**。
3. 解压 ZIP。
4. 在解压后的 `contextpack` 文件夹中打开终端。
5. 执行：

```bash
npm ci
npm run build
npm link
```

安装完成后验证：

```bash
contextpack --version
```

正常情况下会输出：

```text
0.1.0
```

### 第 3 步：在你的项目中运行

先进入需要分析的 JS/TS 项目目录。

Windows 示例：

```powershell
cd "C:\Users\你的用户名\Documents\my-project"
contextpack task "修复登录超时后没有提示的问题"
```

macOS / Linux 示例：

```bash
cd ~/projects/my-project
contextpack task "fix the missing message after login timeout"
```

任务描述可以使用中文或英文。尽量写清楚“要改什么”和“发生在哪里”，例如：

```bash
contextpack task "给管理员登录增加短信二次验证"
contextpack task "修复上传大文件时进度条停在 99% 的问题"
contextpack task "为订单列表增加按创建时间筛选"
```

不要只写：

```text
修一下
优化代码
有 bug
```

### 第 4 步：找到生成结果

命令完成后会显示类似：

```text
Context pack: C:\path\to\my-project\.contextpack\tasks\修复登录超时
Selected 8 snippets; estimated 7421/12000 tokens.
```

输出目录中有两个文件：

```text
.contextpack/tasks/<任务名>/
├── context.md       # 普通用户主要使用这个
└── manifest.json    # 排名、分数和调试数据
```

如果文件管理器没有显示 `.contextpack`，可以直接在 VS Code、Cursor 或终端中打开项目；以点开头的目录有时会被隐藏。

### 第 5 步：把结果交给 AI 编程助手

把 `context.md` 上传、拖入或粘贴给你使用的 AI 编程助手，再附上原始任务。

可以直接复制下面这段话：

```text
附件 context.md 是 ContextPack 根据当前仓库和任务生成的上下文。
请先阅读其中的项目规则、候选文件、代码片段和风险提示，
再完成这个任务：修复登录超时后没有提示的问题。
如果实际代码与 ContextPack 的建议冲突，以仓库中的真实代码为准。
```

`context.md` 是辅助材料，不是绝对答案。AI 仍然应该检查真实仓库、运行测试并验证修改。

## 最常用的命令

### 生成上下文包

```bash
contextpack task <任务描述>
```

完整参数：

```bash
contextpack task <任务描述> \
  --budget 12000 \
  --format both \
  --history 500 \
  --output <输出目录>
```

| 参数 | 作用 | 默认值 |
|---|---|---:|
| `--budget <4000..32000>` | 最大上下文 Token 预算 | `12000` |
| `--format markdown\|json\|both` | 输出 Markdown、JSON 或两者 | `both` |
| `--history <数量>` | 用于关系分析的本地 Git 提交数 | `500` |
| `--output <目录>` | 自定义输出目录 | 自动生成 |

### 解释为什么推荐某个文件

```bash
contextpack explain src/auth.ts --task "增加 GitHub OAuth"
contextpack explain loginWithGithub --task "增加 GitHub OAuth"
```

### 查看帮助

```bash
contextpack --help
contextpack task --help
contextpack explain --help
```

## 常见问题与排查

### `contextpack` 不是内部或外部命令 / command not found

先回到 ContextPack 源码目录重新执行：

```bash
npm run build
npm link
```

然后关闭并重新打开终端。如果 `npm link` 仍不可用，可以从目标项目目录直接运行构建后的 CLI：

Windows：

```powershell
node "C:\ContextPack所在目录\dist\cli.js" task "你的任务"
```

macOS / Linux：

```bash
node "/ContextPack所在目录/dist/cli.js" task "你的任务"
```

### `node` 或 `npm` 不是命令

Node.js 没有正确安装，或者安装后终端还没有重启。重新安装当前 LTS，并关闭所有终端窗口后再试。

### `No supported JavaScript or TypeScript source files were found`

当前目录中没有受支持的 JS/TS 文件。确认你已经 `cd` 到正确的项目根目录，而不是 ContextPack 自己的目录、桌面目录或某个空文件夹。

### 提示没有 Git 仓库

这不是致命错误。ContextPack 会继续做静态分析，只是没有 Git 历史信号。需要完整效果时，请安装 Git，并确保目标项目本身是 Git 仓库。

### 分析时间太长

大型项目第一次分析可能较慢。可以减少历史提交数量：

```bash
contextpack task "你的任务" --history 100
```

不要在包含多个无关项目的超大目录中运行；应进入真正的项目根目录。

### 推荐结果与任务不相关

- 把任务描述写得更具体；
- 加入业务对象、错误现象或功能位置；
- 确认在正确分支和正确项目根目录运行；
- 把 `manifest.json` 和问题描述一起提交到 [GitHub Issues](https://github.com/Cminors/contextpack/issues)，但请先检查并删除不希望公开的信息。

### ContextPack 会修改项目吗？

不会。普通 `task` 和 `explain` 命令只读取仓库，并把结果写到 `.contextpack/`。它不会修改源码、提交 Git 或调用外部 AI。

## 更新与卸载

使用 Git 克隆时，更新源码预览版：

```bash
cd contextpack
git pull
npm ci
npm run build
npm link
```

使用 ZIP 时，需要重新下载并解压最新版本，然后再次执行 `npm ci`、`npm run build` 和 `npm link`。

取消全局链接：

```bash
npm uninstall -g contextpack
```

这不会删除你的源码目录，也不会删除各项目中已经生成的 `.contextpack/` 文件。

## 会生成什么

`context.md` 主要包含：

- 任务和仓库快照；
- 按相关性排序的文件和符号；
- 每个入选文件的原因；
- import、export、测试和 Git 共变关系；
- 适用的 `AGENTS.md`、`CLAUDE.md`、Copilot 和 Cursor 规则；
- 项目已有的测试、类型检查和构建命令；
- 可能相关但因预算没有入选的风险文件；
- 受 Token 预算控制的源码片段。

`manifest.json` 提供机器可读的候选列表、分数拆解、关系、预算、警告和性能数据，主要用于排查和二次集成。

面向维护者的 issue 评测还会生成 `audit.md`/`audit.json`；新分析的实例还会生成 `diagnostics.md`/`diagnostics.json`。审计用于区分 Top 10 文件排序失败与区域定位失败，诊断则在检索完成后保存 gold 文件排名和评分分量，不会把标签反馈给检索过程。

## 隐私与安全

- 分析在本机完成；
- 不调用 LLM，不要求 API Key；
- 不上传仓库或生成结果；
- 排除 `.env`、私钥、凭据、依赖目录和构建产物；
- 匹配常见密钥模式的片段不会输出；
- Git 命令使用参数数组，不进行 Shell 字符串拼接；
- 历史评测使用独立 worktree，不切换当前工作区。

任何自动化过滤都不可能保证百分之百识别敏感信息。把 `context.md` 发送给第三方服务前，仍应自行检查内容。

## 当前支持范围

已经支持：

- JavaScript、JSX、TypeScript、TSX、MJS、CJS、MTS 和 CTS；
- npm、pnpm、Yarn 和 Bun 项目元数据；
- 单包项目和常见 workspace/monorepo；
- `tsconfig` 路径别名；
- 有边界的 TypeScript 符号和依赖关系；
- 本地 Git 标题、文件共变和常见 Agent 规则文件；
- 中文和英文任务描述。

暂未支持或尚未证明：

- 自动修改代码或自动运行 Agent；
- Python、Go、Rust、Java 等语言；
- 任意大型重构、安全审计或完整 bug 诊断；
- 云端账号、团队协作和内置 LLM；
- 稳定提高 Coding Agent 最终任务成功率的结论。

## Benchmark 与真实水平

ContextPack 当前拥有两条评测轨：

1. 历史提交回放：检查能否找回真实改动文件；
2. SWE-bench Multilingual JS/TS：检查真实 issue 下的文件和行级检索。

当前关键结果：

| 评测 | 样本 | Recall@10 | MRR | 说明 |
|---|---:|---:|---:|---|
| MCP TypeScript SDK，标题模式 | 20 | 0.439 | 0.635 | 中型仓库文件检索 |
| MCP TypeScript SDK，关键词消融 | 20 | 0.341 | 0.402 | 删除答案提示后的结果 |
| SWE-bench Axios issue | 6 | 0.617 | 0.205 | 文件与区域级真实 issue 冒烟 |
| SWE-bench JS/TS 固定集 | 43 个有效 / 43 个已尝试 | 0.299 | 0.079 | 七仓库 P0.5 零跳过基线 |

查询感知的区域定位把 Axios 在 100、250、500 行预算下的行召回从全部 `0.000` 提升到 `0.167`、`0.355` 和 `0.411`，500 行 useful-hit rate 达到 `0.667`。但这仍只是六任务冒烟，区域噪声较高，不能据此宣称普遍提高 Agent 成功率。

可恢复的运行器现在已经完成全部 43 个固定 JS/TS 实例，没有跳过。在零跳过基线上，100、250、500 行预算的行召回分别为 `0.000`、`0.062`、`0.070`。失败阶段审计发现 26 个 Top 10 文件排序失败、11 个“正确文件已找到但没有输出有效区域”的任务，以及 6 个同时命中文件和有效区域的任务。这些结果暴露出明显的跨仓库文件排序和文件内定位差距，不能与仅包含 Axios 的六任务冒烟直接比较。

P0.6 重新运行了 22 个 gold 文件不在已记录 Top 20 的任务，并保存分数证据。所有 gold 文件都存在于候选集中，没有实例被预测多样性策略挤出；22 个任务都有直接 lexical 或 symbol 信号，但仍低于 Top 10 阈值。其中 20 个任务以 lexical 为主要加权信号，且 22 个任务中有 20 个的 Top 10 候选至少包含一个达到 lexical 内容分数上限的文件。所以下一个受控实验应优先改善词项区分度和 lexical 分数饱和，而不是扩大文件发现范围。

完整方法、原始结果、限制和失败实验见 [Benchmark 文档](benchmarks/README.md)。

## 面向维护者的评测命令

普通试用者不需要运行下面的命令。

```bash
# 本仓库历史回放
contextpack eval --commits 20 --budget 12000 --query-mode title
contextpack eval --commits 20 --budget 12000 --query-mode keyword-ablated

# 准备固定版本的 SWE-bench JS/TS 数据
npm run benchmark:prepare:swebench

# 真实 issue/patch 检索评测
contextpack eval-issues --instance axios__axios-4738
contextpack eval-issues --repo axios/axios
contextpack eval-issues --line-budgets 100,250,500

# 可断点续跑的完整评测；分析限时 10 分钟，Git 获取限时 5 分钟
contextpack eval-issues --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/full-43
contextpack eval-issues --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/full-43 --resume

# 只重试检查点里已记录为跳过的实例
contextpack eval-issues --instance-timeout 600 --git-timeout 300 --output .contextpack/evals/full-43 --resume --retry-skipped

# 复现 P0.6 的 Top 20 外诊断子集
npm run benchmark:prepare:diagnostics
contextpack eval-issues --dataset .benchmarks/datasets/swe-bench-multilingual-p06-ranking-misses.jsonl --output .contextpack/evals/p06-ranking-diagnostics
```

评测数据和仓库快照保存在已忽略的 `.benchmarks/` 缓存中。真实 issue 报告把文件 Recall/MRR 和实际输出片段的行级指标分开，gold label 只在检索完成后用于评分。`eval-issues` 会在每次实例完成或跳过后原子写入 `checkpoint.json`；只有数据集指纹、实例范围、Token/行预算和历史窗口一致时，`--resume` 才会接受该检查点。每个设置超时的分析都在隔离 Worker 中运行，仓库获取另有独立超时和低速中止，因此单个慢实例不会无限占住整轮评测。

## 如何反馈测试问题

请在 [GitHub Issues](https://github.com/Cminors/contextpack/issues) 提供：

- 操作系统；
- `node --version` 和 `npm --version`；
- 执行的 ContextPack 命令；
- 完整错误信息；
- 项目大致规模和结构；
- 如果是推荐不准，提供脱敏后的任务描述和 `manifest.json`。

不要上传私有源码、Token、`.env` 或其他凭据。

## 当前状态

ContextPack 目前是未发布的实验性源码预览版：核心 CLI、打包结构、自动测试、性能烟测、可断点续跑的真实 issue 评测、零跳过的 43 任务外部基线、失败阶段与分数级诊断和第一版查询感知区域定位已经具备，但 npm 发布、正式 Release、零基础安装体验、经过验证的 lexical 区分度改进和更广泛可靠的文件内定位仍未完成。

现阶段目标是让小范围测试者能够安全、清楚地试用并反馈问题，而不是进行大规模推广。

## 本地开发

```bash
npm ci
npm run check
npm run test:coverage
npm run perf:smoke
```

当前质量门禁：77 项测试通过、行覆盖率超过 88%、生产依赖漏洞为 0，并包含一个确定性的 360 文件性能烟测。GitHub CI 验证 Node.js 20 和 22。

## 许可证

[MIT](LICENSE)

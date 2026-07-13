<div align="center">

# ContextPack

**让 Coding Agent 在开始写代码前，先拿到正确的仓库上下文。**

面向 JavaScript 和 TypeScript 仓库的本地、确定性、可解释任务上下文检索工具。

**中文** | [English](README.md) | [Benchmark](benchmarks/README.md)

[![状态：实验版](https://img.shields.io/badge/status-experimental-orange.svg)](#项目状态)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933.svg?logo=node.js&logoColor=white)](package.json)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Cminors/contextpack/actions/workflows/ci.yml/badge.svg)](https://github.com/Cminors/contextpack/actions/workflows/ci.yml)

</div>

ContextPack 可以把一条功能需求转换成一份紧凑、有证据的任务地图，告诉 Coding Agent 应该优先理解哪些代码、测试、项目规则和 Git 历史关系。

> **说人话：** 一个大型项目里可能有成千上万个文件。ContextPack 会在 AI 开始改代码前，先替它找出这次任务真正相关的代码、测试和项目规则，再整理成一份简明的“开发资料包”。它不负责写代码，而是帮助 Coding Agent 在动手前先看对地方、弄懂项目。

```bash
contextpack task "给登录模块增加 GitHub OAuth"
```

```text
.contextpack/tasks/给登录模块增加-github-oauth/
|-- context.md       # 交给 Codex、Claude Code、Cursor 或其他 Agent
`-- manifest.json    # 分数、证据、关系和 Token 预算元数据
```

ContextPack 不调用 LLM、不要求 API Key、不修改源代码，也不会上传你的仓库。

## 为什么需要 ContextPack

Coding Agent 可以搜索整个仓库，但宽泛探索会消耗上下文，也容易漏掉相关测试、公开导出入口和局部开发规则。ContextPack 先回答一个更具体的问题：

> 为了完成当前任务，Agent 最先应该理解哪些文件和符号？为什么？

每个推荐结果都包含分项得分和可检查的证据。在相同仓库状态、任务和参数下，ContextPack 会生成相同的排序。

## 会生成什么

生成的 `context.md` 包含：

- 按任务相关性排列的文件和符号地图；
- Token 预算内的关键代码片段；
- import、export、测试和本地 Git 共变关系；
- 适用的 `AGENTS.md`、`CLAUDE.md`、Copilot 和 Cursor 规则；
- 仓库已有的测试、类型检查和构建命令；
- 未纳入候选和潜在影响范围。

任务地图示例：

```text
排名  文件 / 符号                            入选证据
1     src/auth/github.ts#GithubProvider     任务词 + 符号
2     src/auth/index.ts                     公开导出入口
3     test/auth/github.test.ts              直接测试关系
4     src/session/store.ts                  import + Git 共变
```

## 快速开始

ContextPack 当前是实验性源码预览版，尚未正式发布 npm 包。

```bash
git clone https://github.com/Cminors/contextpack.git
cd contextpack
npm ci
npm run build
npm link
```

然后在已有的 JavaScript 或 TypeScript 项目中运行：

```bash
cd /path/to/your-project
contextpack task "给登录模块增加 GitHub OAuth"
```

环境要求：Node.js 20 或更高版本；如果需要 Git 历史信号，还需要安装 Git。

## 使用方法

### 生成任务上下文包

```bash
contextpack task <任务描述> \
  --budget 12000 \
  --format both \
  --history 500
```

| 参数 | 作用 |
|---|---|
| `--budget <4000..32000>` | 最大估算上下文大小，默认 `12000` |
| `--format markdown\|json\|both` | 输出格式，默认 `both` |
| `--history <数量>` | 用于历史关系分析的本地非合并提交数 |
| `--output <目录>` | 自定义输出目录 |

### 解释某项推荐

```bash
contextpack explain src/auth.ts --task "增加 GitHub OAuth"
contextpack explain loginWithGithub --task "增加 GitHub OAuth"
```

### 使用历史提交评测检索效果

```bash
contextpack eval --commits 20 --budget 12000 --query-mode title
contextpack eval --commits 20 --budget 12000 --query-mode keyword-ablated
```

历史回放会在独立的临时 Git worktree 中分析提交的父版本。`title` 保留原始提交查询；`keyword-ablated` 会删除来自真实改动文件的完整路径、文件名、声明名和匹配的 Conventional Commit scope，同时保留更宽泛的需求语义。报告会记录原始标题、实际查询和删除的提示词，并且不会切换或修改当前工作区。

## 排名原理

ContextPack 使用六类确定性信号：

| 信号 | 权重 |
|---|---:|
| 任务词和路径匹配 | 28% |
| 符号相关性 | 22% |
| 依赖与公开导出距离 | 18% |
| Git 标题和共变历史 | 15% |
| 测试关系 | 10% |
| 规则和配置相关性 | 7% |

候选生成会控制 workspace 包、测试、配置、示例和 export barrel 的分布。缺失信号会被视为不可用，而不是负面证据。

## Benchmark

历史回放衡量的是“检索代理指标”，不是 Coding Agent 的最终任务成功率。

| 仓库 | JS/TS 文件 | 功能提交 | Recall@10 | MRR | Token 中位数 | 分析耗时中位数 |
|---|---:|---:|---:|---:|---:|---:|
| `sindresorhus/p-map` | 6 | 12 | 1.000 | 0.757 | 1,498 | 666 ms |
| `modelcontextprotocol/typescript-sdk` | 635 | 20 | 0.414 | 0.605 | 9,002 | 2,029 ms |

中型仓库结果已达到 MRR 目标（`>= 0.60`），但尚未达到 Recall@10 目标（`>= 0.70`）。详细方法、原始报告、限制和被否决的实验见 [Benchmark 文档](benchmarks/README.md)。

Benchmark V2 暴露了明显的关键词捷径：在相同的 20 条 MCP SDK 提交上，标题模式达到 Recall@10 `0.414` / MRR `0.605`，关键词消融模式只有 `0.233` / `0.260`，测试召回也从 `0.472` 降至 `0.139`。这说明在作出更强产品承诺前，结构化检索仍需明显改进。

## 当前支持范围

**已经支持**

- JavaScript、JSX、TypeScript 和 TSX；
- npm、pnpm、Yarn 和 Bun 项目元数据；
- 单包项目和常见 workspace/monorepo；
- `tsconfig` 路径别名和有边界、任务相关的 TypeScript 符号关系；
- 小到中型的功能新增任务；
- 本地 Git 历史和常见 Coding Agent 规则文件。

**暂不支持**

- 自动修改代码；
- 任意 Bug 定位、安全审计或大型重构；
- Python、Go、Rust、Java 等其他语言；
- 云端存储、账号、团队协作或内置 LLM；
- “提高 Agent 最终成功率”之类尚未验证的承诺。

## 隐私与安全

- 所有仓库分析均在本机完成；
- 排除 `.env`、私钥、凭证、依赖目录和构建产物；
- 不输出匹配常见密钥模式的代码片段；
- Git 命令使用参数数组，不进行 Shell 字符串拼接；
- 评测前后会验证分支、HEAD、索引和未跟踪文件保持不变。

## 项目状态

ContextPack 当前是实验性 V0.1，V0.2 检索开发已经开始。CLI 已经可用并经过测试，但中型仓库的召回率尚未达到发布目标。带根 `tsconfig` 的项目现在会使用编译器感知的路径解析和有边界的语义扩展；无根配置的 monorepo 继续使用更快的结构化路径，直到 Benchmark 证明扩大 Program 分析范围确有收益。

## 本地开发

```bash
npm ci
npm run check
npm run test:coverage
```

当前本地质量门禁：35 项测试通过、行覆盖率超过 90%、生产依赖漏洞为 0。GitHub CI 会在 Node.js 20 和 22 上验证项目。

## 许可证

[MIT](LICENSE)

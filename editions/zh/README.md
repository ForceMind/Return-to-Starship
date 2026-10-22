# 中文集中审阅稿

[《重返星舰》中文审阅候选 R1](review-20261022.md)，2026-10-22，完整23篇、206,801正文汉字。此版用于作者集中审阅，未经作者批准出版；不是正式发行版。章节正文继续以 `manuscript/zh/` 为维护来源。

R1正文固定于[4dfa7a3](https://github.com/ForceMind/Return-to-Starship/commit/4dfa7a35f8ba24c91685f28af67672da4c105ac5)。合并时没有另改文字；[来源清单](review-20261022.sources.json)列出23篇各自的汉字数、Git blob SHA及合并文件SHA256。头部说明与目录不计入小说正文字数。

核心情节审阅见[D路线登记](../../docs/d-route-ending-register.md)，版本与检查见[冻结前核查](../../docs/zh-prepublication-audit-20261014.md)。原作者确认设定仍单列于canon，D路线新增谜底不追认成原作者已批准。

从已取得源提交的仓库重建：

```sh
node scripts/build-review-edition.mjs --source 4dfa7a35f8ba24c91685f28af67672da4c105ac5 --date 2026-10-22
```

脚本只读取指定提交并生成审阅文件/来源清单，不变更正文、发布标记、网页部署或Git历史。后续新候选使用新日期文件，保留R1以便对照；同日重建应使用同一源提交。

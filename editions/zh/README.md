# 中文集中审阅稿

[《重返星舰》中文审阅候选 R1](review-20261022.md)，2026-10-22，完整23篇、206,801正文汉字。另有可下载的[EPUB审阅本](review-20261022.epub)。两者均用于作者集中审阅，未经作者批准出版；不是正式发行版。章节正文继续以 `manuscript/zh/` 为维护来源。

R1正文固定于[4dfa7a3](https://github.com/ForceMind/Return-to-Starship/commit/4dfa7a35f8ba24c91685f28af67672da4c105ac5)。合并时没有另改文字；[来源清单](review-20261022.sources.json)列出23篇各自的汉字数、Git blob SHA及合并文件SHA256。头部说明与目录不计入小说正文字数。

核心情节审阅见[D路线登记](../../docs/d-route-ending-register.md)，版本与检查见[冻结前核查](../../docs/zh-prepublication-audit-20261014.md)。原作者确认设定仍单列于canon，D路线新增谜底不追认成原作者已批准。

从已取得源提交的仓库重建：

```sh
node scripts/build-review-edition.mjs --source 4dfa7a35f8ba24c91685f28af67672da4c105ac5 --date 2026-10-22
```

脚本只读取指定提交并生成审阅文件/来源清单，不变更正文、发布标记、网页部署或Git历史。后续新候选使用新日期文件，保留R1以便对照；同日重建应使用同一源提交。

## EPUB审阅本

EPUB使用同一份R1来源清单和4dfa7a3正文，包含审阅说明、可跳转目录及23篇独立章节。可重排的横排中文，保留段落、强调和场景分隔；不嵌入字体、脚本或远程资源，字体和主题由阅读软件控制。没有另改小说内容，也未填写未经确认的作者署名、书号或出版机构。

使用Python 3.9以上版本及仓库已有Node环境重建或只验证保存版本：

```sh
python3 scripts/build-review-epub.py --index editions/zh/review-20261022.sources.json
python3 scripts/build-review-epub.py --index editions/zh/review-20261022.sources.json --check
```

脚本逐篇检查不可变提交的blob SHA和Unicode Han字数，并解析包内XML验证全部正文段落、场景分隔、标题、目录、spine顺序及内部链接。`--check`重新构建并比较整个EPUB及检查清单的保存字节；已有文件若不同，默认构建拒绝覆盖，需使用新候选来源索引。

R1 EPUB为421,313字节，SHA256为`99319f899b75155c19e69f731d6a3040ff4ce9cf2792c7f44cf978cbf063564f`；[构建检查清单](review-20261022.epub-checks.json)。使用官方[EPUBCheck 5.4.0](https://github.com/w3c/epubcheck/releases/tag/v5.4.0)执行`--failonwarnings`，0致命错误、0错误、0警告；[原始格式检查报告](review-20261022.epubcheck.json)。报告中的`charsCount`含标点及附加页，不能代替小说Unicode Han口径的206,801汉字。

格式依据：[W3C EPUB规范](https://www.w3.org/TR/epub-33/)。取得官方EPUBCheck工具后，可独立复查：

```sh
java -Duser.timezone=UTC -jar /path/to/epubcheck.jar editions/zh/review-20261022.epub --failonwarnings
```

格式检查不等同于阅读软件视觉验收；Apple Books、Kobo等实际导入及分页尚未验证。无生产站点部署或电子书平台发行，三个核心D路线决定仍待作者审阅。

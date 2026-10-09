# 写作与 Git 版本管理

1. **回读**：先核验项目原稿，不依赖未经确认的对话回忆。
2. **建档**：将确证的设定与大纲分别写进 `01-canon.md` 和 `02-outline.md`。
3. **初稿**：从 `manuscript/zh/00-introduction.md`（引言）开始，按章逐文件写作。
4. **审校**：检查人物、逻辑、文风、节奏、伏笔与前后时间线，记录仍待确认的问题。
5. **定稿**：每章版本留在 Git 提交历史中；修订不应覆盖被作者认可的段落。
6. **网站**：正文稳定后将 Markdown 转成网页版，支持目录、章节切换及移动端阅读。

建议提交消息：`draft: write introduction`、`revise: refine chapter 01`、`docs: update canon`、`web: add reader shell`。

避免将未经核实的另一部小说的内容作为本书的“旧稿”迁入。

# -*- coding: utf-8 -*-
"""gen-deck.py —— 生成国赛答辩 PPT（16:9，可编辑文本/表格）

设计语言与网站一致：深红 #8C1F2A / 鎏金 #C19A4B / 宣纸 #F7F3EC / 墨 #241A12
所有内容都是可编辑文本框与原生表格，方便现场改字。
"""
import os
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
# 预览模式：本机 LibreOffice 预览器对 13.33x7.5 页面有固定 1.5x 放大，
# 用 2/3 缩放的副本做视觉检查（交付件仍是标准 16:9 13.33x7.5）
SCALE = float(os.environ.get('DECK_SCALE', '1'))
SUFFIX = os.environ.get('DECK_SUFFIX', '')


def IN(x):
    return Emu(int(914400 * x))


OUT = os.path.join(OUT_DIR, "非遗共创平台-国赛答辩" + SUFFIX + ".pptx")

RED = RGBColor(0x8C, 0x1F, 0x2A)
GOLD = RGBColor(0xC1, 0x9A, 0x4B)
PAPER = RGBColor(0xF7, 0xF3, 0xEC)
INK = RGBColor(0x24, 0x1A, 0x12)
MUTED = RGBColor(0x6B, 0x5B, 0x48)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
JADE = RGBColor(0x3F, 0x7C, 0x6B)
FONT = "Microsoft YaHei"

CONTENT_W, CONTENT_H = 13.333, 7.5
PAGE_SCALE = float(os.environ.get('DECK_PAGE_SCALE', '1'))
prs = Presentation()
# 页尺寸 = 内容尺寸 x PAGE_SCALE；预览时用 1.5（本机渲染器固定 1.5x 放大）
prs.slide_width = IN(CONTENT_W * PAGE_SCALE)
prs.slide_height = IN(CONTENT_H * PAGE_SCALE)
W, H = IN(CONTENT_W), IN(CONTENT_H)
BLANK = prs.slide_layouts[6]


def set_font(run, size=18, bold=False, color=INK, font=FONT):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font
    # 中文字体也要显式设置，否则 PowerPoint 会用默认宋体
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = rPr.makeelement(qn("a:ea"), {})
        rPr.append(ea)
    ea.set("typeface", font)


def rect(slide, x, y, w, h, fill=None, line=None, line_w=1.0):
    from pptx.enum.shapes import MSO_SHAPE

    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(line_w)
    shp.shadow.inherit = False
    return shp


def text(slide, x, y, w, h, lines, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.15):
    """lines: [(文本, 字号, 加粗, 颜色)] 或 [(文本, 字号, 加粗, 颜色, 段后pt)]"""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    for i, item in enumerate(lines):
        s, size, bold, color = item[0], item[1], item[2], item[3]
        after = item[4] if len(item) > 4 else 0
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(after)
        set_font(p.add_run(), size, bold, color)
        p.runs[0].text = s
    return tb


def page_header(slide, no, title, kicker=""):
    """统一的页眉：左侧金色竖线 + 章节 + 标题"""
    rect(slide, 0, 0, W, IN(0.06), fill=RED)
    rect(slide, IN(0.55), IN(0.42), IN(0.055), IN(0.62), fill=GOLD)
    if kicker:
        text(slide, IN(0.78), IN(0.40), IN(9.0), IN(0.26), [(kicker, 11, False, MUTED)])
        text(slide, IN(0.78), IN(0.66), IN(10.6), IN(0.5), [(title, 25, True, RED)])
    else:
        text(slide, IN(0.78), IN(0.5), IN(10.6), IN(0.6), [(title, 26, True, RED)])
    text(slide, W - IN(1.1), IN(0.5), IN(0.6), IN(0.3), [(f"{no:02d}", 12, True, GOLD)], align=PP_ALIGN.RIGHT)


def footer(slide, note="河南省非物质文化遗产共创平台 · 传智杯 AI WEB 网页开发挑战赛"):
    rect(slide, IN(0.55), H - IN(0.52), W - IN(1.1), Pt(0.75), fill=RGBColor(0xE3, 0xD8, 0xC4))
    text(slide, IN(0.55), H - IN(0.45), IN(9.6), IN(0.3), [(note, 9, False, MUTED)])


def takeaway(slide, msg, color=None):
    """页面底部的"一句话结论"条：把空白填成信息"""
    y = H - IN(1.28)
    rect(slide, IN(0.55), y, W - IN(1.1), IN(0.62), fill=PAPER)
    rect(slide, IN(0.55), y, Pt(2.6), IN(0.62), fill=color or GOLD)
    text(slide, IN(0.75), y + IN(0.14), W - IN(1.5), IN(0.4), [(msg, 11.5, True, INK)])


def kpi(slide, x, y, w, h, num, label, color=RED):
    rect(slide, x, y, w, h, fill=PAPER)
    rect(slide, x, y, Pt(2.6), h, fill=color)
    text(slide, x + IN(0.16), y + IN(0.12), w - IN(0.24), IN(0.44), [(num, 24, True, color)])
    text(slide, x + IN(0.16), y + IN(0.56), w - IN(0.24), IN(0.5), [(label, 10.5, False, MUTED)])


def table(slide, x, y, w, rows, col_widths=None, font_size=11, head_fill=RED):
    n_rows, n_cols = len(rows), len(rows[0])
    h = IN(0.34) * n_rows
    gt = slide.shapes.add_table(n_rows, n_cols, x, y, w, h).table
    if col_widths:
        total = sum(col_widths)
        for i, cw in enumerate(col_widths):
            gt.columns[i].width = int(w * cw / total)
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = gt.cell(r, c)
            cell.text = ""
            cell.margin_left = IN(0.07)
            cell.margin_right = IN(0.05)
            cell.margin_top = IN(0.02)
            cell.margin_bottom = IN(0.02)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            cell.fill.fore_color.rgb = head_fill if r == 0 else (WHITE if r % 2 else PAPER)
            p = cell.text_frame.paragraphs[0]
            run = p.add_run()
            run.text = str(val)
            set_font(run, font_size, bold=(r == 0), color=WHITE if r == 0 else INK)
    return gt


# ============ 1. 封面 ============
s = prs.slides.add_slide(BLANK)
rect(s, 0, 0, W, H, fill=RGBColor(0x2A, 0x0E, 0x11))
rect(s, 0, 0, W, IN(0.10), fill=GOLD)
rect(s, IN(0.9), IN(2.05), IN(0.06), IN(1.9), fill=GOLD)
text(s, IN(1.15), IN(1.95), IN(10.5), IN(0.5), [("传智杯 · AI WEB 网页开发挑战赛 · 国赛作品题", 13, False, GOLD)])
text(s, IN(1.15), IN(2.42), IN(11.0), IN(0.9), [("河南省非物质文化遗产共创平台", 40, True, WHITE)])
text(
    s,
    IN(1.15),
    IN(3.42),
    IN(10.6),
    IN(0.6),
    [("把「非遗知识 → AI 问答 → AI 拆解任务 → 真实共创项目」串成一条闭环", 17, False, RGBColor(0xE8, 0xD9, 0xB8))],
)
text(s, IN(1.15), IN(4.55), IN(6.2), IN(1.2), [
    ("团队：（待填写）", 13, False, RGBColor(0xC9, 0xB8, 0x9A), 6),
    ("学校：（待填写）　　指导教师：（待填写）", 13, False, RGBColor(0xC9, 0xB8, 0x9A), 6),
    ("在线演示：（待填写）　　仓库：（待填写）", 13, False, RGBColor(0xC9, 0xB8, 0x9A)),
])
text(s, W - IN(4.2), IN(6.55), IN(3.6), IN(0.4), [("49 个项目 · 506 知识片段 · 5 个 AI 工具", 11, False, GOLD)], align=PP_ALIGN.RIGHT)

# ============ 2. 痛点 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 2, "真实痛点：非遗不缺内容，缺的是「能落地的协作」", "PROBLEM")
rows = [
    ["角色", "现状", "卡在哪", "我们怎么解"],
    ["传承人", "有手艺、有故事", "不会写方案、找不到设计师、年长者数字化能力弱", "AI 一句话生成可发布方案"],
    ["设计师 / 学生", "想做非遗文创", "考据 3-5 天、纹样配色不敢用、怕文化表达出错", "结构化资料 + 检索问答 + 取材项目配色的纹样生成"],
    ["公众 / 机构", "只能「看展览」", "参与门槛高；文旅局、学校缺成体系素材", "问答 / 以图搜非遗 / 活动报名 / 可检索项目库"],
]
table(s, IN(0.55), IN(1.55), W - IN(1.1), rows, col_widths=[1.5, 2.0, 4.2, 4.0], font_size=11.5)
text(s, IN(0.55), IN(3.3), W - IN(1.1), IN(1.4), [
    ("关键判断：非遗数字化的瓶颈不在「资料太少」，而在「资料无法直接变成可执行的协作」。", 15, True, RED, 8),
    ("所以我们做的不是「给非遗加一个聊天框」，而是让 AI 的输出直接落进业务流程：AI 生成的任务清单，点一下就是一个真实存在的共创项目。", 13, False, MUTED),
])
footer(s)
takeaway(s, "一句话：非遗不缺内容，缺的是把内容变成协作的人与流程 —— 我们用 AI 补这一段。")

# ============ 3. 产品全景 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 3, "产品全景：一条闭环，四个 AI 能力", "SOLUTION")
flow = [
    ("非遗知识库", "49 项目 / 506 片段"),
    ("RAG 问答", "带检索依据"),
    ("Agent 拆解", "5 工具 · 可追溯"),
    ("共创项目", "真实发布 / 协作"),
    ("作品与授权", "可分成"),
]
x0, y0, bw, gap = IN(0.62), IN(1.62), IN(2.28), IN(0.22)
for i, (t1, t2) in enumerate(flow):
    x = x0 + i * (bw + gap)
    rect(s, x, y0, bw, IN(1.02), fill=PAPER)
    rect(s, x, y0, bw, Pt(3), fill=GOLD if i < 3 else JADE)
    text(s, x + IN(0.12), y0 + IN(0.14), bw - IN(0.2), IN(0.34), [(t1, 13.5, True, RED)])
    text(s, x + IN(0.12), y0 + IN(0.55), bw - IN(0.2), IN(0.36), [(t2, 10, False, MUTED)])
    if i < len(flow) - 1:
        text(s, x + bw - IN(0.02), y0 + IN(0.3), IN(0.24), IN(0.3), [("→", 15, True, GOLD)])

cards = [
    ("① RAG 知识问答", "506 片段 · BM25 + 四层加权 · 引用可点", "Top-1 100%"),
    ("② 共创 Agent", "5 工具真实执行 · 轨迹逐步可见", "5/5 目标识别"),
    ("③ 端侧多模态", "72 维特征以图搜非遗 · 纹样生成可下载", "图片不上传"),
    ("④ 安全可控", "注入/越界拦截 · 输出裁剪 · AI 标识", "8 个单测"),
]
cx, cy = IN(0.62), IN(3.05)
cw, ch, cg = IN(5.98), IN(1.32), IN(0.18)
for i, (t1, t2, badge) in enumerate(cards):
    x = cx + (i % 2) * (cw + cg)
    y = cy + (i // 2) * (ch + cg)
    rect(s, x, y, cw, ch, fill=WHITE, line=RGBColor(0xE3, 0xD8, 0xC4))
    text(s, x + IN(0.18), y + IN(0.14), cw - IN(1.8), IN(0.34), [(t1, 14, True, RED)])
    text(s, x + IN(0.18), y + IN(0.55), cw - IN(0.36), IN(0.6), [(t2, 10.5, False, MUTED)])
    text(s, x + cw - IN(1.72), y + IN(0.16), IN(1.56), IN(0.34), [(badge, 10, True, JADE)], align=PP_ALIGN.RIGHT)
footer(s)

# ============ 4. Demo 路线 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 4, "现场演示路线（90 秒）", "DEMO")
steps = [
    ("0:00-0:15", "首页", "点统计数字进项目库，展示 49 个项目与分类卡片"),
    ("0:15-0:35", "AI 问答", "问「豫剧唱腔特点」→ 文字逐字出现 + 命中片段 + 依据 chip"),
    ("0:35-1:05", "AI 实验室 · Agent", "输入「把钧瓷做成文创」→ 5 步工具轨迹实时出现"),
    ("1:05-1:20", "一键发布", "方案 → 发布为共创项目 → 跳到详情页（招募中）"),
    ("1:20-1:35", "多模态两连", "以图搜非遗 + 纹样生成（下载 PNG）"),
]
yy = IN(1.55)
for i, (t, title, desc) in enumerate(steps):
    rect(s, IN(0.62), yy, IN(12.1), IN(0.92), fill=WHITE if i % 2 == 0 else PAPER)
    text(s, IN(0.78), yy + IN(0.26), IN(1.15), IN(0.34), [(t, 11, True, GOLD)])
    text(s, IN(2.05), yy + IN(0.16), IN(2.5), IN(0.34), [(title, 13.5, True, RED)])
    text(s, IN(4.55), yy + IN(0.2), IN(8.0), IN(0.6), [(desc, 11, False, INK)])
    yy += IN(1.0)
text(s, IN(0.62), IN(6.55), IN(12.1), IN(0.5), [
    ("演示保险：无 Key / 断网 / 后端未启动三种情况都有兜底（本地知识库 · 离线演示模式 · 页面内置 KB），现场不会白屏。", 11.5, True, JADE)
])
footer(s)

# ============ 5. RAG ============
s = prs.slides.add_slide(BLANK)
page_header(s, 5, "AI 技术 ①：可解释的 RAG", "AI · RAG 6%")
kpi(s, IN(0.55), IN(1.5), IN(2.35), IN(1.1), "100%", "Top-1 命中率（22/22）")
kpi(s, IN(3.05), IN(1.5), IN(2.35), IN(1.1), "100%", "越界题正确拒答（3/3）", JADE)
kpi(s, IN(5.55), IN(1.5), IN(2.35), IN(1.1), "1.08ms", "平均检索耗时")
kpi(s, IN(8.05), IN(1.5), IN(2.35), IN(1.1), "506", "知识片段（语义切片）", MUTED)
kpi(s, IN(10.55), IN(1.5), IN(2.2), IN(1.1), "24 题", "自建评测集（可复现）", MUTED)
rows = [
    ["环节", "做法", "为什么这样做"],
    ["切片", "按语义单元切：基本信息 / 介绍 / 源流 / 工艺 / 看点 / 传承人", "引用能精确到「豫剧·技艺看点」"],
    ["检索", "BM25（k1=1.5, b=0.75）+ 中文 bigram 切词", "小语料下可解释，不依赖 embedding 服务"],
    ["加权", "上下文 ×1.35 · 分类意图 ×1.8 · 项目名 ×1.5 · 热门度 ×1.18", "问「有哪些戏曲」时同类一起进候选"],
    ["闸门", "无非遗实体且最高分 < 10 → 不返回依据", "越界问题不硬凑，杜绝编造"],
]
table(s, IN(0.55), IN(2.95), W - IN(1.1), rows, col_widths=[1.1, 6.2, 4.7], font_size=11)
footer(s)
takeaway(s, "结论：检索效果是可量化的（Top-1 / Top-3 / 拒答率）；越界问题宁可说不知道，也不硬凑依据。")

# ============ 6. Agent ============
s = prs.slides.add_slide(BLANK)
page_header(s, 6, "AI 技术 ②：Agent 会自己选工具，也能解释每一步", "AI · Agent 8%")
text(s, IN(0.55), IN(1.45), IN(6.4), IN(0.4), [("5 个工具（JSON Schema 声明，真实执行）", 13.5, True, RED)])
rows = [
    ["工具", "作用"],
    ["search_heritage", "检索非遗项目（名称优先）"],
    ["get_heritage_detail", "取工艺流程 / 传承人"],
    ["list_related_works", "查同题材作品，避免撞车"],
    ["suggest_tasks", "按工艺拆任务 + 推荐角色"],
    ["draft_project_brief", "起草可发布的方案"],
]
table(s, IN(0.55), IN(1.9), IN(6.3), rows, col_widths=[2.3, 4.0], font_size=10.5)
text(s, IN(7.25), IN(1.45), IN(5.5), IN(0.4), [("两种规划器，一套接口", 13.5, True, RED)])
rows2 = [
    ["模式", "触发条件", "特点"],
    ["规则编排", "无 API Key（默认）", "确定可复现 · 220ms/步"],
    ["LLM 自主", "配置 QWEN_API_KEY", "模型自主决定调用哪个工具"],
]
table(s, IN(7.25), IN(1.9), IN(5.5), rows2, col_widths=[1.3, 2.0, 2.6], font_size=10.5)
text(s, IN(0.55), IN(4.45), W - IN(1.1), IN(2.0), [
    ("轨迹协议（前端逐步渲染，可逐条核对）：", 12, True, INK, 4),
    ("{ index, thought, tool, toolTitle, args, observation, durationMs, by }", 11, False, MUTED, 10),
    ("· 任何一步失败或模型漏调用 → 自动补齐 / 回落规则模式，演示不中断（4 个单测覆盖：自主选工具、偷懒补齐、未知工具、网络失败回落）", 11, False, JADE, 4),
    ("· 同一套工具同时以 MCP 协议暴露（POST /api/mcp：initialize / tools/list / tools/call），第三方 Agent 可直连", 11, False, JADE),
])
footer(s)
takeaway(s, "关键：不配 Key 也能演示（规则模式），配了 Key 就交给模型决策 —— 两条路共用同一套工具与轨迹。")

# ============ 7. 多模态 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 7, "AI 技术 ③：多模态都在端侧跑", "AI · 多模态 5%")
text(s, IN(0.55), IN(1.5), IN(6.0), IN(0.4), [("以图搜非遗：72 维特征，图片不出本机", 13.5, True, RED)])
rows = [
    ["分量", "维度", "表示什么"],
    ["4×4 网格平均 RGB", "48", "主色与配色分布"],
    ["4×4 网格边缘能量", "16", "纹理与结构密度"],
    ["8 桶亮度直方图", "8", "明暗对比"],
]
table(s, IN(0.55), IN(1.95), IN(6.0), rows, col_widths=[2.4, 1.0, 2.6], font_size=10.5)
text(s, IN(0.55), IN(3.35), IN(6.0), IN(0.9), [
    ("sim = clamp(1 − d / 1.15)，d 为 L2 归一化后的欧氏距离", 11, False, MUTED, 4),
    ("早期用余弦相似度时结果全部落在 92-100%，无法区分 → 改距离后区分度正常。", 10.5, False, MUTED),
])
text(s, IN(6.95), IN(1.5), IN(5.8), IN(0.4), [("纹样生成：把非遗配色变成可下载的图", 13.5, True, RED)])
rows2 = [
    ["构图", "算法要点", "真实用途"],
    ["四方连续", "网格母题 + 菱形骨架 + 斜纹底", "织物 / 包装底纹"],
    ["团花", "三层放射阵列 + 四角折枝", "陶瓷 / 刺绣主纹"],
    ["折枝", "贝塞尔枝干 + 沿枝生叶 + 印章", "年画 / 书签边角"],
]
table(s, IN(6.95), IN(1.95), IN(5.8), rows2, col_widths=[1.3, 2.9, 1.6], font_size=10.5)
text(s, IN(6.95), IN(3.35), IN(5.8), IN(1.2), [
    ("• 色板取自目标项目的渐变主色 + 鎏金/宣纸/墨色", 10.5, False, MUTED, 3),
    ("• mulberry32(hash(id+style+seed)) 驱动，同种子同图，可迭代", 10.5, False, MUTED, 3),
    ("• 全程 Canvas，零外部 API，断网可用（对应赛项「鼓励端侧 AI 推理」）", 10.5, False, JADE),
])
rect(s, IN(0.55), IN(4.55), W - IN(1.1), IN(1.75), fill=PAPER)
text(s, IN(0.78), IN(4.72), W - IN(1.5), IN(1.45), [
    ("为什么不做「上传图片到大模型」？", 12, True, RED, 4),
    ("① 隐私：图片根本不出浏览器，无需用户同意授权；② 成本与延迟：端侧 5ms 出结果，无 token 费用；", 11, False, INK, 2),
    ("③ 可用性：县域文化馆网络差、评审现场网络不可控 —— 端侧方案在这些场景里才是「能用」的。", 11, False, INK),
])
footer(s)
takeaway(s, "取舍：端侧方案牺牲一点精度上限，换来隐私、零成本与断网也能演示的确定性。")

# ============ 8. 安全 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 8, "AI 技术 ④：安全与可控（每条都有测试）", "AI · 安全 4%")
rows = [
    ["层", "措施", "验证"],
    ["输入", "提示词注入（中/英）· 越界话题 · 隐私信息 · 超长（>500 字）四类拦截", "4 个单测"],
    ["检索", "实体闸门：无非遗实体不返回依据", "1 个单测"],
    ["生成", "Prompt 硬约束：只依据上下文，不足则明说，禁止编造人名年代", "人工评审 + 引用核对"],
    ["输出", "敏感词替换 · 长度裁剪（≤1200 字）· 统一附 AI 标识", "2 个单测"],
    ["频控", "全局 300 次/15min；/api/auth 60 次/15min（可用性校验不计数）", "压测手测"],
]
table(s, IN(0.55), IN(1.5), W - IN(1.1), rows, col_widths=[1.0, 8.6, 2.4], font_size=11)
text(s, IN(0.55), IN(3.55), IN(6.0), IN(0.4), [("降级矩阵：现场演示不断链的关键", 13.5, True, RED)])
rows2 = [
    ["故障", "行为"],
    ["无 QWEN_API_KEY", "走本地知识库，标注来源"],
    ["大模型超时 15s", "中止流式，改本地知识库"],
    ["后端未启动", "前端切离线演示（内置示例数据）"],
    ["断网", "保留已渲染内容 + 提示"],
]
table(s, IN(0.55), IN(4.0), IN(6.0), rows2, col_widths=[2.2, 3.8], font_size=10.5)
rect(s, IN(6.95), IN(3.55), IN(5.8), IN(2.35), fill=PAPER)
text(s, IN(7.15), IN(3.72), IN(5.4), IN(2.0), [
    ("一个具体设计：引用不交给模型", 12, True, RED, 5),
    ("很多项目让模型自己生成引用编号，模型会编。", 11, False, INK, 3),
    ("我们的引用由后端 toCitations() 从真实命中片段生成，", 11, False, INK, 2),
    ("模型只负责「基于资料写话」。这样「依据」永远可点、可核对。", 11, False, JADE),
])
footer(s)

# ============ 9. 工程 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 9, "工程质量：可复核，不靠形容词", "ENGINEERING 10%")
kpi(s, IN(0.55), IN(1.5), IN(2.3), IN(1.05), "30", "单元测试全绿")
kpi(s, IN(2.98), IN(1.5), IN(2.3), IN(1.05), "0", "ESLint 错误/告警")
kpi(s, IN(5.41), IN(1.5), IN(2.3), IN(1.05), "0", "tsc 类型错误", JADE)
kpi(s, IN(7.84), IN(1.5), IN(2.3), IN(1.05), "-49.8%", "图片体积（11.1→5.6MB）")
kpi(s, IN(10.27), IN(1.5), IN(2.5), IN(1.05), "0", "20 页面 JS 报错", JADE)
rows = [
    ["层", "职责", "约束"],
    ["routes", "接口与参数校验", "不写 SQL、不写业务分支"],
    ["services", "业务编排（AI 5 个服务）", "纯函数优先，便于单测"],
    ["repositories", "SQL 唯一入口", "23 张表、全部参数化"],
    ["前端", "零构建原生 JS + 类型检查", "ESLint + Prettier + tsc(checkJs) + CI"],
]
table(s, IN(0.55), IN(2.85), W - IN(1.1), rows, col_widths=[1.6, 5.2, 5.2], font_size=11)
text(s, IN(0.55), IN(4.85), IN(12.1), IN(1.4), [
    ("一条命令自检（评委可复现）：npm run verify → 页面完整性 / ESLint / Prettier / tsc / 30 单测 / RAG 评测 / PDF 页数 / 接口健康，8 项全过 exit 0。", 12, True, INK, 4),
    ("取舍要说清：前端是零构建（放弃 TS 编写与打包），换来 git clone 后 node server.js 直接跑；代价是「TypeScript 规范使用」这一项只做到类型检查，未做到用 TS 编写。", 11, False, MUTED),
])
footer(s)
takeaway(s, "可复核：npm run verify 一条命令跑完 8 项检查（页面引用 / lint / 格式 / 类型 / 单测 / 评测 / PDF / 接口）。")

# ============ 10. 数据 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 10, "数据与证据", "EVIDENCE")
text(s, IN(0.55), IN(1.45), IN(6.0), IN(0.4), [("RAG / Agent 评测（backend/scripts/eval-rag.js）", 13, True, RED)])
rows = [
    ["指标", "结果"],
    ["Top-1 命中率", "100%（22/22）"],
    ["Top-3 命中率", "100%（22/22）"],
    ["越界题正确拒答", "100%（3/3）"],
    ["回答关键词覆盖", "100%（16/16）"],
    ["平均检索耗时", "1.08 ms"],
    ["Agent 目标识别 + 方案完整", "5/5"],
]
table(s, IN(0.55), IN(1.9), IN(5.6), rows, col_widths=[3.2, 2.4], font_size=11)
text(s, IN(6.55), IN(1.45), IN(6.2), IN(0.4), [("性能与体积", 13, True, RED)])
rows2 = [
    ["项", "优化前", "优化后"],
    ["站点图片总量", "11.08 MB", "5.56 MB"],
    ["单张卡片图", "~190 KB", "~69 KB"],
    ["传承人头像", "~120 KB", "~26 KB"],
    ["静态资源缓存", "全部 no-cache", "版本化 immutable + HTML no-cache"],
    ["首页 DOMContentLoaded", "—", "≈ 80 ms"],
]
table(s, IN(6.55), IN(1.9), IN(6.2), rows2, col_widths=[2.3, 1.7, 2.6], font_size=10.5)
rect(s, IN(0.55), IN(5.05), W - IN(1.1), IN(1.35), fill=PAPER)
text(s, IN(0.75), IN(5.2), W - IN(1.5), IN(1.1), [
    ("这份数字的边界（主动说清，比被问出来好）：评测集只有 24 题、关键词是弱标注、3 道分类题按「命中同类」计分。", 11.5, True, INK, 3),
    ("它能证明「检索与编排在真实数据上是通的」，不能证明统计显著性。下一步扩到 100+ 题并双人标注。", 11, False, MUTED),
])
footer(s)
takeaway(s, "一句话：数字不算大，但每一条都能自己跑出来复现 —— 这比漂亮的形容词有用。")

# ============ 11. 社会价值与商业 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 11, "社会价值与商业路径", "VALUE 10%")
rows = [
    ["阶段", "收入形式", "单价", "前提"],
    ["① 撮合服务（0-12 月）", "项目服务费 / 撮合佣金 10-15%", "800-3000 元/项目", "与 1-2 个县区文化馆、1 所高校签约"],
    ["② 授权与分成（12-24 月）", "IP 授权金 + 销售分成", "3000-2 万 / 分成 3-8%", "纹样与作品版权登记"],
    ["③ 工具与数据（24 月+）", "机构 SaaS 订阅 / 内容授权", "2-8 万/年", "知识库与素材规模化"],
]
table(s, IN(0.55), IN(1.5), W - IN(1.1), rows, col_widths=[2.6, 3.4, 2.6, 3.4], font_size=10.5)
text(s, IN(0.55), IN(3.7), IN(6.0), IN(0.4), [("单位经济模型（试点估算）", 13, True, RED)])
text(s, IN(0.55), IN(4.15), IN(6.0), IN(1.6), [
    ("一个地市（如许昌·钧瓷）年服务 20 个共创项目", 11.5, False, INK, 3),
    ("→ 服务费 20×1500 = 3 万元；带动 5 件授权 ×4000 = 2 万元", 11.5, False, INK, 3),
    ("→ 年营收 ≈ 5 万元，成本 ≈ 1.5 万元（服务器 + 兼职运营），毛利 ≈ 70%", 11.5, True, JADE),
])
text(s, IN(6.95), IN(3.7), IN(5.8), IN(0.4), [("社会价值", 13, True, RED)])
text(s, IN(6.95), IN(4.15), IN(5.8), IN(1.6), [
    ("· 让县域传承人被看见：零门槛发出邀约", 11.5, False, INK, 3),
    ("· 让年轻人以「做项目」而非「看展览」接触非遗", 11.5, False, INK, 3),
    ("· 数字资产（纹样、工艺影像）沉淀为公共文化资源", 11.5, False, INK, 3),
    ("· 离线优先：适配县域真实网络条件", 11.5, False, JADE),
])
footer(s)

# ============ 12. 预期问答 ============
s = prs.slides.add_slide(BLANK)
page_header(s, 12, "评委可能问的三个问题（我们的答法）", "Q & A")
qa = [
    ("Q1　你的 AI 和直接调 ChatGPT 有什么不同？",
     "知识库自建（49 项目 / 506 片段）+ 回答必带可点依据 + 无 Key 也能跑；更关键的是 AI 产出直接写进业务：Agent 的任务清单点一下就是真实项目。"),
    ("Q2　为什么不用向量检索 / 现代前端框架？",
     "语料只有 506 片段，BM25 召回够用且完全可解释（能显示命中片段与分数），不引入 embedding 依赖；前端零构建是为了「评审拉下来就能跑」。代价我认：TS 只做到类型检查，向量化列在下一步。"),
    ("Q3　如果大模型挂了 / 断网了怎么办？",
     "四层兜底：Prompt 约束 → 本地知识库 → 离线演示模式 → 页面内置 KB。评测与演示都不依赖外部 API 的可用性。"),
]
yy = IN(1.5)
for q, a in qa:
    rect(s, IN(0.55), yy, W - IN(1.1), IN(1.55), fill=WHITE, line=RGBColor(0xE3, 0xD8, 0xC4))
    text(s, IN(0.75), yy + IN(0.12), W - IN(1.5), IN(0.36), [(q, 13, True, RED)])
    text(s, IN(0.75), yy + IN(0.55), W - IN(1.5), IN(0.9), [(a, 11.5, False, INK)])
    yy += IN(1.68)
footer(s)

# ============ 13. 收尾 ============
s = prs.slides.add_slide(BLANK)
rect(s, 0, 0, W, H, fill=RGBColor(0x2A, 0x0E, 0x11))
rect(s, 0, 0, W, IN(0.10), fill=GOLD)
text(s, IN(1.0), IN(2.2), IN(11.3), IN(0.9), [("让手艺被看见，让创意有落点", 34, True, WHITE)])
text(s, IN(1.0), IN(3.25), IN(11.3), IN(0.5), [("下一步：TypeScript 迁移 · 端侧向量检索 · 100+ 题评测集 · 3 个地市试点", 14, False, RGBColor(0xE8, 0xD9, 0xB8))])
rect(s, IN(1.0), IN(4.05), IN(2.2), Pt(2), fill=GOLD)
text(s, IN(1.0), IN(4.4), IN(11.3), IN(1.2), [
    ("在线演示：（待填写）", 12, False, RGBColor(0xC9, 0xB8, 0x9A), 3),
    ("代码仓库：（待填写）　评审账号：reviewer / （待填写）", 12, False, RGBColor(0xC9, 0xB8, 0x9A), 3),
    ("技术文档：技术文档.pdf（16 页）　自检：npm run verify", 12, False, RGBColor(0xC9, 0xB8, 0x9A)),
])
text(s, W - IN(3.2), H - IN(0.75), IN(2.6), IN(0.4), [("谢谢评审老师", 13, True, GOLD)], align=PP_ALIGN.RIGHT)

prs.save(OUT)
print("saved:", OUT)
print("slides:", len(prs.slides.__iter__.__self__._sldIdLst))

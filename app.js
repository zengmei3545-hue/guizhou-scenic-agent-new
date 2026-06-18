/* 贵州景区智能体 · 交互原型（纯前端，无后端） */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- 微交互：ripple ----------
function addRipple(e) {
  const btn = e.currentTarget;
  const r = document.createElement("span");
  r.className = "ripple";
  const rect = btn.getBoundingClientRect();
  const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left;
  const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top;
  r.style.left = `${x}px`;
  r.style.top = `${y}px`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 520);
}

function bindRipple() {
  $$("button").forEach((btn) => {
    if (btn.dataset.noRipple === "1") return;
    btn.addEventListener("pointerdown", addRipple, { passive: true });
  });
}

// ---------- Tabs / Views ----------
const views = {
  agent: $("#view-agent"),
  now: $("#view-now"),
  noticeList: $("#view-notice-list"),
  noticeDetail: $("#view-notice-detail"),
  guideDetail: $("#view-guide-detail"),
  guideUpload: $("#view-guide-upload"),
  suggestDetail: $("#view-suggest-detail"),
  rankDetail: $("#view-rank-detail"),
  profile: $("#view-profile"),
  profileList: $("#view-profile-list"),
  goods: $("#view-goods"),
  tour: $("#view-tour"),
  mapNav: $("#view-map-nav"),
};

let activeView = "agent";
let agentHomeMode = "dock"; // dock | input
let previousTopbarSourceView = "agent";
let currentProfileListType = "published";
let currentProfilePublishStatus = "public";

function switchView(next) {
  if (!views[next] || next === activeView) return;

  const prev = activeView;
  if (next !== "guideUpload") closeTagSheet();
  if (["now", "noticeList", "noticeDetail", "guideDetail", "guideUpload", "suggestDetail", "rankDetail", "profile", "profileList", "goods", "tour", "mapNav"].includes(next)) previousTopbarSourceView = prev;
  activeView = next;

  views[prev].classList.remove("isActive");
  views[next].classList.add("isActive");

  $$(".tab").forEach((t) => t.classList.toggle("isOn", t.dataset.go === next));

  // 轻微的入场动效：滚到顶部 + 入场弹性
  views[next].scrollTo({ top: 0, behavior: "smooth" });
  views[next].animate(
    [
      { transform: "translate3d(0, 16px, 0) scale(.985)", opacity: 0 },
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
    ],
    { duration: 360, easing: "cubic-bezier(.2,.9,.2,1)" }
  );

  syncAgentHomeSurface();
  syncTopbarByView();
  syncTourSurface();
}

$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    const go = t.dataset.go;
    // 智能体首页：点击底导左侧头像圈（第一个tab）用于切换“底导/输入框”
    if (go === "agent" && activeView === "agent") {
      setAgentHomeMode(agentHomeMode === "input" ? "dock" : "input");
      return;
    }
    switchView(go);
  })
);

// ---------- Toast ----------
const toast = $("#toast");
let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add("isOn");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("isOn"), 1600);
}

// ---------- helpers ----------
function getTimeLabel() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getPublishTimeLabel() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}年${MM}月${dd}日 ${hh}:${mm}`;
}

function setupCarousel(trackEl, indicatorEl, images) {
  if (!trackEl || !indicatorEl) return;
  const imgs = (images || []).slice(0, 9);
  indicatorEl.textContent = `1/${Math.max(1, imgs.length)}`;
  trackEl.innerHTML = imgs
    .map(
      (src) =>
        `<div class="noteSlide" data-src="${src}">` +
        `<img class="noteSlideBg" src="${src}" alt="" aria-hidden="true" />` +
        `<img class="noteSlideImg" src="${src}" alt="" />` +
        `</div>`
    )
    .join("");

  // 多尺寸适配规则（接近小红书）：默认裁切填充；过宽/过长则改为 contain + 模糊背景托底
  const containerRatio = 3 / 4; // width / height
  $$(".noteSlide", trackEl).forEach((slide) => {
    const src = slide.dataset.src;
    const img = new Image();
    img.onload = () => {
      const r = img.naturalWidth / (img.naturalHeight || 1);
      // 过宽（横图）或过长（极竖图）→ contain
      const shouldContain = r > 0.95 || r < 0.58 || Math.abs(r - containerRatio) > 0.45;
      slide.classList.toggle("isContain", shouldContain);
    };
    img.src = src;
  });

  trackEl.scrollLeft = 0;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const w = trackEl.clientWidth || 1;
      const idx = Math.min(imgs.length - 1, Math.max(0, Math.round(trackEl.scrollLeft / w)));
      indicatorEl.textContent = `${idx + 1}/${imgs.length}`;
      ticking = false;
    });
  };
  trackEl.removeEventListener("scroll", onScroll);
  trackEl.addEventListener("scroll", onScroll, { passive: true });
}

// ---------- 智能体首页：底导 / 输入框 双状态 ----------
const agentModeToggle = $("#agentModeToggle");
const agentModeToggleIcon = $("#agentModeToggleIcon");
const btnScenicSwitch = $("#btnScenicSwitch");
const btnLanguage = $("#btnLanguage");
const btnProfile = $("#btnProfile");
const scenicName = document.querySelector(".scenicName");
const scenicArrow = document.querySelector(".scenicArrow");
const scenicMenuIcon = document.querySelector(".scenicMenu .i");

function syncTopbarByView() {
  document.body.classList.remove(
    "topbar-now-mode",
    "topbar-goods-mode",
    "goods-view",
    "tour-view",
    "map-nav-view",
    "guide-upload-view",
    "subpage-view"
  );
  if (!scenicName || !scenicArrow || !btnScenicSwitch || !scenicMenuIcon) return;

  if (["now", "tour", "mapNav", "noticeList", "noticeDetail", "guideDetail", "guideUpload", "suggestDetail", "rankDetail", "profile", "profileList"].includes(activeView)) {
    scenicName.textContent =
      activeView === "now" ? "此刻" :
      activeView === "tour" ? "伴游地图" :
      activeView === "mapNav" ? "地图导航" :
      activeView === "noticeList" ? "智能快讯" :
      activeView === "noticeDetail" ? "快讯详情" :
      activeView === "guideDetail" ? "动线攻略" :
      activeView === "guideUpload" ? "发布攻略" :
      activeView === "suggestDetail" ? "建议详情" :
      activeView === "rankDetail" ? "标记点详情" :
      activeView === "profile" ? "个人中心" : ($("#profileListTitle")?.textContent || "我的内容");
    scenicArrow.style.display = "none";
    scenicMenuIcon.className = "i i-back";
    btnScenicSwitch.setAttribute("aria-label", "返回来源页面");
    document.body.classList.add("topbar-now-mode");
    if (activeView === "tour") document.body.classList.add("tour-view", "subpage-view");
    if (activeView === "mapNav") document.body.classList.add("map-nav-view", "subpage-view");
    if (activeView === "guideUpload") document.body.classList.add("guide-upload-view");
    if (["noticeList", "noticeDetail", "guideDetail", "guideUpload", "suggestDetail", "rankDetail", "profile", "profileList"].includes(activeView)) document.body.classList.add("subpage-view");
    return;
  }

  if (activeView === "goods") {
    scenicName.textContent = "景区优选";
    scenicArrow.style.display = "none";
    scenicMenuIcon.className = "i i-back";
    btnScenicSwitch.setAttribute("aria-label", "返回来源页面");
    document.body.classList.add("topbar-goods-mode", "goods-view", "subpage-view");
    return;
  }

  scenicName.textContent = "黄果树瀑布";
  scenicArrow.style.display = "";
  scenicMenuIcon.className = "i i-menu";
  btnScenicSwitch.setAttribute("aria-label", "切换景区");
}

function bindSuggestStack() {
  $$(".suggestGrid").forEach((grid) => {
    const cards = $$(".suggestCard", grid);
    if (cards.length <= 1) return;

    let activeIndex = 0;
    let autoTimer = null;
    let startX = 0;
    let deltaX = 0;
    let isDragging = false;
    let suppressClick = false;
    let startTarget = null;

    const getStateClass = (index) => {
      const total = cards.length;
      const delta = (index - activeIndex + total) % total;
      if (delta === 0) return "isActive";
      if (delta === 1) return "isNext";
      if (delta === total - 1) return "isPrev";
      return delta < total / 2 ? "isHiddenRight" : "isHiddenLeft";
    };

    const getTransform = (state, dragOffset = 0) => {
      const isNarrow = window.innerWidth <= 360;
      const side = isNarrow ? 92 : 106;
      const hidden = isNarrow ? 132 : 146;
      if (state === "isActive") return `translateX(calc(-50% + ${dragOffset}px)) scale(1) rotate(0deg)`;
      if (state === "isPrev") return `translateX(calc(-50% - ${side}px + ${dragOffset * 0.35}px)) scale(.92) rotate(-5deg)`;
      if (state === "isNext") return `translateX(calc(-50% + ${side}px + ${dragOffset * 0.35}px)) scale(.92) rotate(5deg)`;
      if (state === "isHiddenLeft") return `translateX(calc(-50% - ${hidden}px)) scale(.88) rotate(-8deg)`;
      return `translateX(calc(-50% + ${hidden}px)) scale(.88) rotate(8deg)`;
    };

    const render = (dragOffset = 0) => {
      cards.forEach((card, index) => {
        const state = getStateClass(index);
        card.classList.remove("isActive", "isPrev", "isNext", "isHiddenLeft", "isHiddenRight");
        card.classList.add(state);
        card.style.transition = isDragging ? "none" : "";
        card.style.transform = dragOffset !== 0 || isDragging ? getTransform(state, dragOffset) : "";
      });
    };

    const goTo = (nextIndex) => {
      activeIndex = (nextIndex + cards.length) % cards.length;
      render();
    };

    const startAuto = () => {
      clearInterval(autoTimer);
      autoTimer = setInterval(() => {
        if (activeView !== "now") return;
        goTo(activeIndex + 1);
      }, 2600);
    };

    grid.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      deltaX = 0;
      isDragging = true;
      suppressClick = false;
      startTarget = e.target;
      clearInterval(autoTimer);
      grid.setPointerCapture?.(e.pointerId);
    });

    grid.addEventListener("pointermove", (e) => {
      if (!startX) return;
      deltaX = e.clientX - startX;
      if (Math.abs(deltaX) > 8) suppressClick = true;
      render(deltaX);
    });

    const endSwipe = (e) => {
      if (!startX) return;
      isDragging = false;
      const wasTap = Math.abs(deltaX) <= 6;
      if (Math.abs(deltaX) > 26) {
        goTo(activeIndex + (deltaX < 0 ? 1 : -1));
      } else {
        render();
      }
      if (wasTap) {
        const tapTarget = document.elementFromPoint(e.clientX, e.clientY) || e.target;
        const askBtn =
          startTarget?.closest?.(".sgEyebrow[data-ask]") ||
          e.target?.closest?.(".sgEyebrow[data-ask]") ||
          tapTarget?.closest?.(".sgEyebrow[data-ask]");
        const card =
          startTarget?.closest?.(".suggestCard") ||
          e.target?.closest?.(".suggestCard") ||
          tapTarget?.closest?.(".suggestCard");
        if (askBtn) {
          suppressClick = true;
          askSuggestQuestion(askBtn);
        } else if (card) {
          suppressClick = true;
          openSuggestCard(card);
        }
      }
      startX = 0;
      deltaX = 0;
      startTarget = null;
      startAuto();
    };

    grid.addEventListener("pointerup", endSwipe);
    grid.addEventListener("pointercancel", endSwipe);
    grid.addEventListener("pointerleave", endSwipe);
    cards.forEach((card) => {
      card.addEventListener("click", (e) => {
        if (!suppressClick) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }, true);
    });

    render();
    startAuto();
  });
}

function setAgentModeToggleIcon(mode) {
  if (!agentModeToggle || !agentModeToggleIcon) return;
  if (mode === "input") {
    agentModeToggle.setAttribute("aria-label", "切换到底部导航");
    agentModeToggleIcon.className = "i i-map";
  } else {
    agentModeToggle.setAttribute("aria-label", "切换到输入框");
    agentModeToggleIcon.className = "i i-chat";
  }
}

function syncAgentHomeSurface() {
  document.body.classList.remove("agent-view", "agent-input-mode", "agent-dock-mode");
  if (activeView !== "agent") return;
  document.body.classList.add("agent-view");
  document.body.classList.add(agentHomeMode === "input" ? "agent-input-mode" : "agent-dock-mode");
  setAgentModeToggleIcon(agentHomeMode);
}

function setAgentHomeMode(mode) {
  agentHomeMode = mode === "input" ? "input" : "dock";
  syncAgentHomeSurface();
}

// ---------- Modal ----------
const modal = $("#modal");
const modalScrim = $("#modalScrim");
const modalClose = $("#modalClose");
const modalTitle = $("#modalTitle");
const modalBody = $("#modalBody");

const aiNoticeItems = [
  {
    id: "weather",
    time: "实时",
    tag: "天气播报",
    group: "realtime",
    author: "景区百事通",
    title: "当前 21°C，主瀑附近水雾偏大，体感会更凉。",
    summary: "建议带轻薄外套，靠近瀑布时可备雨衣或防水袋。",
    chips: ["轻薄外套", "可备雨具"],
    image: "./assets/rank-waterfall-wide.png",
    body: "当前景区温度约 21°C，主瀑附近水雾偏大，停留时间较长时体感会比入口区域更凉。若计划近距离观瀑或拍照，建议准备轻薄外套，并给手机、相机做好简单防水。",
    impact: "影响区域：主瀑近景区、临水步道。<br>影响表现：体感偏凉、镜头容易挂水雾。"
  },
  {
    id: "crowd-rise",
    time: "刚刚更新",
    tag: "客流更新",
    group: "realtime",
    author: "景区百事通",
    title: "14:30 后观瀑台人流预计上升，可能影响主瀑观景体验。",
    summary: "主瀑区域预计出现短时等候，适合提前完成近景观瀑与拍照停留。",
    chips: ["先观瀑", "慢慢逛"],
    image: "./assets/now-banner-waterfall.png",
    body: "根据当前客流热度与进场节奏，14:30 后观瀑台主瀑区域预计出现更明显的人群聚集。若你更看重观景体验和停留时长，建议尽量避开该时段再进入主瀑近景区域。",
    impact: "影响区域：观瀑台主瀑近景区。<br>影响表现：排队时间变长、拍照停留空间减少。"
  },
  {
    id: "shuttle",
    time: "25 分钟前",
    tag: "景区公告",
    group: "official",
    author: "黄果树瀑布景区",
    title: "接驳车当前约 5 分钟一班，高峰期建议提前一班候车。",
    aiSummary: "换乘请预留时间",
    summary: "若你计划切换景点，建议预留候车时间，避免耽误限时场次。",
    chips: ["依据：接驳频次", "影响：换乘等待"],
    image: "./assets/home-banner-waterfall.png",
    body: "游客中心至观瀑台接驳车当前维持约 5 分钟一班。高峰期排队人数增加时，实际候车时长可能略有波动。如你后续还有演出或限时活动安排，可适当提前一班候车。",
    impact: "影响区域：游客中心、观瀑台接驳点。<br>影响表现：换乘等待增加，后续节奏可能被拉长。"
  },
  {
    id: "official-show",
    time: "今日 09:10",
    tag: "景区公告",
    group: "official",
    author: "黄果树瀑布景区",
    title: "民族演出 14:50 正常开演，建议提前 10 分钟入场。",
    aiSummary: "演出正常提前入场",
    summary: "入口广场演出区域座位有限，亲子游客可提前入场选择靠边位置。",
    chips: ["发布：景区官方", "场次：14:50"],
    image: "./assets/suggest-ethnic-show.png",
    body: "黄果树瀑布景区今日民族演出 14:50 正常开演。演出地点为入口广场，建议游客提前 10 分钟入场，并听从现场工作人员引导。",
    impact: "影响区域：入口广场演出区域。<br>影响表现：开演前短时聚集，建议错峰通过。"
  },
  {
    id: "official-maintain",
    time: "昨日 18:30",
    tag: "景区公告",
    group: "official",
    author: "黄果树瀑布景区",
    title: "水帘洞局部维护完成，今日按正常动线开放。",
    aiSummary: "水帘洞正常开放",
    summary: "维护区域已完成安全检查，游客可按现场导览标识通行。",
    chips: ["发布：景区官方", "状态：正常开放"],
    image: "./assets/rank-waterfall-poster.png",
    body: "黄果树瀑布景区水帘洞局部维护已完成，并通过开放前安全检查。今日游客可按正常动线参观，具体通行以现场标识和工作人员引导为准。",
    impact: "影响区域：水帘洞及周边步道。<br>影响表现：恢复正常通行。"
  },
];
let currentAiNoticeId = "crowd-rise";

const modalContent = {
  aiRecInfo: {
    title: "AI推荐逻辑",
    body:
      "当前仅有 2 个互动活动，AI 的价值不是“推荐更多”，而是“推荐更合适”。<br><br>" +
      "我们会综合：<b>时间</b>、<b>客流</b>、以及你在“此刻建议”里点过的偏好（亲子/限时/就近），对活动进行动态排序，并给出推荐理由标签。<br><br>" +
      "提示：这是原型演示，规则为模拟逻辑。",
  },
  aiBriefInfo: {
    title: "智能快讯 · 影响说明",
    body:
      "14:30 后观瀑台人流预计上升，主瀑区域可能出现短时等候。<br><br>" +
      "影响：主瀑观景体验下降、拍照停留时间变短。<br><br>" +
      "你可以继续查看“此刻建议”获取此时更合适的游玩顺序。",
  },
  rankInfo: {
    title: "精选推送说明",
    body:
      "“精选推送”用于展示景区当前重点推荐的活动、必玩点位和好吃内容。<br><br>" +
      "内容参考：<b>官方配置</b>、<b>当前时间</b>、<b>客流状态</b>与游客常用需求，不表达商户或景点的排名高低。<br><br>" +
      "提示：带 AI 标识的内容为智能体生成/汇总，官方推荐内容来自景区运营配置。",
  },
  tips: {
    title: "分流建议",
    body:
      "当前观瀑台客流中等，建议先走右侧栈道上观景台，再回流去天星桥。<br><br>" +
      "若带老人：选择“轻松路线”，尽量少走湿滑台阶；遇到人群拥堵时可优先去游客中心附近休息点。",
  },
  spotRowing: {
    title: "人气项目 · 划船体验",
    image: "./assets/suggest-rowing.png",
    body:
      "当前水面风力较小，适合亲子慢玩。建议安排 25-35 分钟体验，结束后顺路去附近补给点休息。<br><br>" +
      "游玩提示：上船前确认救生衣，带娃游客建议选择靠岸路线；如果后面还要赶 14:50 演出，建议控制停留时长。",
  },
  spotB: {
    title: "瀑布观景 · 此刻推荐",
    image: "./assets/suggest-waterfall.png",
    body:
      "当前观瀑区域客流舒适，适合先完成主瀑观景和拍照停留。建议从右侧栈道进入，避开入口回流。<br><br>" +
      "拍照提示：镜头略低，瀑布占画面 2/3；水雾大时给手机加防水袋。停留 15-20 分钟后可顺路去天星桥。",
  },
  spotShow: {
    title: "14:50 民族表演",
    image: "./assets/suggest-ethnic-show.png",
    body:
      "演出地点在入口广场，建议提前 10 分钟入场。当前场次适合想短暂停留、避开主瀑高峰的人群。<br><br>" +
      "演出结束后可顺路去酸汤鱼或回到观瀑路线，适合把节奏从走路切换为轻松观演。",
  },
  ugc1: { title: "游客实拍 · 观瀑台", body: "“雾散了一点点，瀑布层次很出。逆光可能出彩虹。”<br><br>提示：雨后湿滑，扶手很好用。" },
  ugc2: { title: "游客实拍 · 酸汤鱼", body: "“排队不长，辣度可选，汤很香。建议两人点小份再加配菜。”" },
  ugc3: { title: "游客实拍 · 天星桥", body: "“这段路湿滑，穿防滑鞋更舒服。中途有补给点。”" },
  alert1: { title: "雨后路面湿滑", body: "建议慢行，尽量走防滑步道；儿童注意牵手。若遇大雾，可先去室内/近景点位。"},
  alert2: { title: "接驳车信息", body: "游客中心 ↔ 观瀑台，约 5 分钟一班。末班 18:00。高峰期建议提前 1 班上车。"},
  settings: { title: "设置", body: "原型提示：这里可放偏好设置、语言、通知、隐私等。<br><br>交互：点击“保存/收藏/去这里”等按钮会有轻提示。"},
  orders: { title: "我的订单", body: "门票：黄果树景区（今日）<br>演出：民族演出（14:50）<br>体验：苗服旅拍（周末 · 待预约）" },
  routes: { title: "我的路线", body: "1) 黄果树精华半日（轻松）<br>2) 荔波小七孔一日（出片）<br>3) 西江千户苗寨夜游（美食+夜景）" },
  badges: { title: "打卡勋章", body: "已获得：<br>• 观瀑打卡 · 铜章<br>• 苗寨夜景 · 银章<br>• 山地徒步 · 铜章<br><br>下一枚：集齐 5 个点位可解锁“贵州初印象”。" },
  support: { title: "服务中心", body: "常用：退款/改签、失物招领、投诉建议、转人工。<br><br>原型中可把这些入口做成一键卡片 + 问题自助流。" },
  itinerary: { title: "我的行程", body: "今天：黄果树精华半日<br>• 观瀑台（讲解+出片）<br>• 天星桥（湿滑提醒）<br>• 酸汤鱼（附近餐饮）<br><br>下周：西江千户苗寨 · 夜游路线（收藏）" },
};

function openModal(key) {
  const c = modalContent[key] || { title: "详情", body: "暂无内容" };
  modal.classList.remove("isGuideManage");
  modalTitle.textContent = c.title;
  modalBody.innerHTML = c.image
    ? `<img class="modalHeroImg" src="${c.image}" alt="${c.title}" /><div class="modalDetailText">${c.body}</div>`
    : c.body;
  modal.classList.add("isOn");
  modal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  modal.classList.remove("isOn", "isGuideManage");
  modal.setAttribute("aria-hidden", "true");
}
modalScrim.addEventListener("click", closeModal);
modalClose.addEventListener("click", closeModal);

$$("[data-open='modal']").forEach((el) => el.addEventListener("click", () => openModal(el.dataset.modal)));

// ---------- 原型备注：独立辅助层 ----------
const prototypeRemarkBtn = $("#prototypeRemarkBtn");
const prototypeRemarkPanel = $("#prototypeRemarkPanel");
const prototypeRemarkScrim = $("#prototypeRemarkScrim");
const prototypeRemarkClose = $("#prototypeRemarkClose");
const prototypeRemarkInput = $("#prototypeRemarkInput");
const prototypeRemarkStorageKey = "guizhouPrototypeRemark";

function htmlToRemarkText(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  function walk(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    const childText = Array.from(node.childNodes).map((child) => walk(child, depth)).join("");

    if (tag === "br") return "\n";
    if (tag === "li") return `${"  ".repeat(depth)}- ${childText.trim()}\n`;
    if (tag === "ul" || tag === "ol") {
      return Array.from(node.children).map((child) => walk(child, depth + 1)).join("");
    }
    if (/^h[1-6]$/.test(tag)) return `\n${childText.trim()}\n`;
    if (["p", "div", "section", "article", "blockquote"].includes(tag)) return `${childText.trim()}\n`;
    return childText;
  }

  return walk(doc.body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function insertRemarkText(text) {
  if (!prototypeRemarkInput || !text) return;
  const start = prototypeRemarkInput.selectionStart ?? prototypeRemarkInput.value.length;
  const end = prototypeRemarkInput.selectionEnd ?? prototypeRemarkInput.value.length;
  prototypeRemarkInput.value = `${prototypeRemarkInput.value.slice(0, start)}${text}${prototypeRemarkInput.value.slice(end)}`;
  const cursor = start + text.length;
  prototypeRemarkInput.setSelectionRange(cursor, cursor);
  localStorage.setItem(prototypeRemarkStorageKey, prototypeRemarkInput.value);
}

function openPrototypeRemark() {
  if (!prototypeRemarkPanel) return;
  prototypeRemarkPanel.classList.add("isOn");
  prototypeRemarkPanel.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => prototypeRemarkInput?.focus());
}

function closePrototypeRemark() {
  if (!prototypeRemarkPanel) return;
  prototypeRemarkPanel.classList.remove("isOn");
  prototypeRemarkPanel.setAttribute("aria-hidden", "true");
}

if (prototypeRemarkInput) {
  prototypeRemarkInput.value = localStorage.getItem(prototypeRemarkStorageKey) || "";
  prototypeRemarkInput.addEventListener("input", () => {
    localStorage.setItem(prototypeRemarkStorageKey, prototypeRemarkInput.value);
  });
  prototypeRemarkInput.addEventListener("paste", (event) => {
    const html = event.clipboardData?.getData("text/html");
    const text = htmlToRemarkText(html) || event.clipboardData?.getData("text/plain") || "";
    if (!text) return;
    event.preventDefault();
    insertRemarkText(text);
  });
}
prototypeRemarkBtn?.addEventListener("click", openPrototypeRemark);
prototypeRemarkScrim?.addEventListener("click", closePrototypeRemark);
prototypeRemarkClose?.addEventListener("click", closePrototypeRemark);

function getAiNoticeById(id) {
  return aiNoticeItems.find((n) => n.id === id) || aiNoticeItems[0];
}

let noticeFilter = "all";
let noticeQuery = "";
const noticeViewCounts = {};

function getNoticeSortValue(time = "") {
  const raw = String(time);
  if (raw.includes("实时")) return 9000000000000;
  if (raw.includes("刚刚")) return 8999999990000;
  const today = new Date(2026, 5, 12);
  const hhmm = raw.match(/(\d{1,2}):(\d{2})/);
  if (raw.includes("今日") && hhmm) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), Number(hhmm[1]), Number(hhmm[2])).getTime();
  }
  if (raw.includes("昨日") && hhmm) {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, Number(hhmm[1]), Number(hhmm[2])).getTime();
  }
  return 0;
}

function renderAiNoticeList() {
  const root = $("#noticeList");
  if (!root) return;
  const q = noticeQuery.trim().toLowerCase();
  const items = aiNoticeItems.filter((item) => {
    const groupOk = noticeFilter === "all" || item.group === noticeFilter;
    const text = [item.tag, item.author, item.title, item.aiSummary, item.summary, item.body, item.impact, item.time].join(" ").toLowerCase();
    const queryOk = !q || text.includes(q);
    return groupOk && queryOk;
  }).sort((a, b) => getNoticeSortValue(b.time) - getNoticeSortValue(a.time));
  root.innerHTML = items.length ? items.map((item) => `
    <button class="noticeItem" data-notice-id="${item.id}" aria-label="${item.title}">
      <img class="noticeItemImage" src="${item.image || "./assets/rank-waterfall-poster.png"}" alt="" loading="lazy" />
      <div class="noticeItemBody">
        <div class="noticeItemTop">
          <span class="noticeItemTag">${item.tag}</span>
          <span class="noticeItemTime">${item.time}</span>
        </div>
        <div class="noticeItemAuthor">${item.author || "景区百事通"}</div>
        <div class="noticeItemTitle">${item.title}</div>
        <div class="noticeItemDesc">${item.summary}</div>
      </div>
    </button>
  `).join("") : `<div class="noticeEmpty">当前暂无资讯，逛逛别的吧～</div>`;
  $$(".noticeItem", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      currentAiNoticeId = btn.dataset.noticeId;
      renderAiNoticeDetail(currentAiNoticeId);
      switchView("noticeDetail");
    });
  });
  bindRipple();
}

function syncNoticeSearchClear() {
  $("#noticeSearchClear")?.classList.toggle("isOn", Boolean(noticeQuery.trim()));
}

$("#noticeSearchInput")?.addEventListener("input", (e) => {
  noticeQuery = e.currentTarget.value || "";
  syncNoticeSearchClear();
  renderAiNoticeList();
});
$("#noticeSearchInput")?.addEventListener("click", (e) => {
  e.currentTarget.focus();
});
$("#noticeSearchClear")?.addEventListener("click", () => {
  const input = $("#noticeSearchInput");
  noticeQuery = "";
  if (input) {
    input.value = "";
    input.focus();
  }
  syncNoticeSearchClear();
  renderAiNoticeList();
});

$$(".noticeFilter").forEach((btn) => {
  btn.addEventListener("click", () => {
    noticeFilter = btn.dataset.noticeFilter || "all";
    $$(".noticeFilter").forEach((x) => x.classList.toggle("isOn", x === btn));
    renderAiNoticeList();
  });
});

function renderAiNoticeDetail(id = currentAiNoticeId, shouldCountView = true) {
  const d = getAiNoticeById(id);
  currentAiNoticeId = d.id;
  if (shouldCountView) noticeViewCounts[d.id] = (noticeViewCounts[d.id] || 0) + 1;
  const isOfficial = d.group === "official";
  $("#noticeDetailBadge").textContent = d.tag || "播报";
  $("#noticeDetailBadge").style.display = "";
  $("#noticeDetailTitle").textContent = d.title;
  const aiSummary = $("#noticeDetailAiSummary");
  if (aiSummary) {
    aiSummary.style.display = "none";
    aiSummary.innerHTML = "";
  }
  $("#noticeDetailAuthor").textContent = `发布人：${d.author || "景区百事通"}`;
  $("#noticeDetailPublishTime").textContent = `发布时间：${d.time || "刚刚"}`;
  $("#noticeDetailViews").textContent = noticeViewCounts[d.id] || 0;
  const imageWrap = $("#noticeDetailImageWrap");
  const image = $("#noticeDetailImage");
  if (imageWrap && image) {
    imageWrap.style.display = isOfficial ? "" : "none";
    image.src = d.image || "./assets/rank-waterfall-poster.png";
  }
  const detailText = isOfficial
    ? [
        (d.body || d.summary || "").replaceAll("<br>", "\n"),
      ].join("\n")
    : [
        `${d.tag || "实时更新"}说明：`,
        (d.body || d.summary || "").replaceAll("<br>", "\n"),
        "",
        "建议与影响：",
        (d.impact || "").replaceAll("<br>", "\n"),
      ].join("\n");
  $("#noticeDetailText").textContent = detailText;
  const chipsRoot = $("#noticeDetailChips");
  if (chipsRoot) {
    chipsRoot.style.display = isOfficial ? "none" : "";
    chipsRoot.innerHTML = isOfficial ? "" : d.chips.map((t) => `<span class="aiBriefChip">${t}</span>`).join("");
  }
}

renderAiNoticeList();
renderAiNoticeDetail(currentAiNoticeId, false);

// ---------- 动线攻略详情 ----------
const guideNoteData = {
  classic: {
    title: "第一次来黄果树，照着这条走基本不踩雷",
    author: "阿苗旅拍",
    avatar: "苗",
    source: "ugc",
    cover: "./assets/guide-classic-map.png",
    chips: ["精华", "约 4h", "首次必看", "少踩坑"],
    summary: { time: "约 4 小时", distance: "3.6km", stops: "4 个点位", fit: "首次到访" },
    insight: "当前主瀑排队正常，适合先完成核心观景，再顺路去天星桥，减少来回折返。",
    points: [
      ["游客中心", "先确认接驳与返程口，少走冤枉路"],
      ["观瀑台", "主瀑近景先看，停留 15-20 分钟"],
      ["天星桥", "顺路慢走，湿滑路段放慢"],
      ["补给点", "根据体力决定是否加深度点位"],
    ],
    liveTips: ["14:30 后观瀑台热度上升", "水雾偏大，手机建议防水袋", "返程接驳提前一班候车"],
    body: "1) 入口 → 观瀑台（主瀑近景）\n2) 天星桥（顺路慢走）\n3) 补给点/休息点（根据体力）\n4) 回到游客中心",
    tips: "• 雨后水雾大：手机建议防水袋\n• 台阶湿滑：优先走防滑步道\n• 人多时别硬挤：先去顺路的空点位",
    routeKey: "classic",
  },
  avoid: {
    title: "高峰不硬挤，绕开回流也能看完整个主瀑",
    author: "宣发助手",
    avatar: "AI",
    source: "aigc",
    cover: "./assets/guide-avoid-route.png",
    chips: ["避堵", "约 4h", "舒适优先"],
    summary: { time: "约 4 小时", distance: "3.2km", stops: "4 个点位", fit: "怕排队" },
    insight: "参考旅行笔记里反复提到的“先避开主入口回流”经验，结合当前客流，把核心观瀑位放到人流回落后再进入。",
    points: [
      ["右侧栈道", "避开入口第一波拥挤"],
      ["侧边观景位", "先拍远景，停留更舒服"],
      ["天星桥外围", "顺路慢走，不折返"],
      ["接驳点", "错峰返程，少等一轮车"],
    ],
    liveTips: ["主入口回流变多时先走侧边", "远景机位当前更容易停留", "接驳点排队时提前一班候车"],
    body: "1) 从右侧栈道切入，先避开入口第一波人流\n2) 在侧边观景位完成远景和合影\n3) 顺着外圈慢走到天星桥，不做大折返\n4) 等主瀑核心位降温后再补近景停留",
    tips: "• 高峰段先别挤核心观景位\n• 用外圈顺游替代来回折返\n• 如果后面有演出或餐饮预约，接驳至少提前一班",
    routeKey: "classic",
  },
  easy: {
    title: "带长辈就别贪多，这样保留主瀑又少走台阶",
    author: "宣发助手",
    avatar: "AI",
    source: "aigc",
    cover: "./assets/guide-easy-watercolor.png",
    chips: ["省力", "约 3h", "省体力"],
    summary: { time: "约 3 小时", distance: "2.1km", stops: "3 个点位", fit: "长辈同行" },
    insight: "从游客经验里提炼出“先保主瀑、再看体力加点”的节奏，减少湿滑台阶和重复路段，方便随时接驳返程。",
    points: [
      ["近景入口", "少走台阶，先到核心观景区"],
      ["观景台", "停留 15 分钟，避开湿滑边缘"],
      ["休息点", "补水休息，再决定是否加点"],
      ["接驳返程", "不走完整环线，直接回游客中心"],
    ],
    liveTips: ["每 40-60 分钟安排一次休息", "湿滑台阶优先走扶手侧", "主瀑看完即可返程，不硬凑点位"],
    body: "1) 先到近景入口，缩短开场步行消耗\n2) 主瀑观景台停留 15 分钟左右\n3) 中途安排补水和休息，不连续爬坡\n4) 体力下降时直接就近接驳返程",
    tips: "• 带长辈时，把“少折返”放在“多打卡”前面\n• 湿滑台阶优先走扶手侧\n• 体力不足时，保留主瀑体验就已经够完整",
    routeKey: "easy",
  },
  photo: {
    title: "彩虹机位我替你踩好了，下午这样拍最出片",
    author: "阿苗旅拍",
    avatar: "苗",
    source: "ugc",
    cover: "./assets/guide-photo-ethnic.png",
    chips: ["出片", "约 4h", "机位优先"],
    summary: { time: "约 4 小时", distance: "3.8km", stops: "4 个机位", fit: "拍照优先" },
    insight: "下午侧逆光更容易出彩虹，先占低机位，再去天星桥补环境人像。",
    points: [
      ["观瀑台右侧", "低机位拍主瀑全景"],
      ["逆光窗口", "等水雾散开，拍彩虹概率更高"],
      ["天星桥侧光位", "补水纹和青苔细节"],
      ["返程步道", "补环境人像，不挡主通道"],
    ],
    liveTips: ["镜头容易挂水雾，随手擦", "逆光时保护手机和相机", "人像靠边拍，别挡回流通道"],
    body: "1) 观瀑台右侧机位拍全景\n2) 逆光时间窗等彩虹\n3) 天星桥选侧逆光点位补拍\n4) 回程补人像与环境照",
    tips: "• 逆光时注意保护镜头\n• 水雾会糊片：随手擦镜头\n• 人像尽量靠边拍，避免挡路",
    routeKey: "photo",
  },
  kid: {
    title: "带娃不走回头路，边玩边歇刚刚好",
    author: "沫沫妈咪",
    avatar: "沫",
    source: "ugc",
    cover: "./assets/guide-kid-waterfall.png",
    chips: ["亲子", "约 3h", "亲子友好"],
    summary: { time: "约 3 小时", distance: "2.4km", stops: "3 个点位", fit: "带娃慢玩" },
    insight: "儿童体力波动大，先保证短距离核心点位，中途留出互动和补给弹性。",
    points: [
      ["短距离入口", "减少开场消耗"],
      ["主瀑外围", "安全距离看瀑布，拍照不挤"],
      ["互动休息点", "停 10 分钟补水补能量"],
      ["就近返程", "累了直接接驳，不强行走环线"],
    ],
    liveTips: ["湿滑处牵手走", "备雨衣和换洗衣物", "补给点优先于机位"],
    body: "1) 先选短距离点位\n2) 中途安排互动/休息\n3) 走平缓路线，不追完整环线\n4) 返程就近补给",
    tips: "• 带娃优先安全：湿滑处牵手\n• 备雨衣/换洗衣物更从容\n• 走累了直接接驳回游客中心",
    routeKey: "easy",
  },
  rejectedKid: {
    title: "带娃不走回头路，边玩边歇刚刚好",
    author: "宣发助手",
    avatar: "AI",
    source: "ugc",
    cover: "./assets/guide-kid-waterfall.png",
    chips: ["亲子", "约 3h", "亲子友好"],
    summary: { time: "待完善", distance: "待补充", stops: "待补充", fit: "带娃慢玩" },
    insight: "这条内容因图片和路线信息不完整，暂未通过审核，可补充后再次提交。",
    points: [
      ["短距离入口", "减少开场消耗"],
      ["主瀑外围", "安全距离看瀑布，拍照不挤"],
      ["互动休息点", "停 10 分钟补水补能量"],
    ],
    liveTips: ["补充清晰图片后再提交", "正文需写清游览顺序", "建议增加时间安排"],
    body: "1) 先选短距离点位\n2) 中途安排互动/休息\n3) 走平缓路线，不追完整环线\n4) 返程就近补给",
    tips: "• 请补充清晰图片\n• 请写清路线顺序和时间建议\n• 再次提交后进入审核中",
    routeKey: "easy",
  },
  depth: {
    title: "不赶场的话，把黄果树留给光线和水雾变化",
    author: "宣发助手",
    avatar: "AI",
    source: "aigc",
    cover: "./assets/guide-depth-views.png",
    chips: ["深度", "约 5h", "慢玩沉浸"],
    summary: { time: "约 5 小时", distance: "4.8km", stops: "5 个点位", fit: "不赶时间" },
    insight: "归纳旅行笔记中“慢等水雾散开、补拍细节”的玩法，再结合今日天气，把停留时间留给主瀑和安静步道。",
    points: [
      ["主瀑长停留", "等水雾和光线变化"],
      ["步道慢走", "不追速度，避开湿滑段"],
      ["天星桥深处", "找更安静的角度"],
      ["补给休息", "预留返程体力"],
    ],
    liveTips: ["慢玩别拼点位数量", "备水和能量棒", "雾大先拍近景，等开阔再拍远景"],
    body: "1) 主瀑先长停留，等水雾和光线变化\n2) 步道慢走，不急着追下一个点位\n3) 到天星桥深处找更安静的角度\n4) 返程前预留补给和接驳时间",
    tips: "• 深度游不拼点位数量，拼停留质量\n• 备水和能量棒，别把体力耗在前半段\n• 雾大时先拍近景，视野打开后再补远景",
    routeKey: "depth",
  },
  food: {
    title: "逛到这里先补能量，酸汤鱼这样吃不踩雷",
    author: "阿苗食记",
    avatar: "食",
    source: "ugc",
    cover: "./assets/now-banner-waterfall.png",
    chips: ["美食", "约 1h", "就近补给", "好吃"],
    summary: { time: "约 1 小时", distance: "800m", stops: "2 个补给点", fit: "午餐/晚餐" },
    insight: "当前餐饮点排队不长，适合错峰吃完再回到观瀑路线，避免下午体力掉得太快。",
    points: [
      ["酸汤鱼补给点", "先点主菜，辣度可选"],
      ["就近休息区", "吃完休息 10 分钟再走"],
      ["返观瀑路线", "从侧边步道回到主线"],
    ],
    liveTips: ["饭点前后错峰 20 分钟更稳", "两人建议小份加配菜", "带娃可选不辣或微辣"],
    body: "1) 先到酸汤鱼补给点错峰用餐\n2) 主菜优先下单，配菜按人数补\n3) 吃完就近休息，不马上赶路\n4) 再从侧边步道回到观瀑路线",
    tips: "• 排队超过 15 分钟就先拿号再休息\n• 带娃选不辣/微辣\n• 下午还要走路，别一次吃太撑",
    routeKey: "classic",
  },
  stay: {
    title: "住一晚更从容，第二天早场看瀑布最舒服",
    author: "宣发助手",
    avatar: "AI",
    source: "aigc",
    cover: "./assets/home-banner-waterfall.png",
    chips: ["住宿", "过夜游", "早场", "接驳近"],
    summary: { time: "2 天 1 晚", distance: "按住宿点", stops: "3 个决策点", fit: "不赶时间" },
    insight: "住宿优先看接驳距离和早场入园便利度，第二天早一点入园能避开主瀑高峰。",
    points: [
      ["游客中心附近", "优先看接驳和返程方便"],
      ["景区外住宿", "性价比高，但留出入园交通时间"],
      ["第二天早场", "先看主瀑，再慢走天星桥"],
    ],
    liveTips: ["订房先确认到游客中心距离", "早场入园更适合拍照", "返程前预留取行李时间"],
    body: "1) 住宿优先选接驳方便的位置\n2) 晚上不要把行程排太满\n3) 第二天早场先去主瀑\n4) 看完主瀑再按体力加天星桥",
    tips: "• 看清是否含接送/停车\n• 早场更适合怕人多的游客\n• 带行李建议先寄存再入园",
    routeKey: "easy",
  },
  traffic: {
    title: "接驳车和返程口这样记，少排一轮队",
    author: "宣发助手",
    avatar: "AI",
    source: "aigc",
    cover: "./assets/guide-avoid-route.png",
    chips: ["交通", "接驳", "返程口", "少等待"],
    summary: { time: "约 30 分钟", distance: "接驳优先", stops: "3 个节点", fit: "怕排队" },
    insight: "先确认返程口，再决定最后一个点位，能减少回头路和接驳等待。",
    points: [
      ["游客中心", "先看接驳方向和末班时间"],
      ["观瀑台接驳点", "高峰期提前一班候车"],
      ["返程口", "最后一个点位尽量靠近返程方向"],
    ],
    liveTips: ["14:30 后接驳点容易变热闹", "返程前先看末班提醒", "人多时不要压最后一班"],
    body: "1) 入园前先确认接驳方向\n2) 游玩中记住最近返程口\n3) 高峰期提前一班去候车\n4) 最后一个点位尽量靠近返程方向",
    tips: "• 接驳车信息以现场公告为准\n• 老人小孩同行别压末班\n• 人多时先去近站点，不绕远",
    routeKey: "classic",
  },
  drive: {
    title: "自驾来黄果树，停车和返程这样安排更稳",
    author: "山路慢游者",
    avatar: "游",
    source: "ugc",
    cover: "./assets/guide-depth-views.png",
    chips: ["自驾", "停车", "返程", "避峰"],
    summary: { time: "半日/一日", distance: "按停车点", stops: "3 个节点", fit: "自驾游客" },
    insight: "自驾重点不只是停车，还要提前想好返程时间，避开集中离场。",
    points: [
      ["停车区", "优先选靠近接驳入口的位置"],
      ["游客中心", "确认返程动线和取车方向"],
      ["错峰离场", "避开演出结束和饭点后集中返程"],
    ],
    liveTips: ["停车后拍下区域编号", "返程前提前 20 分钟准备", "雨天取车留出更长时间"],
    body: "1) 到达后先记录停车区域\n2) 入园前确认返程接驳方向\n3) 末段行程不要离停车方向太远\n4) 避开集中离场时间再取车",
    tips: "• 车牌和停车区拍照留存\n• 雨天取车别卡太紧\n• 自驾返程尽量避开集中散场",
    routeKey: "depth",
  },
};

const guideSocialState = {};
const rankSocialState = {};
let lastGuideDetailSource = "now";
let lastRankDetailSource = "now";
const deletedPublishedGuideIds = new Set();
const guideAuditFailReason = "图片中存在明显遮挡，正文缺少具体游览路线和时间建议。请补充完整攻略内容后再次提交。";
const editableGuideAuthors = new Set(["宣发助手", "我"]);

function canEditGuide(publishItem, guideData) {
  return publishItem?.owner === "me" && editableGuideAuthors.has(guideData?.author);
}

function ensureEditableAiGuideItem(guideId, guideData) {
  if (!editableGuideAuthors.has(guideData?.author)) return null;
  const existing = getPublishedGuideItem(guideId);
  if (existing) return existing;
  const item = {
    type: "guide",
    id: guideId,
    publishStatus: "public",
    auditStatus: "已发布",
    stat: "",
    time: getPublishTimeLabel(),
    owner: "me",
  };
  profileListMeta.published.items.push(item);
  return item;
}

function isMyPublishedGuideItem(item) {
  if (item.type !== "guide") return false;
  return item.owner === "me";
}

function getSocialState(store, key, seed = {}) {
  if (!store[key]) {
    store[key] = {
      liked: false,
      collected: false,
      likes: seed.likes ?? 128,
      collects: seed.collects ?? 36,
      shares: seed.shares ?? 12,
    };
  }
  return store[key];
}

function bindSocialControls(prefix, state, options = {}) {
  const likeBtn = $(`#${prefix}NoteLike`);
  const collectBtn = $(`#${prefix}NoteCollect`);
  const shareBtn = $(`#${prefix}NoteShare`);
  const likeCount = $(`#${prefix}LikeCount`);
  const collectCount = $(`#${prefix}CollectCount`);
  const shareCount = $(`#${prefix}ShareCount`);
  const disabled = Boolean(options.disabled);

  const sync = () => {
    likeBtn?.classList.toggle("isOn", state.liked);
    collectBtn?.classList.toggle("isOn", state.collected);
    [likeBtn, collectBtn, shareBtn].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle("isDisabled", disabled);
      btn.disabled = disabled;
    });
    if (likeCount) likeCount.textContent = disabled ? "" : state.likes;
    if (collectCount) collectCount.textContent = disabled ? "" : state.collects;
    if (shareCount) shareCount.textContent = disabled ? "" : state.shares;
  };

  if (disabled) {
    if (likeBtn) likeBtn.onclick = null;
    if (collectBtn) collectBtn.onclick = null;
    if (shareBtn) shareBtn.onclick = null;
    sync();
    return;
  }

  if (likeBtn) likeBtn.onclick = () => {
      state.liked = !state.liked;
      state.likes += state.liked ? 1 : -1;
      sync();
    };
  if (collectBtn) collectBtn.onclick = () => {
      state.collected = !state.collected;
      state.collects += state.collected ? 1 : -1;
      sync();
    };
  if (shareBtn) shareBtn.onclick = () => {
      state.shares += 1;
      sync();
      showToast("已分享（原型）");
    };
  sync();
}

function openGuideDetail(key, sourceView = activeView, options = {}) {
  lastGuideDetailSource = sourceView || activeView || "now";
  const d = guideNoteData[key] || guideNoteData.classic;
  const publishItem = getPublishedGuideItem(key) || ensureEditableAiGuideItem(key, d);
  const itemAuditStatus = options.auditStatus || publishItem?.auditStatus || "";
  const isReviewing = itemAuditStatus === "审核中";
  const isRejected = itemAuditStatus === "审核不通过";
  const isPendingAudit = isReviewing || isRejected;
  const isOwnerPublished = canEditGuide(publishItem, d);
  setupCarousel(
    $("#guideCarouselTrack"),
    $("#guideCarouselIndicator"),
    [
      d.cover,
      "./assets/guide-avoid-route.png",
      "./assets/guide-classic-map.png",
      "./assets/guide-depth-views.png",
      "./assets/guide-photo-ethnic.png",
      "./assets/guide-kid-waterfall.png",
      "./assets/guide-easy-watercolor.png",
      "./assets/now-banner-waterfall.png",
      "./assets/home-banner-waterfall.png",
    ]
  );
  $("#guideNoteTitle").textContent = d.title;
  $("#guideNoteAuthor").textContent = d.author;
  const guideAvatar = $("#guideNoteAvatar");
  if (guideAvatar) {
    guideAvatar.textContent = d.avatar;
    guideAvatar.classList.toggle("isPromoAi", d.avatar === "AI");
  }
  const isAigc = d.source === "aigc";
  $("#guideNoteMeta").textContent = isAigc ? "旅行笔记灵感归纳 · AI改写重绘 · 可进入动线游览" : "用户提交 · 可参考游览";
  $("#guideNoteChips").innerHTML = d.chips.map((t) => `<span class="noteChip">${t}</span>`).join("");
  const summary = d.summary || {};
  $("#guideRouteSummary").innerHTML = `
    <div class="routeInsight">
      <div class="routeInsightLabel">AI判断</div>
      <div class="routeInsightText">${d.insight || "根据当前客流和距离，已为你整理顺路玩法。"}</div>
    </div>
    <div class="routeStatGrid">
      <div class="routeStat"><span>${summary.time || "约 4 小时"}</span><small>用时</small></div>
      <div class="routeStat"><span>${summary.distance || "3.5km"}</span><small>步行</small></div>
      <div class="routeStat"><span>${summary.stops || "4 个点位"}</span><small>节点</small></div>
      <div class="routeStat"><span>${summary.fit || "舒适游"}</span><small>适合</small></div>
    </div>`;
  $("#guideRouteTimeline").innerHTML = (d.points || []).map((p, idx) => `
    <div class="routeStep">
      <div class="routeStepNo">${idx + 1}</div>
      <div class="routeStepBody">
        <div class="routeStepTitle">${p[0]}</div>
        <div class="routeStepText">${p[1]}</div>
      </div>
    </div>
  `).join("");
  $("#guideLiveTips").innerHTML = (d.liveTips || []).map((tip) => `<div class="liveTipItem">${tip}</div>`).join("");
  const auditBox = $("#guideAuditResult");
  if (auditBox) {
    if (isRejected) {
      auditBox.style.display = "";
      auditBox.innerHTML = `
        <div class="guideAuditHead">
          <span class="i i-warn" aria-hidden="true"></span>
          <span>审核不通过</span>
        </div>
        <div class="guideAuditReason">${publishItem?.rejectReason || guideAuditFailReason}</div>
      `;
    } else {
      auditBox.style.display = "none";
      auditBox.innerHTML = "";
    }
  }
  const auditBottomEdit = $("#guideAuditBottomEdit");
  if (auditBottomEdit) {
    auditBottomEdit.style.display = isRejected && isOwnerPublished ? "" : "none";
    auditBottomEdit.onclick = isRejected && isOwnerPublished ? () => openGuideUploadForEdit(key, publishItem) : null;
  }
  $("#guideContentTitle").textContent = isAigc ? "AI改写内容" : "用户提交";
  const pointText = (d.points || []).map((p, idx) => `${idx + 1}. ${p[0]}：${p[1]}`).join("\n");
  const liveTipText = (d.liveTips || []).map((tip) => `• ${tip}`).join("\n");
  const text = [
    isAigc ? "灵感归纳：" : "用户说明：",
    d.insight || "",
    "",
    "推荐动线：",
    pointText || d.body,
    "",
    "此刻提醒：",
    liveTipText || d.tips,
    "",
    "补充说明：",
    d.tips,
  ].join("\n");
  $("#guideNoteText").textContent = text;
  const startBtn = $("#guideNoteStart");
  if (startBtn) {
    startBtn.style.display = isAigc ? "" : "none";
    startBtn.onclick = () => openRouteFromGuide(d.routeKey);
  }
  bindSocialControls(
    "guide",
    getSocialState(guideSocialState, key, { likes: isAigc ? 246 : 128, collects: isAigc ? 82 : 36, shares: isAigc ? 21 : 12 }),
    { disabled: isPendingAudit }
  );
  syncGuidePermissionControl(isOwnerPublished && !isPendingAudit, publishItem);
  $("#guideNoteUpdate").textContent = `发布时间：${getPublishTimeLabel()}`;
  switchView("guideDetail");
}

$$(".guideCard").forEach((card) => {
  card.addEventListener("click", () => {
    const k = card.dataset.guide;
    openGuideDetail(k, activeView);
  });
});

// ---------- 个人中心 / 我的内容 ----------
const profileListMeta = {
  published: {
    title: "我发布的攻略",
    sub: "已发布和审核中的攻略内容",
    empty: "还没有发布攻略",
    items: [
      { type: "guide", id: "classic", publishStatus: "public", auditStatus: "已发布", stat: "128赞 · 36藏", time: "2026年06月11日 15:30", owner: "me" },
      { type: "guide", id: "avoid", publishStatus: "public", auditStatus: "已发布", stat: "246赞 · 82藏", time: "2026年06月11日 15:20", owner: "me" },
      { type: "guide", id: "photo", publishStatus: "public", auditStatus: "已发布", stat: "118赞 · 41藏", time: "2026年06月11日 15:05", owner: "me" },
      { type: "guide", id: "easy", publishStatus: "public", auditStatus: "已发布", stat: "186赞 · 52藏", time: "2026年06月11日 14:45", owner: "me" },
      { type: "guide", id: "rejectedKid", publishStatus: "public", auditStatus: "审核不通过", stat: "", time: "2026年06月11日 13:50", rejectReason: guideAuditFailReason, owner: "me" },
      { type: "guide", id: "depth", publishStatus: "public", auditStatus: "已发布", stat: "104赞 · 29藏", time: "2026年06月11日 13:20", owner: "me" },
      { type: "guide", id: "food", publishStatus: "public", auditStatus: "已发布", stat: "85赞 · 22藏", time: "2026年06月11日 13:05", owner: "me" },
      { type: "guide", id: "stay", publishStatus: "public", auditStatus: "已发布", stat: "92赞 · 24藏", time: "2026年06月11日 12:35", owner: "me" },
      { type: "guide", id: "traffic", publishStatus: "public", auditStatus: "已发布", stat: "76赞 · 18藏", time: "2026年06月11日 11:55", owner: "me" },
      { type: "guide", id: "drive", publishStatus: "public", auditStatus: "已发布", stat: "63赞 · 16藏", time: "2026年06月11日 11:20", owner: "me" },
    ],
  },
  collects: {
    title: "我的收藏",
    sub: "收藏的攻略和标记点",
    empty: "还没有收藏内容",
    items: [
      { type: "guide", id: "photo", auditStatus: "攻略", stat: "36人收藏", time: "2026年06月11日 15:18" },
      { type: "rank", id: "rank1", auditStatus: "标记点", stat: "观瀑推荐", time: "2026年06月11日 15:10" },
      { type: "guide", id: "kid", auditStatus: "攻略", stat: "亲子友好", time: "2026年06月11日 13:42" },
    ],
  },
  likes: {
    title: "我的赞",
    sub: "点赞过的内容",
    empty: "还没有点赞内容",
    items: [
      { type: "guide", id: "classic", auditStatus: "攻略", stat: "首次必看", time: "2026年06月11日 12:50" },
      { type: "rank", id: "rank2", auditStatus: "标记点", stat: "餐饮美食", time: "2026年06月11日 12:12" },
    ],
  },
  shares: {
    title: "我的分享",
    sub: "分享过的攻略和点位",
    empty: "还没有分享内容",
    items: [
      { type: "guide", id: "depth", auditStatus: "攻略", stat: "已分享1次", time: "2026年06月11日 11:40" },
      { type: "rank", id: "rank3", auditStatus: "标记点", stat: "已分享1次", time: "2026年06月11日 10:58" },
    ],
  },
};

function getProfileItemData(item) {
  if (item.type === "rank") {
    const d = rankNoteData[item.id] || rankNoteData.rank1;
    return {
      title: d.title,
      author: d.author,
      avatar: d.avatar,
      cover: "./assets/now-banner-waterfall.png",
      tags: d.chips || [],
    };
  }
  const d = guideNoteData[item.id] || guideNoteData.classic;
  return {
    title: d.title,
    author: d.author,
    avatar: d.avatar,
    cover: d.cover,
    tags: d.chips || [],
  };
}

function getProfileCardMetrics(stat = "") {
  const like = stat.match(/(\d+)\s*赞/);
  const collect = stat.match(/(\d+)\s*(藏|收藏)/);
  return {
    likes: like ? like[1] : "",
    collects: collect ? collect[1] : "",
  };
}

function getProfileTimeValue(time = "") {
  const match = String(time).match(/(\d{4})年(\d{2})月(\d{2})日\s+(\d{2}):(\d{2})/);
  if (!match) return 0;
  const [, y, m, d, h, min] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)).getTime();
}

function sortProfileItems(items = []) {
  const statusWeight = { "审核不通过": 3, "审核中": 2, "已发布": 1, "已下线": 1 };
  return [...items].sort((a, b) => {
    const weightDiff = (statusWeight[b.auditStatus] || 0) - (statusWeight[a.auditStatus] || 0);
    if (weightDiff) return weightDiff;
    return getProfileTimeValue(b.time) - getProfileTimeValue(a.time);
  });
}

function syncGuidePermissionControl(visible, item) {
  const btn = $("#guideNotePermission");
  const text = $("#guidePermissionText");
  if (!btn || !text) return;
  btn.style.display = visible ? "" : "none";
  if (!visible || !item) {
    btn.onclick = null;
    return;
  }
  const isPrivate = item.publishStatus === "private";
  btn.classList.toggle("isPrivate", isPrivate);
  text.textContent = "编辑";
  btn.onclick = () => openGuideManageModal(item);
}

function openGuideManageModal(item) {
  if (!item) return;
  const isPrivate = item.publishStatus === "private";
  const nextStatusText = isPrivate ? "重新上线" : "下线";
  modal.classList.add("isGuideManage");
  modalTitle.textContent = "编辑攻略";
  modalBody.innerHTML = `
    <div class="guideManagePanel">
      <div class="guideManageState">
        <span>当前状态</span>
        <strong>${isPrivate ? "已下线（仅自己可见）" : "公开"}</strong>
      </div>
      <button class="guideManageAction" id="guideManageToggle" type="button">
        <span class="i ${isPrivate ? "i-eye" : "i-lock"}" aria-hidden="true"></span>
        <span>${nextStatusText}</span>
      </button>
      ${isPrivate ? `
        <button class="guideManageAction" id="guideManageEditSubmit" type="button">
          <span class="i i-edit" aria-hidden="true"></span>
          <span>再次编辑提交</span>
        </button>
      ` : ""}
      <button class="guideManageAction isDanger" id="guideManageDelete" type="button">
        <span class="i i-trash" aria-hidden="true"></span>
        <span>删除攻略</span>
      </button>
    </div>
  `;
  modal.classList.add("isOn");
  modal.setAttribute("aria-hidden", "false");
  $("#guideManageToggle")?.addEventListener("click", () => {
    if (item.publishStatus === "public") {
      openGuideConfirmModal({
        title: "下线攻略？",
        body: "下线后，这篇攻略不会在此刻首页对外展示，仅在你的个人中心「我发布的攻略 - 已下线」中可见。",
        confirmText: "确认下线",
        danger: false,
        onConfirm: () => updateGuidePublishStatus(item, "private"),
      });
      return;
    }
    updateGuidePublishStatus(item, "public");
  });
  $("#guideManageEditSubmit")?.addEventListener("click", () => {
    closeModal();
    openGuideUploadForEdit(item.id, item);
  });
  $("#guideManageDelete")?.addEventListener("click", () => {
    openGuideConfirmModal({
      title: "删除攻略？",
      body: "删除后这篇攻略将彻底删除，无法恢复！",
      confirmText: "删除",
      danger: true,
      onConfirm: () => deletePublishedGuide(item),
    });
  });
}

function openGuideConfirmModal({ title, body, confirmText, danger, onConfirm }) {
  modal.classList.add("isGuideManage");
  modalTitle.textContent = title;
  modalBody.innerHTML = `
    <div class="guideConfirmPanel">
      <div class="guideConfirmText">${body}</div>
      <div class="guideConfirmActions">
        <button class="guideConfirmBtn" id="guideConfirmCancel" type="button">取消</button>
        <button class="guideConfirmBtn ${danger ? "isDanger" : "isPrimary"}" id="guideConfirmOk" type="button">${confirmText}</button>
      </div>
    </div>
  `;
  $("#guideConfirmCancel")?.addEventListener("click", closeModal);
  $("#guideConfirmOk")?.addEventListener("click", () => {
    onConfirm?.();
  });
}

function updateGuidePublishStatus(item, nextStatus) {
  item.publishStatus = nextStatus;
  currentProfilePublishStatus = nextStatus;
  syncGuidePermissionControl(true, item);
  syncNowGuideVisibility();
  closeModal();
  showToast(nextStatus === "private" ? "已下线，仅个人中心可见" : "已重新上线");
}

function deletePublishedGuide(item) {
  const list = profileListMeta.published.items;
  const index = list.indexOf(item);
  if (item.id) deletedPublishedGuideIds.add(item.id);
  if (index >= 0) list.splice(index, 1);
  syncNowGuideVisibility();
  closeModal();
  showToast("攻略已删除");
  if (activeView === "guideDetail") {
    openProfileList("published");
  }
}

function openProfileList(type = "published") {
  const meta = profileListMeta[type] || profileListMeta.published;
  currentProfileListType = type;
  if (type !== "published") currentProfilePublishStatus = "public";
  $("#profileListTitle").textContent = meta.title;
  $("#profileListSub").textContent = meta.sub;
  const tabs = $("#profileStatusTabs");
  if (tabs) {
    tabs.style.display = type === "published" ? "" : "none";
    $$(".profileStatusTab", tabs).forEach((tab) => tab.classList.toggle("isOn", tab.dataset.profileStatus === currentProfilePublishStatus));
  }
  const root = $("#profileContentList");
  if (!root) return;
  const items = type === "published"
    ? sortProfileItems(meta.items.filter((item) => {
        if (!isMyPublishedGuideItem(item)) return false;
        if ((item.publishStatus || "public") !== currentProfilePublishStatus) return false;
        if (currentProfilePublishStatus === "public" && item.auditStatus === "审核不通过") return false;
        return true;
      }))
    : sortProfileItems(meta.items);
  if (!items.length) {
    root.innerHTML = `<div class="profileEmpty">${meta.empty}</div>`;
  } else {
    root.innerHTML = items.map((item, index) => {
      const d = getProfileItemData(item);
      const firstTag = d.tags?.[0] || item.auditStatus;
      const isReviewing = item.auditStatus === "审核中";
      const isRejected = item.auditStatus === "审核不通过";
      const isAuditBlocked = isReviewing || isRejected;
      const metrics = getProfileCardMetrics(item.stat);
      return `
        <button class="profileContentCard${isAuditBlocked ? " isReviewing" : ""}${isRejected ? " isRejected" : ""}" data-profile-item-index="${index}" type="button">
          <img class="profileContentCover" src="${d.cover}" alt="" />
          <div class="profileContentBody">
            <div class="profileContentTitle">${d.title}</div>
            <div class="profileContentMeta">
              <span class="profileMiniAvatar${d.avatar === "AI" ? " isPromoAi" : ""}">${d.avatar}</span>
              <span>${d.author}</span>
            </div>
            <div class="profileContentFoot">
              <span class="profileContentTag">${firstTag}</span>
            </div>
            <div class="profileContentBottom">
              <span class="profileContentTime">${item.time}</span>
              ${isAuditBlocked ? `
                <span class="profileReviewBadge">${isRejected ? "未通过" : "审核中"}</span>
              ` : (metrics.likes || metrics.collects) ? `
                <span class="profileCardMetrics">
                  ${metrics.likes ? `<span class="profileCardMetric"><span class="i i-like" aria-hidden="true"></span>${metrics.likes}</span>` : ""}
                  ${metrics.collects ? `<span class="profileCardMetric"><span class="i i-save" aria-hidden="true"></span>${metrics.collects}</span>` : ""}
                </span>
              ` : ""}
            </div>
          </div>
          ${isAuditBlocked ? `<span class="profileReviewMask" aria-hidden="true"></span>` : ""}
        </button>
      `;
    }).join("");
  }
  $$(".profileContentCard", root).forEach((card) => {
    card.addEventListener("click", () => {
      const item = items[Number(card.dataset.profileItemIndex || 0)];
      if (!item) return;
      if (item.type === "rank") openRankDetail(item.id, "profileList");
      else openGuideDetail(item.id, "profileList", { auditStatus: item.auditStatus });
    });
  });
  switchView("profileList");
}

function syncUploadTextCount() {
  const title = $("#guideUploadTitle")?.value || "";
  const content = $("#guideUploadContent")?.value || "";
  const titleCount = $("#guideUploadTitleCount");
  const contentCount = $("#guideUploadContentCount");
  if (titleCount) titleCount.textContent = `${title.length}/20`;
  if (contentCount) contentCount.textContent = `${content.length}/${uploadContentLimit}`;
}

function openGuideUploadForEdit(guideId, publishItem) {
  const d = guideNoteData[guideId] || guideNoteData.classic;
  switchView("guideUpload");
  uploadImageFiles = [{ file: null, url: d.cover, preset: true }];
  renderUploadPreviews();
  const titleInput = $("#guideUploadTitle");
  const contentInput = $("#guideUploadContent");
  if (titleInput) titleInput.value = (d.title || "").slice(0, 20);
  if (contentInput) contentInput.value = (d.body || d.insight || d.tips || "").slice(0, uploadContentLimit);
  syncUploadTextCount();
  uploadTags = (d.chips || []).slice(0, uploadTagLimit).map((tag) => String(tag).slice(0, 5));
  renderUploadTags();
  const rawType = (d.chips || []).find((tag) => ["精华", "深度", "亲子", "美食", "住宿", "拍照", "必玩", "线路", "打卡", "交通", "自驾"].includes(tag)) || "精华";
  const type =
    rawType === "打卡" ? "亲子" :
    rawType === "必玩" || rawType === "线路" || rawType === "交通" || rawType === "自驾" ? "精华" :
    rawType;
  $$(".uploadTypeOption").forEach((option) => {
    const isCurrent = option.dataset.guideType === type;
    option.classList.toggle("isOn", isCurrent);
    option.setAttribute("aria-checked", isCurrent ? "true" : "false");
  });
  const submit = $("#guideUploadSubmit");
  if (submit && publishItem) {
    submit.dataset.editingGuideId = guideId;
  }
  showToast("已进入编辑，可修改后再次提交");
}

function createPendingGuideFromUpload({ title, content, type }) {
  const id = `upload-${Date.now()}`;
  const cover = uploadImageFiles[0]?.url || "./assets/guide-classic-map.png";
  guideNoteData[id] = {
    title,
    author: "宣发助手",
    avatar: "AI",
    source: "ugc",
    cover,
    chips: [type, ...uploadTags].slice(0, 4),
    summary: { time: "待审核", distance: "待补充", stops: "待审核", fit: type },
    insight: content,
    points: [[type, content]],
    liveTips: ["内容已提交，等待景区后台审核"],
    body: content,
    tips: content,
    routeKey: "classic",
  };
  profileListMeta.published.items.unshift({
    type: "guide",
    id,
    publishStatus: "public",
    auditStatus: "审核中",
    stat: "",
    time: getPublishTimeLabel(),
    owner: "me",
  });
  return id;
}

$$(".profileQuick").forEach((btn) => {
  btn.addEventListener("click", () => openProfileList(btn.dataset.profileList));
});

$$(".profileStatusTab").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentProfilePublishStatus = btn.dataset.profileStatus || "public";
    openProfileList(currentProfileListType);
  });
});

$$(".profileMenuItem").forEach((btn) => {
  btn.addEventListener("click", () => showToast(`${btn.textContent.trim()}（原型）`));
});

$("#agentShortcutService")?.addEventListener("click", () => openModal("support"));
$("#agentShortcutGoods")?.addEventListener("click", () => switchView("goods"));
$("#agentShortcutPhone")?.addEventListener("click", () => showToast("客服电话：400-000-0000（原型）"));

// ---------- 精选推送详情 ----------
const rankNoteData = {
  rank1: {
    title: "观瀑台 · 此刻推荐",
    author: "宣发助手",
    avatar: "AI",
    heroClass: "ugcA",
    images: ["./assets/rank-waterfall-poster.png"],
    poiKey: "poi-guanpu",
    layer: "spot",
    audio: "这里是拍摄瀑布全景、感受水雾气势的推荐位置。当前雾气变淡，适合先拍远景，再补近景。",
    chips: ["必玩", "适合拍照", "水雾较小"],
    body: "雾散了一点点，主瀑层次更清晰。现场停留空间一般，建议靠边拍摄。",
    tips: "• 手机建议防水袋\n• 逆光方向更容易出彩虹\n• 人多时先拍远景再补近景",
  },
  rank2: {
    title: "酸汤鱼 · 排队不长",
    author: "宣发助手",
    avatar: "AI",
    heroClass: "ugcB",
    images: ["./assets/rank-sour-fish.png"],
    poiKey: "poi-suantang",
    layer: "food",
    audio: "酸汤鱼是附近补给的高频选择，现在排队不长，适合错峰用餐后再继续游览。",
    chips: ["好吃", "就近补给", "不排队"],
    body: "辣度可选，汤很香。两人建议点小份再加配菜，出餐快。",
    tips: "• 高峰期提前 10–15 分钟到\n• 先点主菜再加配菜更快\n• 带娃可选不辣/微辣",
  },
  rank3: {
    title: "天星桥 · 湿滑提醒",
    author: "宣发助手",
    avatar: "AI",
    heroClass: "ugcC",
    images: ["./assets/rank-waterfall-wide.png"],
    poiKey: "poi-tianxing",
    layer: "spot",
    audio: "天星桥路段景观层次丰富，但石阶湿滑，建议放慢脚步，边走边听讲解更稳妥。",
    chips: ["必玩", "防滑鞋", "慢行"],
    body: "这段路湿滑，穿防滑鞋更舒服。中途有补给点可以歇一歇。",
    tips: "• 台阶处注意扶手\n• 雨天慢走，不抢道\n• 走累了就近找休息点",
  },
};

function focusTourMarker(poiKey) {
  $$("#view-tour .marker").forEach((m) => m.classList.toggle("isFocus", m.dataset.poi === poiKey));
}

function setTourLayerButton(layer) {
  $$(".tourChips .chip").forEach((c) => c.classList.toggle("isOn", c.dataset.layer === layer));
}

function setTourModeButton(mode) {
  $$(".tourModeBtn").forEach((b) => b.classList.toggle("isOn", b.dataset.tourMode === mode));
}

function setTourAudio(text = "", on = false) {
  const bubble = $("#tourAudioBubble");
  const textEl = $("#tourAudioText");
  if (!bubble || !textEl) return;
  textEl.textContent = text || "这里是适合停留听讲解的位置。";
  bubble.classList.toggle("isOn", on);
}

function openRankOnTour(d, mode = "nav") {
  const poiKey = d.poiKey || "poi-guanpu";
  const layer = d.layer || "spot";
  tourMode = "nearby";
  tourLayer = layer;
  setTourModeButton("nearby");
  setTourLayerButton(layer);
  switchView("tour");
  requestAnimationFrame(() => {
    syncTourSurface();
    focusTourMarker(poiKey);
    openSheet(poiKey);
    if (mode === "audio") {
      setTourAudio(d.audio, true);
      showToast("正在播放讲解（原型）");
      return;
    }
    setTourAudio("", false);
    showToast(`已为你定位到${pois[poiKey]?.title || "该点位"}（原型）`);
  });
}

function getRankNavTitle(d = {}) {
  return (d.navTitle || d.title || "大瀑布观景台").split("·")[0].trim();
}

function openRankNav(d = {}) {
  const title = getRankNavTitle(d);
  $("#mapNavTitle").textContent = title;
  $("#mapNavPinLabel").textContent = title.replace("大瀑布", "").trim() || "观瀑台";
  switchView("mapNav");
  requestAnimationFrame(() => showToast(`已定位到${title}（原型）`));
}

function openPreTripNav() {
  openRankNav({ title: "黄果树瀑布", navTitle: "黄果树瀑布" });
}

$("#preTripGoBtn")?.addEventListener("click", openPreTripNav);
$("#preTripImageBtn")?.addEventListener("click", openPreTripNav);

const preTripSlides = $$(".preTripSlide");
let preTripSlideIndex = 0;
if (preTripSlides.length > 1) {
  setInterval(() => {
    preTripSlides[preTripSlideIndex]?.classList.remove("isOn");
    preTripSlideIndex = (preTripSlideIndex + 1) % preTripSlides.length;
    preTripSlides[preTripSlideIndex]?.classList.add("isOn");
  }, 3000);
}

function openRankDetail(id, sourceView = activeView) {
  lastRankDetailSource = sourceView || activeView || "now";
  const d = rankNoteData[id] || rankNoteData.rank1;
  setupCarousel(
    $("#rankCarouselTrack"),
    $("#rankCarouselIndicator"),
    (d.images && d.images.length ? d.images : []).concat([
      "./assets/guide-kid-waterfall.png",
      "./assets/guide-depth-views.png",
      "./assets/guide-photo-ethnic.png",
      "./assets/guide-easy-watercolor.png",
      "./assets/guide-avoid-route.png",
      "./assets/guide-classic-map.png",
      "./assets/home-banner-waterfall.png",
      "./assets/suggest-waterfall.png",
    ])
  );
  $("#rankNoteTitle").textContent = d.title;
  $("#rankNoteAuthor").textContent = d.author;
  const rankAvatar = $("#rankNoteAvatar");
  if (rankAvatar) {
    rankAvatar.textContent = d.avatar;
    rankAvatar.classList.toggle("isPromoAi", d.avatar === "AI");
  }
  $("#rankNoteMeta").textContent = "";
  $("#rankNoteChips").innerHTML = d.chips.map((t) => `<span class="noteChip">${t}</span>`).join("");
  $("#rankNoteText").textContent = [
    "现场情况：",
    d.body,
    "",
    "建议：",
    d.tips,
  ].join("\n");
  $("#rankNoteAudio").onclick = () => openRankOnTour(d, "audio");
  $("#rankNoteGo").onclick = () => openRankNav(d);
  bindSocialControls("rank", getSocialState(rankSocialState, id, { likes: 86, collects: 24, shares: 9 }));
  $("#rankNoteUpdate").textContent = `发布时间：${getPublishTimeLabel()}`;
  switchView("rankDetail");
}

$$(".ugcCard").forEach((card) => {
  card.addEventListener("click", () => {
    if (card.dataset.rankId) {
      openRankDetail(card.dataset.rankId);
      return;
    }
    if (card.dataset.act) {
      showToast(card.dataset.act === "worldcup" ? "打开世界杯游戏（原型）" : "打开消消乐游戏（原型）");
    }
  });
});

// ---------- 此刻建议详情 ----------
const suggestNoteData = {
  rowing: {
    title: "人气项目 · 划船体验",
    author: "宣发助手",
    meta: "根据水面风力、亲子偏好与当前排队情况生成",
    ask: "划船体验现在适合去吗？帮我结合客流和路线判断",
    cover: "./assets/suggest-rowing.png",
    body:
      "当前水面风力较小，适合亲子慢玩。\n\n建议安排 25-35 分钟体验，结束后顺路去附近补给点休息。\n\n游玩提示：\n1. 上船前确认救生衣。\n2. 带娃游客建议选择靠岸路线。\n3. 如果后面还要赶 14:50 演出，建议控制停留时长。",
  },
  waterfall: {
    title: "瀑布观景 · 此刻推荐",
    author: "宣发助手",
    meta: "根据主瀑客流、光线和步行距离生成",
    ask: "现在去瀑布观景合适吗？哪里人少、怎么走更顺路？",
    cover: "./assets/suggest-waterfall.png",
    body:
      "当前观瀑区域客流舒适，适合先完成主瀑观景和拍照停留。\n\n建议从右侧栈道进入，避开入口回流。\n\n拍照提示：\n1. 镜头略低，瀑布占画面 2/3。\n2. 水雾大时给手机加防水袋。\n3. 停留 15-20 分钟后可顺路去天星桥。",
  },
  show: {
    title: "14:50 民族表演",
    author: "宣发助手",
    meta: "根据演出时间、当前位置和后续动线生成",
    ask: "14:50 民族表演值得去吗？帮我安排过去的时间和路线",
    cover: "./assets/suggest-ethnic-show.png",
    body:
      "演出地点在入口广场，建议提前 10 分钟入场。\n\n当前场次适合想短暂停留、避开主瀑高峰的人群。\n\n游玩提示：\n1. 开演前入口广场会短时聚集。\n2. 建议靠边入座，方便演出后继续动线。\n3. 结束后可顺路去酸汤鱼或回到观瀑路线。",
  },
};

function openSuggestDetail(key) {
  const d = suggestNoteData[key] || suggestNoteData.waterfall;
  setupCarousel(
    $("#suggestCarouselTrack"),
    $("#suggestCarouselIndicator"),
    [
      d.cover,
      "./assets/suggest-waterfall.png",
      "./assets/suggest-rowing.png",
      "./assets/suggest-ethnic-show.png",
      "./assets/now-banner-waterfall.png",
      "./assets/home-banner-waterfall.png",
      "./assets/guide-kid-waterfall.png",
      "./assets/guide-photo-ethnic.png",
      "./assets/guide-depth-views.png",
    ]
  );
  $("#suggestNoteTitle").textContent = d.title;
  $("#suggestNoteAuthor").textContent = d.author || "宣发助手";
  $("#suggestNoteText").textContent = d.body;
  $("#suggestNoteUpdate").textContent = `发布时间：${getPublishTimeLabel()}`;
  const askBtn = $("#suggestAskBtn");
  if (askBtn) {
    askBtn.onclick = () => {
      switchView("agent");
      setAgentHomeMode("input");
      setTimeout(() => sendPrompt(d.ask || `帮我判断：${d.title}`), 260);
    };
  }
  switchView("suggestDetail");
}

// ---------- 此刻：UGC筛选 ----------
const ugcRow = $("#ugcRow");
$$(".featuredFilterRow .segBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".featuredFilterRow .segBtn").forEach((b) => b.classList.toggle("isOn", b === btn));
    const filter = btn.dataset.filter;
    $$(".ugcCard", ugcRow).forEach((card) => {
      const ok = filter === "all" || card.dataset.tag === filter;
      card.style.display = ok ? "" : "none";
    });
    showToast(filter === "all" ? "已显示全部精选推送" : `已筛选：${btn.textContent}`);
  });
});

// ---------- 此刻：推荐互动 ----------
let nowAiPref = "quick"; // quick | kid | limited
const aiGoalText = $("#aiGoalText");

const aiActivityRow = $("#aiActivityRow");
const aiCards = aiActivityRow ? $$(".activityCard", aiActivityRow) : [];

function syncNowAiGoal() {
  if (!aiGoalText) return;
  aiGoalText.textContent =
    nowAiPref === "kid" ? "更偏好亲子慢玩" : nowAiPref === "limited" ? "更偏好限时活动" : "更偏好舒适观景";
}

function applyActCardState(card, state) {
  const reasons = $$(".aiReason", card);
  const desc = card.querySelector(".activityDesc");
  if (reasons?.length) {
    reasons.forEach((r, idx) => (r.textContent = state.reasons[idx] || ""));
  }
  if (desc) desc.textContent = state.desc;
}

function rankAiActivities(trigger = "default") {
  if (!aiActivityRow || aiCards.length < 2) return;
  const match3 = aiCards.find((c) => c.dataset.act === "match3");
  const worldcup = aiCards.find((c) => c.dataset.act === "worldcup");
  if (!match3 || !worldcup) return;

  syncNowAiGoal();

  // 规则（原型模拟）：亲子/就近 → 消消乐优先；限时 → 世界杯优先
  const top = nowAiPref === "limited" ? worldcup : match3;
  const second = top === match3 ? worldcup : match3;

  // DOM重排（保持两卡）
  aiActivityRow.innerHTML = "";
  aiActivityRow.appendChild(top);
  aiActivityRow.appendChild(second);

  // 文案与理由（让“AI感”成立）
  if (top === match3) {
    applyActCardState(match3, {
      rank: 1,
      reasons: nowAiPref === "kid" ? ["亲子友好", "排队间隙"] : ["不打断路线", "随时可玩"],
      desc: nowAiPref === "kid" ? "带娃路上来一局，走走停停刚刚好。" : "走路间隙来一局，不耽误路线。",
    });
    applyActCardState(worldcup, {
      rank: 2,
      reasons: ["限时", "组队更嗨"],
      desc: "适合你想停下来玩 10 分钟的时候。",
    });
    return;
  }

  // 世界杯优先（限时/氛围）
  applyActCardState(worldcup, {
    rank: 1,
    reasons: ["限时", "互动氛围"],
    desc: "趁人不多先玩一把，更容易拿高分。",
  });
  applyActCardState(match3, {
    rank: 2,
    reasons: ["随时可玩", "碎片时间"],
    desc: "等候或步行间隙更适合它。",
  });
}

function openSuggestCard(card) {
  const pref = card?.dataset?.aiPref;
  if (pref) {
    nowAiPref = pref;
    rankAiActivities("suggest");
  }
  if (card?.dataset?.suggest) openSuggestDetail(card.dataset.suggest);
}

// 点击“此刻建议”卡片任意区域进入详情；“问问我”单独进入智能体问答。
$$(".suggestCard").forEach((card) => {
  card.addEventListener("click", (e) => {
    if (e.target.closest(".sgEyebrow")) return;
    openSuggestCard(card);
  });
});

function askSuggestQuestion(btn) {
  switchView("agent");
  setAgentHomeMode("input");
  setTimeout(() => sendPrompt(btn.dataset.ask || ""), 260);
}

$$(".sgEyebrow[data-ask]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    askSuggestQuestion(btn);
  });
});

rankAiActivities("boot");

// 智能快讯：公告型智能体
function setupAiBriefAutoScroll() {
  const deck = document.querySelector("#view-now .aiBriefDeck");
  const slides = deck ? $$(".aiBriefSlide", deck) : [];
  if (!deck || slides.length <= 1) return;

  let index = 0;
  let pausedUntil = 0;
  const go = (next) => {
    index = (next + slides.length) % slides.length;
    deck.scrollTo({ left: Math.max(0, slides[index].offsetLeft - 12), behavior: "smooth" });
  };

  deck.addEventListener("pointerdown", () => {
    pausedUntil = Date.now() + 5000;
  }, { passive: true });
  deck.addEventListener("scroll", () => {
    pausedUntil = Date.now() + 1800;
  }, { passive: true });

  setInterval(() => {
    if (activeView !== "now") return;
    if (Date.now() < pausedUntil) return;
    go(index + 1);
  }, 3200);
}

$("#btnAiBriefAction")?.addEventListener("click", () => {
  renderAiNoticeList();
  switchView("noticeList");
});
$("#btnAiBriefList")?.addEventListener("click", () => {
  renderAiNoticeList();
  switchView("noticeList");
});
$$(".aiBriefSlide[data-notice-id]").forEach((slide) => {
  let startX = 0;
  let startY = 0;
  slide.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });
  slide.addEventListener("click", (e) => {
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) return;
    currentAiNoticeId = slide.dataset.noticeId || "crowd-rise";
    renderAiNoticeDetail(currentAiNoticeId);
    switchView("noticeDetail");
  });
});

// AI给我路线（更靠近主线）
$("#btnAiRouteNow")?.addEventListener("click", () => {
  switchView("agent");
  setTimeout(() => sendPrompt("现在给我一条最适合的游玩路线（含理由：客流/天气/距离），并给我一键开始的顺序建议"), 260);
});

// ---------- 此刻：分类攻略（瀑布流） ----------
const btnAiGuide = $("#btnAiGuide");
btnAiGuide?.addEventListener("click", () => {
  switchView("agent");
  setTimeout(() => sendPrompt("请根据我当前的时间、天气、客流，给我定制一条适合的游玩攻略路线，并按线路、打卡、美食、住宿、交通、拍照、自驾这些分类给我建议"), 260);
});

function getNowCrowdText() {
  const el = document.querySelector("#view-now .aiBriefSlide--crowd .aiBriefValue");
  return (el?.textContent || "").trim();
}

function applyGuideNowPick() {
  const masonry = $("#guideMasonry");
  if (!masonry) return;
  syncNowGuideVisibility(false);
  const crowd = getNowCrowdText();
  const recommendCats =
    crowd.includes("拥挤") || crowd.includes("人多") ? ["精华", "亲子"] : ["拍照", "深度"];

  // 菜单标记“推荐中”
  $$(".guideMenuBtn").forEach((b) => b.classList.remove("isRec"));
  recommendCats.forEach((c) => {
    document.querySelector(`.guideMenuBtn[data-guide-filter="${c}"]`)?.classList.add("isRec");
  });

  const allCards = $$(".guideCard", masonry);
  const cards = allCards.filter((card) => card.dataset.nowHidden !== "1");
  cards.forEach((c) => c.classList.remove("isNowPick"));
  const rec = cards.filter((c) => recommendCats.includes(c.dataset.guideCat));
  const rest = cards.filter((c) => !recommendCats.includes(c.dataset.guideCat));
  const hidden = allCards.filter((card) => card.dataset.nowHidden === "1");

  // 仅在“全部”状态下做“此刻推荐中”排序
  const activeMenu = document.querySelector(".guideMenuBtn.isOn")?.dataset?.guideFilter || "all";
  if (activeMenu === "all") {
    masonry.innerHTML = "";
    [...rec, ...rest, ...hidden].forEach((c) => masonry.appendChild(c));
  }
  rec.slice(0, 2).forEach((c) => c.classList.add("isNowPick"));
}

function getPublishedGuideItem(guideId) {
  return profileListMeta.published.items.find((item) => item.type === "guide" && item.id === guideId);
}

function isGuideVisibleOnNow(guideId) {
  if (deletedPublishedGuideIds.has(guideId)) return false;
  const item = getPublishedGuideItem(guideId);
  if (!item) return true;
  return item.publishStatus !== "private" && item.auditStatus === "已发布";
}

function syncGuideEmptyState() {
  const empty = $("#guideEmptyState");
  if (!empty) return;
  const hasVisibleCard = $$("#guideMasonry .guideCard").some((card) => card.style.display !== "none");
  empty.classList.toggle("isOn", !hasVisibleCard);
  empty.setAttribute("aria-hidden", hasVisibleCard ? "true" : "false");
}

function syncNowGuideVisibility(updatePick = true) {
  const activeMenu = document.querySelector(".guideMenuBtn.isOn")?.dataset?.guideFilter || "all";
  $$("#guideMasonry .guideCard").forEach((card) => {
    const cat = card.dataset.guideCat;
    const passCategory = activeMenu === "all" || cat === activeMenu;
    const passPublish = isGuideVisibleOnNow(card.dataset.guide);
    const hidden = !passCategory || !passPublish;
    card.dataset.nowHidden = passPublish ? "0" : "1";
    card.style.display = hidden ? "none" : "";
    if (!passPublish) card.classList.remove("isNowPick");
  });
  syncGuideEmptyState();
  if (updatePick && activeMenu === "all") applyGuideNowPick();
}

function openRouteFromGuide(routeKey) {
  switchView("tour");
  setTimeout(() => {
    setTourMode("route");
    openSheet(`route-${routeKey}`);
  }, 240);
}
function openFoodFromGuide() {
  switchView("tour");
  setTimeout(() => {
    setTourMode("nearby");
    tourLayer = "food";
    syncTourSurface();
    openSheet("poi-suantang");
  }, 240);
}

// 动线攻略卡片：已改为进入“小红书风格”详情页（见 openGuideDetail）

// 分类攻略：菜单筛选
$$(".guideMenuBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".guideMenuBtn").forEach((b) => b.classList.toggle("isOn", b === btn));
    syncNowGuideVisibility();
  });
});

// 发布攻略：入口与表单交互
$("#btnUploadGuide")?.addEventListener("click", () => {
  delete $("#guideUploadSubmit")?.dataset.editingGuideId;
  switchView("guideUpload");
});

let uploadImageFiles = [];
let uploadTags = [];
const uploadContentLimit = 1000;
const uploadImageLimit = 9;
const uploadTagLimit = 4;

function closeUploadImagePreview() {
  const overlay = $("#imagePreviewOverlay");
  const image = $("#imagePreviewImg");
  if (!overlay) return;
  overlay.classList.remove("isOn");
  overlay.setAttribute("aria-hidden", "true");
  if (image) image.removeAttribute("src");
}

function openUploadImagePreview(index) {
  const item = uploadImageFiles[index];
  const overlay = $("#imagePreviewOverlay");
  const image = $("#imagePreviewImg");
  const count = $("#imagePreviewCount");
  if (!item?.url || !overlay || !image) return;
  image.src = item.url;
  image.alt = `攻略图片预览 ${index + 1}`;
  if (count) count.textContent = `${index + 1}/${uploadImageFiles.length}`;
  overlay.classList.add("isOn");
  overlay.setAttribute("aria-hidden", "false");
}

function syncUploadImageCount() {
  const count = $("#uploadImageCount");
  if (count) count.textContent = `${uploadImageFiles.length}/${uploadImageLimit}`;
}

function renderUploadPreviews() {
  const rail = $("#uploadPreviewRail");
  if (!rail) return;
  if (!uploadImageFiles.length) {
    closeUploadImagePreview();
    rail.innerHTML = "";
    rail.classList.remove("isOn");
    syncUploadImageCount();
    return;
  }
  rail.classList.add("isOn");
  rail.innerHTML = uploadImageFiles.map((item, idx) => `
    <div class="uploadPreviewCard">
      <button class="uploadPreviewOpen" data-upload-preview="${idx}" type="button" aria-label="预览第${idx + 1}张图片">
        <img src="${item.url}" alt="攻略图片预览 ${idx + 1}" />
        ${idx === 0 ? `<span class="uploadPreviewBadge">封面</span>` : ""}
      </button>
      <button class="uploadPreviewRemove" data-upload-remove="${idx}" type="button" aria-label="删除第${idx + 1}张图片">×</button>
    </div>
  `).join("");
  $$(".uploadPreviewOpen", rail).forEach((btn) => {
    btn.addEventListener("click", () => {
      openUploadImagePreview(Number(btn.dataset.uploadPreview));
    });
  });
  $$(".uploadPreviewRemove", rail).forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = Number(btn.dataset.uploadRemove);
      const removed = uploadImageFiles.splice(index, 1)[0];
      if (removed?.url) URL.revokeObjectURL(removed.url);
      closeUploadImagePreview();
      renderUploadPreviews();
    });
  });
  syncUploadImageCount();
}

$("#imagePreviewScrim")?.addEventListener("click", closeUploadImagePreview);
$("#imagePreviewClose")?.addEventListener("click", closeUploadImagePreview);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const overlay = $("#imagePreviewOverlay");
  if (overlay?.classList.contains("isOn")) closeUploadImagePreview();
});

$("#guideUploadImages")?.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []).slice(0, Math.max(0, uploadImageLimit - uploadImageFiles.length));
  if (!files.length) return;
  uploadImageFiles = uploadImageFiles.concat(files.map((file) => ({ file, url: URL.createObjectURL(file) }))).slice(0, uploadImageLimit);
  event.target.value = "";
  renderUploadPreviews();
  if (uploadImageFiles.length >= uploadImageLimit) showToast(`最多上传 ${uploadImageLimit} 张图片`);
});

$("#guideUploadTitle")?.addEventListener("input", (event) => {
  const value = event.target.value.slice(0, 20);
  if (event.target.value !== value) event.target.value = value;
  const count = $("#guideUploadTitleCount");
  if (count) count.textContent = `${value.length}/20`;
});

$("#guideUploadContent")?.addEventListener("input", (event) => {
  const value = event.target.value.slice(0, uploadContentLimit);
  if (event.target.value !== value) event.target.value = value;
  const count = $("#guideUploadContentCount");
  if (count) count.textContent = `${value.length}/${uploadContentLimit}`;
});

function renderUploadTags() {
  const wrap = $("#guideUploadTagPreview");
  const count = $("#guideUploadTagCount");
  if (count) count.textContent = `${uploadTags.length}/${uploadTagLimit}`;
  if (!wrap) return;
  wrap.innerHTML = [
    ...uploadTags.map((tag, idx) => `
      <span class="uploadTag isOn">${tag}<button class="uploadTagRemove" data-tag-remove="${idx}" type="button" aria-label="删除${tag}">×</button></span>
    `),
    uploadTags.length < uploadTagLimit
      ? `<button class="uploadTagAddChip" id="guideUploadTagOpen" type="button"><span class="i i-plus" aria-hidden="true"></span><span>添加标签</span></button>`
      : "",
  ].join("");
  $$(".uploadTagRemove", wrap).forEach((btn) => {
    btn.addEventListener("click", () => {
      uploadTags.splice(Number(btn.dataset.tagRemove), 1);
      renderUploadTags();
    });
  });
  $("#guideUploadTagOpen")?.addEventListener("click", openTagSheet);
}

function openTagSheet() {
  if (activeView !== "guideUpload") return;
  if (uploadTags.length >= uploadTagLimit) {
    showToast(`最多添加 ${uploadTagLimit} 个标签`);
    return;
  }
  $("#tagSheetOverlay")?.classList.add("isOn");
  $("#tagSheet")?.classList.add("isOn");
  setTimeout(() => $("#guideUploadTagInput")?.focus(), 180);
}

function closeTagSheet() {
  $("#tagSheetOverlay")?.classList.remove("isOn");
  $("#tagSheet")?.classList.remove("isOn");
  const input = $("#guideUploadTagInput");
  if (input) input.value = "";
}

function addUploadTag(value) {
  const tag = (value || $("#guideUploadTagInput")?.value || "").trim().slice(0, 5);
  if (!tag) return;
  if (uploadTags.length >= uploadTagLimit) {
    showToast(`最多添加 ${uploadTagLimit} 个标签`);
    return;
  }
  if (uploadTags.includes(tag)) {
    showToast("标签已添加");
    return;
  }
  uploadTags.push(tag);
  renderUploadTags();
  closeTagSheet();
}

$("#tagSheetOverlay")?.addEventListener("click", closeTagSheet);
$("#tagSheetClose")?.addEventListener("click", closeTagSheet);
$("#guideUploadTagConfirm")?.addEventListener("click", () => addUploadTag());
$("#guideUploadTagInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addUploadTag();
  }
});
$$(".uploadTypeOption").forEach((item) => {
  item.addEventListener("click", () => {
    $$(".uploadTypeOption").forEach((option) => {
      const isCurrent = option === item;
      option.classList.toggle("isOn", isCurrent);
      option.setAttribute("aria-checked", isCurrent ? "true" : "false");
    });
  });
});

$("#guideUploadSubmit")?.addEventListener("click", () => {
  const title = $("#guideUploadTitle")?.value.trim();
  const content = $("#guideUploadContent")?.value.trim();
  const type = $(".uploadTypeOption.isOn")?.dataset.guideType;
  const editingGuideId = $("#guideUploadSubmit")?.dataset.editingGuideId || "";
  if (!title) {
    showToast("请先填写攻略标题");
    return;
  }
  if (!uploadImageFiles.length) {
    showToast("请至少上传 1 张攻略图片");
    return;
  }
  if (!content) {
    showToast("请先填写正文内容");
    return;
  }
  if (!type) {
    showToast("请选择所属类型");
    return;
  }
  if (editingGuideId) {
    const item = getPublishedGuideItem(editingGuideId);
    if (item) {
      item.auditStatus = "审核中";
      item.rejectReason = "";
      item.time = getPublishTimeLabel();
      item.publishStatus = "public";
    }
    delete $("#guideUploadSubmit").dataset.editingGuideId;
    syncNowGuideVisibility();
    showToast("已重新提交审核（原型）");
    setTimeout(() => openProfileList("published"), 520);
    return;
  }
  createPendingGuideFromUpload({ title, content, type });
  delete $("#guideUploadSubmit").dataset.editingGuideId;
  currentProfilePublishStatus = "public";
  showToast("攻略已提交审核（原型）");
  setTimeout(() => openProfileList("published"), 520);
});

renderUploadPreviews();
renderUploadTags();

applyGuideNowPick();

// （首页已去掉“景区优选”入口，如需保留二级页可在其他位置接入口）

$$(".goodsTab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".goodsTab").forEach((x) => x.classList.toggle("isOn", x === tab));
    const group = tab.dataset.goodsTab;
    $$(".goodsProduct").forEach((card) => {
      card.style.display = card.dataset.goodsGroup === group ? "" : "none";
    });
  });
});

$$("[data-buy-item]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    showToast(`已进入购买：${btn.dataset.buyItem}`);
  });
});

// （已去掉“我的”页面）

// ---------- 智能体：对话模拟 ----------
const chatList = $("#chatList");
const chatInput = $("#chatInput");
const btnSend = $("#btnSend");
const btnMic = $("#btnMic");
const btnCamera = $("#btnCamera");
let chatStarted = false;

function ensureChatMode() {
  if (chatStarted || !chatList) return;
  chatStarted = true;
  chatList.className = "chatList";
  chatList.setAttribute("aria-label", "智能体对话");
  chatList.innerHTML = "";
  document.querySelector("#view-agent .agentShowcase")?.classList.add("isChatting");
}

function appendMsg(role, text, opts = {}) {
  ensureChatMode();
  const msg = document.createElement("div");
  msg.className = `msg ${role === "me" ? "msg-me" : "msg-bot"}`;

  if (role === "bot") {
    const av = document.createElement("div");
    av.className = "avatar a-bot";
    av.setAttribute("aria-hidden", "true");
    msg.appendChild(av);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = text;
  msg.appendChild(bubble);

  if (role === "me") {
    const av = document.createElement("div");
    av.className = "avatar a-me";
    av.setAttribute("aria-hidden", "true");
    msg.appendChild(av);
  }

  chatList.appendChild(msg);
  msg.animate(
    [{ opacity: 0, transform: "translate3d(0, 10px, 0)" }, { opacity: 1, transform: "translate3d(0,0,0)" }],
    { duration: 260, easing: "cubic-bezier(.2,.9,.2,1)" }
  );
  if (opts.scroll !== false) chatList.scrollTo({ top: chatList.scrollHeight, behavior: "smooth" });
  return msg;
}

function botReplyFor(prompt) {
  const p = prompt.trim();
  if (!p) return "我在。你想先去哪个景点，或告诉我你的时间/偏好，我给你一条顺路路线。";
  if (p.includes("门票") || p.includes("买票") || p.includes("预约") || p.includes("购票")) {
    return (
      "黄果树景区建议提前完成线上购票/预约，入园时准备好身份证或购票二维码。<br><br>" +
      "出行前建议：<br>" +
      "1) 先确认当日开放时间和票种。<br>" +
      "2) 高峰日尽量提前购买。<br>" +
      "3) 到达后优先看接驳车排队情况，我可以继续帮你安排入园后的第一站。"
    );
  }
  if (p.includes("停车") || p.includes("停车场")) {
    return (
      "停车建议：优先导航到黄果树游客中心停车区域，再根据现场指引换乘入园。<br><br>" +
      "我建议你：<br>" +
      "1) 临近中午到达，预留 15–25 分钟停车和换乘。<br>" +
      "2) 带老人/儿童可先在游客中心补给。<br>" +
      "3) 如果你需要，我可以直接带你去导航页。"
    );
  }
  if (p.includes("行李") || p.includes("寄存")) {
    return (
      "行李寄存建议优先在游客中心附近确认，轻装进入主瀑区域体验会更好。<br><br>" +
      "注意事项：<br>" +
      "1) 贵重物品随身携带。<br>" +
      "2) 大件行李先寄存再换乘。<br>" +
      "3) 返程前预留取件时间，避免错过接驳或返程车。"
    );
  }
  if (p.includes("适不适合去") || p.includes("出发时间") || p.includes("去黄果树景区")) {
    return (
      "今天适合去，但建议避开 14:30 后主瀑观景台人流上升时段。<br><br>" +
      "推荐出发：上午或午后稍早到达，先完成主瀑观景，再去天星桥或餐饮补给点。若你告诉我出发地，我可以继续估算路程和入园节奏。"
    );
  }
  if (p.includes("半天") || p.includes("路线") || p.includes("哪条线")) {
    return (
      "给你一条<strong>黄果树精华半日</strong>（轻松版）：<br>" +
      "1) 观瀑台（15–20min，建议先右侧栈道）<br>" +
      "2) 天星桥（30–40min，湿滑提醒）<br>" +
      "3) 酸汤鱼（排队少）<br><br>" +
      "我已把路线同步到 <strong>趣游-伴游地图</strong>，要现在打开吗？"
    );
  }
  if (p.includes("出片") || p.includes("角度")) {
    return (
      "出片建议：<br>" +
      "• 观瀑台：镜头略低，瀑布占画面 2/3，逆光有彩虹概率<br>" +
      "• 天星桥：近景拍水纹+青苔，适合慢门<br><br>" +
      "要我在地图上标记 <strong>出片点</strong> 给你吗？"
    );
  }
  if (p.includes("老人") || p.includes("轻松")) {
    return (
      "老人/带娃建议：优先走<strong>平缓路线</strong>，避开湿滑台阶；每 30–40 分钟找一次休息点。<br><br>" +
      "我可以给你一条“轻松路线”，并在地图上标出卫生间/休息区。"
    );
  }
  if (p.includes("餐饮") || p.includes("吃")) {
    return "附近推荐：酸汤鱼（排队少，辣度可选）/ 小吃补给点（离你 6 分钟）。要我在伴游地图里帮你导航过去吗？";
  }
  return "收到。为了更准：你现在在景区内还是游前？大概有多久时间、是否自驾/带老人？我可以立刻生成路线并给出此刻建议。";
}

function simulateBotTyping(replyHtml) {
  ensureChatMode();
  const wrap = document.createElement("div");
  wrap.className = "msg msg-bot";
  wrap.innerHTML = `
    <div class="avatar a-bot" aria-hidden="true"></div>
    <div class="bubble">
      <div class="typing" aria-label="正在输入">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  chatList.appendChild(wrap);
  chatList.scrollTo({ top: chatList.scrollHeight, behavior: "smooth" });

  setTimeout(() => {
    wrap.remove();
    appendMsg("bot", replyHtml);
  }, 720);
}

function sendPrompt(text) {
  const v = text.trim();
  if (!v) return;
  appendMsg("me", v.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
  simulateBotTyping(botReplyFor(v));
}

function askAgentWithPrompt(text) {
  const v = (text || "").trim();
  if (!v) return;
  setAgentHomeMode("input");
  ensureChatMode();
  if (chatInput) {
    chatInput.value = v;
    chatInput.focus();
  }
  setTimeout(() => {
    if (chatInput) chatInput.value = v;
    if (btnSend) btnSend.click();
    else sendPrompt(v);
  }, 80);
}

btnSend.addEventListener("click", () => {
  sendPrompt(chatInput.value);
  chatInput.value = "";
  chatInput.focus();
});
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnSend.click();
  }
});

// 快捷 chips / mini cards
$$("[data-prompt]").forEach((el) => el.addEventListener("click", () => askAgentWithPrompt(el.dataset.prompt)));

// 语音/拍照的动效提示（原型）
let micHoldTimer = null;
btnMic.addEventListener("pointerdown", () => {
  btnMic.classList.add("isHolding");
  micHoldTimer = setTimeout(() => showToast("模拟：正在录音… 松手发送"), 120);
});
btnMic.addEventListener("pointerup", () => {
  btnMic.classList.remove("isHolding");
  clearTimeout(micHoldTimer);
  showToast("模拟：语音已发送");
});
btnCamera?.addEventListener("click", () => {
  showToast("模拟：拍照识别（路牌/景点/植物）");
});

// ---------- 伴游地图：点位与底部Sheet ----------
const sheet = $("#sheet");
const sheetOverlay = $("#sheetOverlay");
const sheetHandle = $("#sheetHandle");
const poiTitle = $("#poiTitle");
const poiMeta = $("#poiMeta");
const introP = document.querySelector("#panel-intro .p");
const introTags = $$("#panel-intro .tagRow .tag");
const tipSteps = $$("#panel-tips .stepTxt");

const pois = {
  "poi-guanpu": {
    title: "大瀑布观景台",
    meta: "步行 2.0 小时",
    type: "观景台",
    cardSub: "大瀑布观景点",
    intro: "大瀑布观景台视野开阔，可直面黄果树大瀑布雄姿，观赏飞流直下的水势与水雾。",
    tab: "intro",
  },
  "poi-tianxing": {
    title: "天星桥",
    meta: "步行 1.6 小时",
    type: "景点",
    cardSub: "湿滑路段提醒",
    intro: "天星桥以石、水、树相依的景观见长，雨后路面湿滑，适合慢行听讲解。",
    tab: "intro",
  },
  "poi-suantang": {
    title: "酸汤鱼",
    meta: "步行 35 分钟",
    type: "餐饮",
    cardSub: "附近餐饮补给",
    intro: "酸汤鱼适合游览中途补给，辣度可选，当前排队不长，适合错峰用餐。",
    tab: "intro",
  },
  "poi-wc": {
    title: "卫生间",
    meta: "步行 8 分钟",
    type: "卫生间",
    cardSub: "就近公共服务",
    intro: "当前位置附近的公共卫生间，可作为继续游览前的短暂停留点。",
    tab: "intro",
  },
};

const routes = {
  classic: {
    title: "精华半日路线",
    meta: "3 站 · 约 4 小时 · 适合首次到访",
    tab: "tips",
    intro: "一路把黄果树最核心的观瀑点位串起来，避开回流路段，节奏更顺。",
    tags: ["必看", "半日", "省力", "适合亲子"],
    steps: ["观瀑台先拍近景，水雾大记得雨衣。", "天星桥湿滑段注意脚下，建议慢行。", "结束后去吃酸汤鱼，错峰更舒服。"],
  },
  easy: {
    title: "轻松路线",
    meta: "2–3 站 · 约 3 小时 · 省体力",
    tab: "intro",
    intro: "更少爬坡与折返，适合带长辈或想慢慢逛的行程安排。",
    tags: ["省力", "慢玩", "舒适", "休息点多"],
    steps: ["先到观瀑台停留 15 分钟。", "沿栈道慢走到天星桥外围观景。", "就近找休息区补水，再决定是否加点位。"],
  },
  photo: {
    title: "出片路线",
    meta: "3–4 站 · 约 4–5 小时 · 机位优先",
    tab: "ugc",
    intro: "以光线和机位为优先，尽量选人少的角度与逆光彩虹概率更高的时间段。",
    tags: ["出片", "机位", "逆光", "人少角度"],
    steps: ["观瀑台低机位拍全景，留出天空层次。", "天星桥找侧逆光点位，等雾散更透。", "返回路上补拍人像，注意防滑。"],
  },
  depth: {
    title: "深度慢玩路线",
    meta: "4–5 站 · 约 5 小时 · 慢玩沉浸",
    tab: "intro",
    intro: "不只打卡主瀑，把观景、步道和停留节奏都放慢，适合想慢慢玩透的人。",
    tags: ["深度", "慢玩", "沉浸", "慢节奏"],
    steps: ["先在观瀑台停留更久，等水雾和光线变化。", "沿步道慢慢走到天星桥，不赶景点数量。", "中途安排休息和补给，把节奏拉开更舒服。"],
  },
};

let sheetOpen = false;
let sheetY = 0; // drag offset

function openSheet(poiKey = "poi-guanpu") {
  const isRoute = poiKey?.startsWith?.("route-");
  const routeKey = isRoute ? poiKey.replace("route-", "") : null;
  const d = (isRoute ? routes[routeKey] : pois[poiKey]) || pois["poi-guanpu"];

  poiTitle.textContent = d.title;
  poiMeta.textContent = d.meta;
  const cardTitle = $("#tourPoiCardTitle");
  const cardSub = $("#tourPoiCardSub");
  const cardBadge = $(".tourPoiBadge");
  const poiType = d.type || "景点";
  if (cardTitle) cardTitle.textContent = d.title;
  if (cardSub) cardSub.textContent = d.cardSub || `${d.title}点位`;
  if (cardBadge) cardBadge.textContent = poiType;
  document.documentElement.style.setProperty("--tour-poi-type", `"${poiType}"`);

  if (isRoute) {
    if (introP) introP.textContent = d.intro || "这条路线已为你串联最合适的点位。";
    if (introTags?.length) {
      introTags.forEach((t, idx) => (t.textContent = (d.tags && d.tags[idx]) || "推荐"));
    }
    if (tipSteps?.length) {
      tipSteps.forEach((t, idx) => (t.textContent = (d.steps && d.steps[idx]) || "按地图顺序游玩即可。"));
    }
  } else if (introP) {
    introP.textContent = d.intro || "这里是当前推荐点位。";
  }

  sheetOverlay.classList.add("isOn");
  sheet.classList.add("isOn");
  sheetOpen = true;
  sheetY = 0;
  sheet.style.transform = "";
  setPoiTab(d.tab || "intro");
}
function closeSheet() {
  sheetOverlay.classList.remove("isOn");
  sheet.classList.remove("isOn");
  sheetOpen = false;
  sheet.style.transform = "";
}
sheetOverlay.addEventListener("click", closeSheet);

$$(".marker").forEach((m) =>
  m.addEventListener("click", () => {
    setTourAudio("", false);
    focusTourMarker(m.dataset.poi);
    openSheet(m.dataset.poi);
  })
);

// Sheet tabs
function setPoiTab(key) {
  $$(".poiTab").forEach((t) => t.classList.toggle("isOn", t.dataset.poiTab === key));
  $("#panel-intro").classList.toggle("isOn", key === "intro");
  $("#panel-tips").classList.toggle("isOn", key === "tips");
  $("#panel-ugc").classList.toggle("isOn", key === "ugc");
}
$$(".poiTab").forEach((t) => t.addEventListener("click", () => setPoiTab(t.dataset.poiTab)));

// 趣游：推荐路线 vs 标记点服务（让页面主线更清晰）
let tourMode = "route"; // route | nearby
let tourLayer = "spot"; // spot | food | wc | photo

const tourRouteStrip = $("#tourRouteStrip");
const tourChips = $("#tourChips");
const tourRouteSvg = document.querySelector("#view-tour .routeSvg");
const tourMarkers = $$("#view-tour .marker");

function setTourMarkersVisible(layer) {
  const key = layer === "photo" ? "spot" : layer;
  tourMarkers.forEach((m) => {
    const isSpot = m.classList.contains("m-spot");
    const isFood = m.classList.contains("m-food");
    const isWc = m.classList.contains("m-wc");
    const visible =
      (key === "spot" && isSpot) ||
      (key === "food" && isFood) ||
      (key === "wc" && isWc);
    m.style.display = visible ? "" : "none";
  });
}

function syncTourSurface() {
  if (!views.tour) return;
  if (tourMode === "route") {
    tourRouteStrip?.classList.remove("isHidden");
    tourChips?.classList.add("isHidden");
    if (tourRouteSvg) tourRouteSvg.style.display = "";
    setTourMarkersVisible("spot");
    return;
  }
  tourRouteStrip?.classList.add("isHidden");
  tourChips?.classList.remove("isHidden");
  if (tourRouteSvg) tourRouteSvg.style.display = "none";
  setTourMarkersVisible(tourLayer);
}

function setTourMode(nextMode) {
  tourMode = nextMode;
  $$(".tourModeBtn").forEach((b) => b.classList.toggle("isOn", b.dataset.tourMode === nextMode));
  setTourAudio("", false);
  focusTourMarker("");
  closeSheet();
  syncTourSurface();
}

$$(".tourModeBtn").forEach((b) => b.addEventListener("click", () => setTourMode(b.dataset.tourMode)));

// 推荐路线：仅做视觉选择（原型可扩展为切换路线/高亮点位）
$$(".routeChip").forEach((c) =>
  c.addEventListener("click", () => {
    $$(".routeChip").forEach((x) => x.classList.toggle("isOn", x === c));
    openSheet(`route-${c.dataset.route}`);
  })
);

// 就近服务：图层筛选（真实切换点位）
$$(".tourChips .chip").forEach((c) => {
  c.addEventListener("click", () => {
    $$(".tourChips .chip").forEach((x) => x.classList.toggle("isOn", x === c));
    tourLayer = c.dataset.layer;
    syncTourSurface();
  });
});

$("#btnTourSearch")?.addEventListener("click", () => showToast("搜索（原型）"));
$("#tourBackBtn")?.addEventListener("click", () => switchView("now"));
$("#mapNavBackBtn")?.addEventListener("click", () => {
  switchView("now");
  previousTopbarSourceView = "now";
});
$("#tourSheetClose")?.addEventListener("click", closeSheet);

// Sheet actions
$("#poiNav").addEventListener("click", () => showToast("已开始导航（原型）"));
$("#poiAudio").addEventListener("click", () => {
  showToast("正在播放讲解（原型）");
  // 小音波动效
  poiTitle.animate([{ letterSpacing: ".2px" }, { letterSpacing: ".8px" }, { letterSpacing: ".2px" }], {
    duration: 520,
    easing: "ease-in-out",
  });
});
$("#poiSave").addEventListener("click", () => showToast("已收藏到「我的路线」"));

// Ask chips on map -> send into chat
$$(".askChip").forEach((b) =>
  b.addEventListener("click", () => {
    const q = b.dataset.ask;
    showToast("已为你提问到智能体");
    switchView("agent");
    setTimeout(() => sendPrompt(q), 520);
  })
);

// Sheet ask -> chat
const sheetAskInput = $("#sheetAskInput");
$("#sheetAskSend").addEventListener("click", () => {
  const q = sheetAskInput.value.trim();
  if (!q) return;
  sheetAskInput.value = "";
  showToast("已提问到智能体");
  switchView("agent");
  setTimeout(() => sendPrompt(q), 520);
});
sheetAskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("#sheetAskSend").click();
  }
});

// Sheet drag (轻量模拟)
let dragging = false;
let startY = 0;
let startOffset = 0;
function onDragStart(e) {
  if (!sheetOpen) return;
  dragging = true;
  startY = e.clientY;
  startOffset = sheetY;
  sheet.classList.add("isDragging");
  sheet.setPointerCapture?.(e.pointerId);
}
function onDragMove(e) {
  if (!dragging) return;
  const dy = e.clientY - startY;
  sheetY = Math.max(0, startOffset + dy);
  sheet.style.transform = `translate3d(0, ${sheetY}px, 0)`;
  sheetOverlay.style.opacity = `${Math.max(0, 1 - sheetY / 260)}`;
}
function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  sheet.classList.remove("isDragging");
  if (sheetY > 140) closeSheet();
  else {
    sheetY = 0;
    sheet.style.transform = "";
    sheetOverlay.style.opacity = "";
  }
}
sheetHandle.addEventListener("pointerdown", onDragStart);
window.addEventListener("pointermove", onDragMove, { passive: true });
window.addEventListener("pointerup", onDragEnd, { passive: true });

// Map plus action
$("#btnMapPlus")?.addEventListener("click", () => {
  openSheet("poi-guanpu");
  showToast("已打开推荐点位");
});

// 全局按钮
$("#btnGlobal").addEventListener("click", () => openModal("tips"));
btnScenicSwitch?.addEventListener("click", () => {
  if (activeView === "agent") {
    switchView("profile");
    return;
  }
  if (activeView === "profile") {
    switchView("agent");
    setAgentHomeMode("dock");
    return;
  }
  if (activeView === "profileList") {
    switchView("profile");
    return;
  }
  if (activeView === "guideDetail" && lastGuideDetailSource === "profileList") {
    switchView("profileList");
    return;
  }
  if (activeView === "rankDetail" && lastRankDetailSource === "profileList") {
    switchView("profileList");
    return;
  }
  if (activeView === "now") {
    switchView("agent");
    setAgentHomeMode("dock");
    return;
  }
  if (
    activeView === "noticeList" ||
    activeView === "noticeDetail" ||
    activeView === "guideDetail" ||
    activeView === "guideUpload" ||
    activeView === "suggestDetail" ||
    activeView === "rankDetail" ||
    activeView === "goods" ||
    activeView === "tour" ||
    activeView === "mapNav"
  ) {
    switchView("now");
    return;
  }
  showToast("切换景区（原型）");
});
btnLanguage?.addEventListener("click", () => showToast("多语言切换（原型）"));
btnProfile?.addEventListener("click", () => switchView("profile"));
agentModeToggle?.addEventListener("click", () => {
  if (activeView !== "agent") return;
  setAgentHomeMode(agentHomeMode === "input" ? "dock" : "input");
});

// ---------- 启动：轻微入场 ----------
function bootEntrance() {
  const stage = $("#stage");
  stage.animate(
    [
      { opacity: 0, transform: "translate3d(0, 10px, 0) scale(.99)" },
      { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
    ],
    { duration: 420, easing: "cubic-bezier(.2,.9,.2,1)" }
  );
}

bindRipple();
bootEntrance();
syncAgentHomeSurface();
syncTopbarByView();
syncTourSurface();
bindSuggestStack();
setupAiBriefAutoScroll();

// ---------- 每次进入：Mascot 欢迎 + 收导为输入态 ----------
function updateMascotDockVars() {
  const tabs = document.querySelector(".tabs");
  const target = document.querySelector(".tabIconWrap--avatar");
  const pill = document.querySelector(".tabPill");
  if (!tabs || !target) return;
  const a = tabs.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const x = b.left - a.left + b.width / 2;
  const y = b.top - a.top + b.height / 2;
  document.body.style.setProperty("--dock-x", `${x}px`);
  document.body.style.setProperty("--dock-y", `${y}px`);
  if (pill) {
    const p = pill.getBoundingClientRect();
    const pillTop = p.top - a.top;
    document.body.style.setProperty("--pill-top", `${pillTop}px`);
  }
}

function runMascotIntroEveryTime() {
  const intro = document.getElementById("mascotIntro");
  if (!intro) return;

  setAgentHomeMode("dock");
  updateMascotDockVars();
  window.addEventListener("resize", () => {
    updateMascotDockVars();
  });

  // 先显示在底导上方（放大、摇头、眨眼）
  intro.style.display = "block";
  intro.classList.add("isOn");
  document.body.classList.add("mascotIntroPlaying");

  // 2秒后缩回到第一个Tab
  setTimeout(() => {
    document.body.classList.remove("mascotIntroPlaying");
    document.body.classList.add("mascotDocking");
  }, 2000);

  // 再稍等让回位过渡完成，然后隐藏叠层（由底导头像接管）
  setTimeout(() => {
    document.body.classList.remove("mascotDocking");
    intro.classList.remove("isOn");
    intro.style.display = "none";
    setAgentHomeMode("dock");
  }, 2600);
}

runMascotIntroEveryTime();

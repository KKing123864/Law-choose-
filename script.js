// ============================================================
//  请测出你的法律人格 · 测试引擎（纯前端）
//  流程：Hero → 分步问答（进度条）→ 计算人格
//        → 结果页：人物画像入场动画（走入 → 变形为人际关系图谱）
//        → 人格解析 + 三个可折叠模块（溯源 / 关联匹配 / 就业适配）
//        → 全部人格画廊
// ============================================================

(function () {
  "use strict";

  // ---------- DOM ----------
  var startBtn = document.getElementById("startBtn");
  var quiz = document.getElementById("quiz");
  var progressFill = document.getElementById("progressFill");
  var progressText = document.getElementById("progressText");
  var qText = document.getElementById("qText");
  var optionsWrap = document.getElementById("options");
  var prevBtn = document.getElementById("prevBtn");
  var result = document.getElementById("result");
  var resultCard = document.getElementById("resultCard");
  var gallery = document.getElementById("gallery");
  var galleryGrid = document.getElementById("galleryGrid");

  // ---------- 状态 ----------
  var current = 0;
  var answers = new Array(QUESTIONS.length).fill(null); // 每题选中的 option 索引
  var introTimers = [];

  var REDUCED_MOTION = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 工具 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function personaById(id) {
    for (var i = 0; i < PERSONAS.length; i++) if (PERSONAS[i].id === id) return PERSONAS[i];
    return PERSONAS[0];
  }
  function clearTimers() {
    introTimers.forEach(function (t) { clearTimeout(t); });
    introTimers = [];
  }
  function later(fn, ms) { introTimers.push(setTimeout(fn, ms)); }

  // ---------- 由题库自动推导每个人格的「目标坐标」
  //   数据未显式给出 profile，这里从「投给某人格的选项」的平均轴向量
  //   推算，既保证 finish() 的轴距离决胜有意义，也避免 p.profile 不存在而崩溃。
  var PROFILES = {};
  (function buildProfiles() {
    PERSONAS.forEach(function (p) {
      PROFILES[p.id] = { _n: 0 };
      AXES.forEach(function (a) { PROFILES[p.id][a.key] = 0; });
    });
    QUESTIONS.forEach(function (q) {
      q.options.forEach(function (o) {
        if (!o.vote || !PROFILES[o.vote]) return;
        AXES.forEach(function (a) { PROFILES[o.vote][a.key] += (o.axes && o.axes[a.key]) || 0; });
        PROFILES[o.vote]._n += 1;
      });
    });
    PERSONAS.forEach(function (p) {
      var pr = PROFILES[p.id];
      if (pr._n) AXES.forEach(function (a) { pr[a.key] = pr[a.key] / pr._n; });
    });
  })();

  // ---------- 渲染单题（仅问题 + 选项，无题型标注） ----------
  function renderQuestion() {
    var item = QUESTIONS[current];
    qText.textContent = item.q;

    optionsWrap.innerHTML = "";
    item.options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "opt" + (answers[current] === i ? " is-picked" : "");
      btn.innerHTML = '<span class="opt__dot" aria-hidden="true"></span><span class="opt__text">' + esc(opt.text) + "</span>";
      btn.addEventListener("click", function () {
        answers[current] = i;
        optionsWrap.querySelectorAll(".opt").forEach(function (o, j) {
          o.classList.toggle("is-picked", j === i);
        });
        setTimeout(function () {
          if (current < QUESTIONS.length - 1) {
            current++;
            renderQuestion();
          } else {
            finish();
          }
        }, 260);
      });
      optionsWrap.appendChild(btn);
    });

    var pct = Math.round((current / QUESTIONS.length) * 100);
    progressFill.style.width = pct + "%";
    progressText.textContent = "第 " + (current + 1) + " / " + QUESTIONS.length + " 题";

    prevBtn.disabled = current === 0;
    prevBtn.style.visibility = current === 0 ? "hidden" : "visible";

    quiz.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
  }

  // ---------- 计算人格（主投票 + 坐标决胜） ----------
  function finish() {
    var N = QUESTIONS.length;
    var votes = {};
    PERSONAS.forEach(function (p) { votes[p.id] = 0; });
    var userVec = {};
    AXES.forEach(function (a) { userVec[a.key] = 0; });

    answers.forEach(function (optIdx, qi) {
      if (optIdx === null) return;
      var opt = QUESTIONS[qi].options[optIdx];
      if (opt.vote) votes[opt.vote] += 1;
      AXES.forEach(function (a) {
        userVec[a.key] += (opt.axes && opt.axes[a.key]) || 0;
      });
    });
    AXES.forEach(function (a) { userVec[a.key] = userVec[a.key] / N; });

    var best = PERSONAS[0];
    var bestVotes = -1;
    var bestDist = Infinity;
    PERSONAS.forEach(function (p) {
      var v = votes[p.id];
      var d = 0;
      AXES.forEach(function (a) {
        var target = (PROFILES[p.id] && PROFILES[p.id][a.key]) || 0;
        var diff = userVec[a.key] - target;
        d += diff * diff;
      });
      d = Math.sqrt(d);
      if (v > bestVotes || (v === bestVotes && d < bestDist)) {
        bestVotes = v; bestDist = d; best = p;
      }
    });

    var matchPct = Math.max(60, Math.min(99, Math.round((bestVotes / 3) * 100)));

    progressFill.style.width = "100%";
    progressText.textContent = "已完成";

    showResult(best, userVec, matchPct);
  }

  /* ============================================================
     结果页
     ============================================================ */

  // 倾向解读（溯源模块用）
  var LEAN_COMMENT = {
    rule: "当规则与其他价值冲突时，你下意识站在规则一边——秩序与底线对你有近乎本能的分量。",
    human: "当条文与人心冲突，你下意识先看见「人」——你不忍心让任何具体的人成为抽象规则的代价。",
    interest: "你习惯先掂量结果的分量——哪个方案能让更多人过得更好，哪个就更接近正确。",
    balance: "你既不盲从规则也不感情用事，总在具体情境里掂量分寸——分寸感是你最深的本能。"
  };

  // 溯源模块优先引用的经典题（按顺序取 3 道）
  var CLASSIC_ORDER = ["q1", "q10", "q6", "q2", "q4"];

  function buildOriginHtml(persona) {
    var counts = { rule: 0, human: 0, interest: 0, balance: 0 };
    var total = 0;
    answers.forEach(function (optIdx, qi) {
      if (optIdx === null) return;
      var lean = QUESTIONS[qi].options[optIdx].lean;
      if (lean && counts[lean] !== undefined) { counts[lean]++; total++; }
    });

    // 主导倾向
    var domKey = "balance", domMax = -1;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > domMax) { domMax = counts[k]; domKey = k; }
    });
    var domName = LEAN_NAMES[domKey];

    // 经典题引用（只取用户答过、且有 lean 的）
    var quotes = [];
    CLASSIC_ORDER.forEach(function (qid) {
      if (quotes.length >= 3) return;
      var qi = -1;
      QUESTIONS.forEach(function (qq, idx) { if (qq.id === qid) qi = idx; });
      if (qi < 0 || answers[qi] === null) return;
      var opt = QUESTIONS[qi].options[answers[qi]];
      if (!opt.lean) return;
      quotes.push({ hint: QUESTIONS[qi].hint, text: opt.text, lean: opt.lean });
    });
    if (!quotes.length) {
      answers.forEach(function (optIdx, qi) {
        if (quotes.length >= 2 || optIdx === null) return;
        var opt = QUESTIONS[qi].options[optIdx];
        if (opt.lean) quotes.push({ hint: QUESTIONS[qi].hint, text: opt.text, lean: opt.lean });
      });
    }

    var leanLine = Object.keys(counts).map(function (k) {
      return "「" + LEAN_NAMES[k] + "」<b>" + counts[k] + "</b> 次";
    }).join("、");

    var quoteHtml = quotes.map(function (qt) {
      return (
        '<li class="origin__quote">' +
        '<span class="origin__scene">面对「' + esc(qt.hint) + "」，你选择了：</span>" +
        '<span class="origin__pick">“' + esc(qt.text) + '”</span>' +
        '<span class="origin__read">' + LEAN_COMMENT[qt.lean] + "</span>" +
        "</li>"
      );
    }).join("");

    var chainHtml =
      '<div class="origin__chain">' +
      '<span class="origin__step">答题选择<br><i>' + quotes.length + " 道经典两难题</i></span>" +
      '<span class="origin__arrow">→</span>' +
      '<span class="origin__step">思维倾向<br><i>' + domName + "</i></span>" +
      '<span class="origin__arrow">→</span>' +
      '<span class="origin__step origin__step--final">人格定型<br><i>' + esc(persona.name) + "</i></span>" +
      "</div>";

    return (
      '<div class="module__body origin">' +
      '<p class="origin__stat">在 12 道两难抉择中，你共做出 <b>' + total + "</b> 次有效倾向选择：" + leanLine +
      "。你最深层的思维底色是<b class=\"origin__dom\" style=\"color:" + persona.color + "\">「" + domName + "」</b>。</p>" +
      '<ol class="origin__quotes">' + quoteHtml + "</ol>" +
      '<p class="origin__read origin__read--dom">' + LEAN_COMMENT[domKey] + "</p>" +
      '<p class="origin__why">' + esc(persona.origin) + "</p>" +
      '<p class="origin__concl">这不是随机的标签：当<b>「' + domName + "」</b>成为你在大多数两难中的第一反应，" +
      "它就会在一次次选择里沉淀为稳定的人格结构——<b style=\"color:" + persona.color + "\">" + esc(persona.name) + "</b>，就是它长出来的形状。</p>" +
      chainHtml +
      "</div>"
    );
  }

  function buildRelationsHtml(persona) {
    var groups = [
      { key: "partner", label: "最适合深度合作", desc: "思维互补、工作合拍，协作效率最高", cls: "rel--partner" },
      { key: "friend", label: "最适合交友相处", desc: "价值观兼容、冲突最少，相处最舒服", cls: "rel--friend" },
      { key: "neutral", label: "适配度一般", desc: "普通相处，无明显冲突也无高度契合", cls: "rel--neutral" },
      { key: "conflict", label: "冲突较高 · 不易磨合", desc: "思维逻辑差异大，容易争论与内耗", cls: "rel--conflict" }
    ];
    var html = '<div class="module__body rel">';
    groups.forEach(function (g) {
      var ids = persona.relations[g.key] || [];
      var chips = ids.map(function (id) {
        var p = personaById(id);
        return (
          '<span class="rel__chip ' + g.cls + '">' +
          '<img class="rel__ava" src="' + p.img + '" alt="" />' +
          '<span class="rel__name">' + esc(p.name) + "</span>" +
          '<span class="rel__tag">「' + esc(p.tagline) + "」</span>" +
          "</span>"
        );
      }).join("");
      html +=
        '<div class="rel__group">' +
        '<div class="rel__head"><span class="rel__label ' + g.cls + '">' + g.label + "</span>" +
        '<span class="rel__desc">' + g.desc + "</span></div>" +
        '<div class="rel__chips">' + chips + "</div>" +
        "</div>";
    });
    return html + "</div>";
  }

  function buildCareersHtml(persona) {
    function items(arr) {
      return arr.map(function (it) {
        return '<li class="job__item"><span class="job__role">' + esc(it.r) + "</span>" +
          '<span class="job__why">' + esc(it.w) + "</span></li>";
      }).join("");
    }
    var avoid = persona.careers.avoid.map(function (a) {
      return '<li class="job__avoidItem">⚠️ ' + esc(a) + "</li>";
    }).join("");
    return (
      '<div class="module__body job">' +
      '<div class="job__block"><h5 class="job__title job__title--legal">⚖️ 最优适配 · 法律职业</h5>' +
      '<ul class="job__list">' + items(persona.careers.legal) + "</ul></div>" +
      '<div class="job__block"><h5 class="job__title job__title--cross">🌐 高度适配 · 跨行业岗位</h5>' +
      '<ul class="job__list">' + items(persona.careers.cross) + "</ul></div>" +
      '<div class="job__block job__block--avoid"><h5 class="job__title job__title--avoid">🚧 职业避坑指南</h5>' +
      '<ul class="job__avoid">' + avoid + "</ul>" +
      '<p class="job__note">避坑逻辑：以上岗位与你的人格优势（' + esc(persona.strength.split("；")[0]) +
      "）匹配度低，长期从事容易内耗。</p></div>" +
      "</div>"
    );
  }

  // ---------- 入场动画 + 关系图谱 ----------
  function buildIntro(persona) {
    var others = PERSONAS.filter(function (p) { return p.id !== persona.id; });
    var W = 100, H = 100;
    var lines = "";
    var nodes = "";

    others.forEach(function (p, i) {
      var angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
      var x = 50 + 42 * Math.cos(angle);
      var y = 50 + 40 * Math.sin(angle);
      var kind = "neutral";
      if (persona.relations.partner.indexOf(p.id) >= 0) kind = "partner";
      else if (persona.relations.friend.indexOf(p.id) >= 0) kind = "friend";
      else if (persona.relations.conflict.indexOf(p.id) >= 0) kind = "conflict";
      lines +=
        '<line class="edge edge--' + kind + '" x1="50" y1="50" x2="' + x.toFixed(2) + '" y2="' + y.toFixed(2) + '" style="transition-delay:' + (900 + i * 55) + 'ms" />';
      nodes +=
        '<span class="gnode gnode--' + kind + '" style="left:' + x.toFixed(2) + "%;top:" + y.toFixed(2) +
        "%;transition-delay:" + (950 + i * 55) + 'ms" title="' + esc(p.name) + '">' +
        '<img src="' + p.img + '" alt="' + esc(p.name) + '" /></span>';
    });

    return (
      '<div class="intro" id="introStage">' +
      '<svg class="intro__graph" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line class="edge edge--self" x1="50" y1="50" x2="50" y2="50" />' + lines + "</svg>" +
      nodes +
      '<span class="gnode gnode--self" id="selfNode"><img src="' + persona.img + '" alt="' + esc(persona.name) + '" /></span>' +
      '<img class="intro__walker" id="walker" src="' + persona.img + '" alt="' + esc(persona.name) + '" />' +
      "</div>"
    );
  }

  function runIntro() {
    var stage = document.getElementById("introStage");
    var walker = document.getElementById("walker");
    var selfNode = document.getElementById("selfNode");
    if (!stage) return;

    if (REDUCED_MOTION) {
      stage.classList.add("intro--instant");
      document.getElementById("resultBody").classList.add("is-shown");
      return;
    }

    // 第 1 幕：人物走入
    later(function () { walker.classList.add("is-walking"); }, 60);
    // 第 2 幕：变形为关系图谱（walker 消隐，图谱中你的头像点亮）
    later(function () {
      stage.classList.add("intro--graph");
      walker.classList.add("is-morphing");
      selfNode.classList.add("is-on");
    }, 1900);
    // 第 3 幕：图谱定格，揭示完整结果
    later(function () {
      stage.classList.add("intro--done");
      var body = document.getElementById("resultBody");
      if (body) body.classList.add("is-shown");
    }, 3500);
  }

  // ---------- 渲染结果 ----------
  function showResult(persona, userVec, matchPct) {
    clearTimers();

    var axisHtml = AXES.map(function (a) {
      var v = userVec[a.key];
      var pos = Math.max(2, Math.min(98, 50 + v * 22));
      return (
        '<div class="axis">' +
        '<span class="axis__side axis__side--l">' + a.left + "</span>" +
        '<span class="axis__track"><span class="axis__marker" style="left:' + pos + '%"></span></span>' +
        '<span class="axis__side axis__side--r">' + a.right + "</span>" +
        "</div>"
      );
    }).join("");

    resultCard.style.setProperty("--accent", persona.color);
    resultCard.innerHTML =
      buildIntro(persona) +
      '<div class="result__body" id="resultBody">' +
      '<div class="result__hero">' +
      '<span class="result__portraitWrap" style="--accent:' + persona.color + '">' +
      '<img class="result__portrait" src="' + persona.img + '" alt="' + esc(persona.name) + '" />' +
      '<span class="result__emoji" style="background:' + persona.color + '">' + persona.emoji + "</span>" +
      "</span>" +
      '<div class="result__head">' +
      '<span class="result__kicker">你的法律人格是</span>' +
      '<h3 class="result__name">' + esc(persona.name) + "</h3>" +
      '<span class="result__figure">原型 · ' + esc(persona.figure) + "</span>" +
      "</div>" +
      '<span class="result__match" style="color:' + persona.color + '">契合度 ' + matchPct + "%</span>" +
      "</div>" +
      '<p class="result__tagline">「' + esc(persona.tagline) + "」</p>" +
      '<p class="result__desc">' + esc(persona.desc) + "</p>" +

      '<div class="deep">' +
      '<h4 class="deep__title">人格深度解析</h4>' +
      '<p class="deep__text">' + esc(persona.analysis) + "</p>" +
      '<div class="deep__grid">' +
      '<div class="deep__cell deep__cell--s"><h5>💪 人格优势</h5><p>' + esc(persona.strength) + "</p></div>" +
      '<div class="deep__cell deep__cell--b"><h5>🪞 盲点提醒</h5><p>' + esc(persona.blind) + "</p></div>" +
      "</div></div>" +

      '<div class="result__axes">' +
      '<h4 class="result__axesTitle">你的法理坐标</h4>' +
      axisHtml +
      "</div>" +

      '<div class="modules">' +
      '<details class="module module--origin">' +
      '<summary class="module__head"><span class="module__ico">🧭</span>' +
      '<span class="module__titles"><span class="module__name">人格溯源分析</span>' +
      '<span class="module__sub">你为什么测出了这个人格</span></span>' +
      '<span class="module__chev">▾</span></summary>' +
      buildOriginHtml(persona) +
      "</details>" +
      '<details class="module module--rel">' +
      '<summary class="module__head"><span class="module__ico">🔗</span>' +
      '<span class="module__titles"><span class="module__name">十六人格关联匹配</span>' +
      '<span class="module__sub">合作 · 交友 · 磨合图谱</span></span>' +
      '<span class="module__chev">▾</span></summary>' +
      buildRelationsHtml(persona) +
      "</details>" +
      '<details class="module module--job">' +
      '<summary class="module__head"><span class="module__ico">💼</span>' +
      '<span class="module__titles"><span class="module__name">多元就业适配分析</span>' +
      '<span class="module__sub">法律体制内外 + 跨界岗位</span></span>' +
      '<span class="module__chev">▾</span></summary>' +
      buildCareersHtml(persona) +
      "</details>" +
      "</div>" +

      '<div class="result__actions">' +
      '<button class="btn btn--primary" id="retakeBtn" type="button">再测一次</button>' +
      '<button class="btn btn--ghost" id="galleryBtn" type="button">看看其他 15 种人格 →</button>' +
      "</div>" +
      "</div>";

    result.hidden = false;
    quiz.hidden = true;
    result.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });

    runIntro();

    // 兜底：无论入场动画定时器是否触发，确保结果正文最终可见（避免任何“卡住”观感）
    setTimeout(function () {
      var body = document.getElementById("resultBody");
      if (body) body.classList.add("is-shown");
    }, 4200);

    document.getElementById("retakeBtn").addEventListener("click", reset);
    document.getElementById("galleryBtn").addEventListener("click", function () {
      renderGallery();
      gallery.hidden = false;
      gallery.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
    });
  }

  // ---------- 渲染全部人格画廊 ----------
  function renderGallery() {
    if (galleryGrid.childElementCount) return;
    var frag = document.createDocumentFragment();
    PERSONAS.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "g-card";
      card.style.setProperty("--accent", p.color);
      card.innerHTML =
        '<span class="g-card__imgWrap" style="--accent:' + p.color + '">' +
        '<img class="g-card__img" src="' + p.img + '" alt="' + esc(p.name) + '" />' +
        '<span class="g-card__emoji">' + p.emoji + "</span></span>" +
        '<h4 class="g-card__name">' + esc(p.name) + "</h4>" +
        '<span class="g-card__figure">' + esc(p.figure) + "</span>" +
        '<p class="g-card__tag">「' + esc(p.tagline) + "」</p>" +
        '<p class="g-card__desc">' + esc(p.desc) + "</p>";
      frag.appendChild(card);
    });
    galleryGrid.appendChild(frag);
  }

  // ---------- 重置 ----------
  function reset() {
    clearTimers();
    current = 0;
    answers.fill(null);
    result.hidden = true;
    gallery.hidden = true;
    quiz.hidden = false;
    progressFill.style.width = "0%";
    renderQuestion();
  }

  // ---------- 开始 ----------
  startBtn.addEventListener("click", function () {
    renderGallery();
    quiz.hidden = false;
    gallery.hidden = true;
    result.hidden = true;
    current = 0;
    renderQuestion();
  });

  prevBtn.addEventListener("click", function () {
    if (current > 0) {
      current--;
      renderQuestion();
    }
  });

  // ---------- 封面：16 张人物画像（不标注人格名称） ----------
  (function buildHeroPortraits() {
    var wrap = document.getElementById("heroPortraits");
    if (!wrap) return;
    wrap.innerHTML = PERSONAS.map(function (p, i) {
      return (
        '<span class="hp" style="animation-delay:' + (0.35 + i * 0.07) + 's">' +
        '<img src="' + p.img + '" alt="" loading="lazy" />' +
        "</span>"
      );
    }).join("");
  })();

  renderGallery();
})();

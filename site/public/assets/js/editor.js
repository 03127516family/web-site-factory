/* editor.js — in-page visual editor for product pages.
 * Loaded as a plain <script> (IIFE, no ESM, no build, no deps).
 * Reads window.__EDIT__ = { slug } and wires up [data-md] elements.
 *
 * Each editable element carries:
 *   data-md   = opaque write-back coordinate (passed back verbatim)
 *   data-edit = "text" | "rich" | "image" | "link"
 *
 * Saving = POST /api/save with JSON
 *   { slug, coord, kind, value }
 */
(function () {
  "use strict";

  var EDIT = (typeof window !== "undefined" && window.__EDIT__) || {};
  var SLUG = EDIT.slug;
  if (!SLUG) {
    // Nothing to edit against; bail quietly.
    return;
  }

  var SAVE_URL = "/api/save";
  var ARRAY_OP_URL = "/api/array-op";
  var IMG_PREFIX = "/assets/img/product/";
  var SCROLL_KEY = "editorScroll";

  // ---------------------------------------------------------------------------
  // small DOM helpers
  // ---------------------------------------------------------------------------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  // ---------------------------------------------------------------------------
  // banner + toast affordances
  // ---------------------------------------------------------------------------
  function mountBanner() {
    var banner = el("div", "editor-banner");
    banner.setAttribute("role", "status");
    banner.textContent = "✎ 编辑模式 · 改动自动保存";
    document.body.appendChild(banner);
    // Give the body breathing room so the fixed banner doesn't cover content.
    document.body.classList.add("editor-active");
  }

  var toastTimer = null;
  function toast(message, ok) {
    var node = document.querySelector(".editor-toast");
    if (!node) {
      node = el("div", "editor-toast");
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.remove("editor-toast--ok", "editor-toast--err");
    node.classList.add(ok ? "editor-toast--ok" : "editor-toast--err");
    // force reflow so re-triggering the transition works
    void node.offsetWidth;
    node.classList.add("editor-toast--show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove("editor-toast--show");
    }, 1800);
  }

  // ---------------------------------------------------------------------------
  // save transport
  // ---------------------------------------------------------------------------
  // Returns a Promise that resolves on success and rejects on failure.
  function save(target, kind, value) {
    var body = {
      slug: SLUG,
      coord: target.dataset.md,
      kind: kind,
      value: value
    };
    target.classList.add("editor-saving");

    return fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res || !res.ok) {
          throw new Error("save failed: " + (res ? res.status : "no response"));
        }
        return res;
      })
      .then(function () {
        target.classList.remove("editor-saving");
        toast("已保存", true); // 已保存
      })
      .catch(function (err) {
        target.classList.remove("editor-saving");
        toast("保存失败", false); // 保存失败
        throw err;
      });
  }

  // ---------------------------------------------------------------------------
  // text / rich: contenteditable
  // ---------------------------------------------------------------------------
  function currentValue(node, kind) {
    // 关键：排除编辑器注入的控件（× 删除徽标、＋添加条等），否则当「单元本身就是可编辑元素」
    // （如规格行 <li> 既是 data-idx 单元又是 data-md 字段）时，徽标会被存进 MD 内容并不断累积。
    var clone = node.cloneNode(true);
    var chrome = clone.querySelectorAll(".editor-remove, .editor-group-bar");
    for (var i = 0; i < chrome.length; i++) chrome[i].remove();
    if (kind === "rich") return clone.innerHTML.trim();
    return (clone.textContent || "").trim();
  }

  function wireEditable(node, kind) {
    node.setAttribute("contenteditable", "true");
    node.setAttribute("spellcheck", "false");

    // When the editable text lives inside an <a> (e.g. the CTA span or a
    // related-product card title/summary), clicks must reach the caret without
    // bubbling up to the ancestor anchor — otherwise the "edit link URL" dialog
    // (or a navigation) steals the interaction. Stop propagation so the click
    // resolves to "place caret here / edit this text".
    node.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });
    node.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // snapshot of the value when focus was gained (used for change detection
    // and rollback on failed save)
    node._editOriginal = null;

    node.addEventListener("focus", function () {
      node._editOriginal = currentValue(node, kind);
    });

    node.addEventListener("blur", function () {
      var original = node._editOriginal;
      var value = currentValue(node, kind);
      // only persist real changes
      if (original == null || value === original) return;

      save(node, kind, value).catch(function () {
        // roll back to the pre-edit value
        if (kind === "rich") {
          node.innerHTML = original;
        } else {
          node.textContent = original;
        }
      });
    });

    if (kind === "text") {
      // Enter commits (blur -> save) instead of inserting a newline.
      node.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          node.blur();
        }
      });
    }
    // rich: Enter falls through to the browser default (newline allowed).
  }

  // ---------------------------------------------------------------------------
  // overlay dialog (shared by image + link)
  // ---------------------------------------------------------------------------
  // opts: { title, current, inputValue, placeholder, withPreview, previewSrc,
  //         onInput(value)->previewSrc|null, onConfirm(value) }
  function openDialog(opts) {
    var overlay = el("div", "editor-overlay");

    var box = el("div", "editor-dialog");
    overlay.appendChild(box);

    box.appendChild(el("div", "editor-dialog__title", opts.title));

    if (opts.current != null) {
      var cur = el("div", "editor-dialog__current");
      cur.textContent = opts.current;
      cur.title = opts.current;
      box.appendChild(cur);
    }

    var input = el("input", "editor-dialog__input");
    input.type = "text";
    input.value = opts.inputValue || "";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    box.appendChild(input);

    var preview = null;
    if (opts.withPreview) {
      preview = el("img", "editor-dialog__preview");
      if (opts.previewSrc) preview.src = opts.previewSrc;
      box.appendChild(preview);
    }

    var actions = el("div", "editor-dialog__actions");
    var cancelBtn = el("button", "editor-btn editor-btn--ghost", "取消"); // 取消
    var okBtn = el("button", "editor-btn editor-btn--primary", "确定"); // 确定
    cancelBtn.type = "button";
    okBtn.type = "button";
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    box.appendChild(actions);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", onKey, true);
    }

    function confirm() {
      var value = input.value;
      close();
      if (typeof opts.onConfirm === "function") opts.onConfirm(value);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirm();
      }
    }

    if (opts.withPreview && preview) {
      input.addEventListener("input", function () {
        var src = typeof opts.onInput === "function" ? opts.onInput(input.value) : null;
        if (src) preview.src = src;
      });
    }

    cancelBtn.addEventListener("click", close);
    okBtn.addEventListener("click", confirm);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  }

  // ---------------------------------------------------------------------------
  // image
  // ---------------------------------------------------------------------------
  // Bare filenames (no slash, no scheme) get the product image prefix for live
  // preview; the value sent to the server is always the raw user input.
  function resolveImgSrc(raw) {
    var v = (raw || "").trim();
    if (!v) return "";
    if (/^(https?:)?\/\//i.test(v) || v.charAt(0) === "/" || v.indexOf("/") !== -1) {
      return v;
    }
    return IMG_PREFIX + v;
  }

  function wireImage(img) {
    // Stop mousedown from reaching swiper / ancestor-anchor handlers. In the
    // gallery thumbnail strip the thumbs are swiper slides that would otherwise
    // navigate the big image; in edit mode a thumbnail is an edit target, so we
    // suppress navigation and just open the image dialog on click.
    img.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });
    img.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var originalSrc = img.getAttribute("src");
      openDialog({
        title: "编辑图片", // 编辑图片
        current: originalSrc || "",
        inputValue: "",
        placeholder: "foo.jpg 或 https://...",
        withPreview: true,
        previewSrc: originalSrc || "",
        onInput: function (value) {
          return resolveImgSrc(value);
        },
        onConfirm: function (value) {
          var raw = (value || "").trim();
          if (!raw) return;
          img.src = resolveImgSrc(raw); // live preview uses resolved src
          save(img, "image", raw).catch(function () {
            img.src = originalSrc || ""; // roll back display
          });
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // link
  // ---------------------------------------------------------------------------
  function wireLink(a) {
    a.addEventListener("click", function (e) {
      // In edit mode, never navigate.
      e.preventDefault();
      e.stopPropagation();
      var originalHref = a.getAttribute("href") || "";
      openDialog({
        title: "编辑链接", // 编辑链接
        current: originalHref,
        inputValue: originalHref,
        placeholder: "https://...",
        withPreview: false,
        onConfirm: function (value) {
          var next = (value || "").trim();
          if (!next || next === originalHref) return;
          a.href = next;
          save(a, "link", next).catch(function () {
            a.href = originalHref; // roll back display
          });
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // anchor neutralization
  // ---------------------------------------------------------------------------
  // Some editable text/images live inside <a> elements (the CTA button, related-
  // product cards, case titles). In edit mode an anchor click must never
  // navigate. We neutralize every anchor that either is itself an editable link
  // or wraps an editable [data-md] descendant.
  //
  // Anchors carrying data-edit="link" are handled by wireLink (which already
  // calls preventDefault + opens the URL dialog), so we skip those here to avoid
  // double-binding. For the remaining wrapper anchors we just cancel navigation;
  // the editable descendants (text/image) stop propagation themselves, so the
  // anchor only ever sees clicks on its non-editable regions — which now do
  // nothing instead of jumping.
  function neutralizeAnchors() {
    var anchors = document.querySelectorAll("a");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (a.getAttribute("data-edit") === "link") continue; // wireLink owns it
      if (!a.querySelector("[data-md]")) continue; // no editable content inside
      a.addEventListener("click", function (e) {
        e.preventDefault();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // scroll persistence across reloads (used by add/remove)
  // ---------------------------------------------------------------------------
  function restoreScroll() {
    var raw;
    try {
      raw = window.sessionStorage.getItem(SCROLL_KEY);
    } catch (e) {
      raw = null;
    }
    if (raw == null) return;
    try {
      window.sessionStorage.removeItem(SCROLL_KEY);
    } catch (e) {
      /* ignore */
    }
    var y = Number(raw);
    if (!isNaN(y)) window.scrollTo(0, y);
  }

  function reloadKeepingScroll() {
    try {
      window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    } catch (e) {
      /* ignore */
    }
    window.location.reload();
  }

  // ---------------------------------------------------------------------------
  // array-op transport (add / remove repeated items)
  // ---------------------------------------------------------------------------
  // op: "add" | "remove". index only meaningful for "remove".
  // Reloads (preserving scroll) on success; red toast on failure.
  var arrayOpBusy = false;
  function arrayOp(group, op, index, control) {
    if (arrayOpBusy) return;
    arrayOpBusy = true;
    if (control) control.classList.add("editor-busy");

    var body = { slug: SLUG, group: group, op: op };
    if (op === "remove") body.index = index;

    fetch(ARRAY_OP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res || !res.ok) {
          throw new Error("array-op failed: " + (res ? res.status : "no response"));
        }
        // success -> reload to pick up the re-rendered list
        reloadKeepingScroll();
      })
      .catch(function (err) {
        arrayOpBusy = false;
        if (control) control.classList.remove("editor-busy");
        toast(op === "add" ? "添加失败" : "删除失败", false); // 添加失败 / 删除失败
        throw err;
      });
  }

  // ---------------------------------------------------------------------------
  // add-control bar (one per [data-group], inserted as a sibling AFTER it)
  // ---------------------------------------------------------------------------
  function wireGroup(group) {
    var name = group.getAttribute("data-group") || "";

    // bar is editor chrome: never carries data-md / data-edit.
    var bar = el("div", "editor-group-bar");

    var label = el("span", "editor-group-bar__label", name);
    bar.appendChild(label);

    var addBtn = el("button", "editor-group-bar__add", "＋ 添加"); // ＋ 添加
    addBtn.type = "button";
    addBtn.title = "添加一项：" + name;
    bar.appendChild(addBtn);

    addBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      arrayOp(name, "add", null, bar);
    });

    // Decide where to mount the bar. The default is the group's next sibling.
    // But when the group lives inside a swiper container (e.g. the gallery
    // thumbnail strip's .swiper-wrapper), that container is overflow:hidden and
    // would clip the bar. In that case hoist the bar out to a non-clipped
    // ancestor so the "＋ 添加" control stays visible below the gallery.
    var anchorNode = group; // bar is inserted right after this node
    var swiperContainer = group.closest ? group.closest(".swiper-container") : null;
    if (swiperContainer) {
      bar.classList.add("editor-group-bar--gallery");
      var ltgallery = group.closest ? group.closest(".ltgallery") : null;
      if (ltgallery) {
        anchorNode = ltgallery; // place after the whole gallery block
      } else if (swiperContainer.parentNode) {
        anchorNode = swiperContainer; // place after the swiper container
      }
      // else: fall back to the group itself (anchorNode unchanged)
    }

    if (anchorNode.parentNode) {
      anchorNode.parentNode.insertBefore(bar, anchorNode.nextSibling);
    }
  }

  // ---------------------------------------------------------------------------
  // remove badge (one per [data-idx] unit, hover-revealed)
  // ---------------------------------------------------------------------------
  function wireUnit(unit) {
    // badge is editor chrome: never carries data-md / data-edit.
    var badge = el("button", "editor-remove", "×");
    badge.type = "button";
    badge.title = "删除这一项"; // 删除这一项
    // 单元可能本身就是 contenteditable（如规格行 <li>）：徽标设为不可编辑，光标跳过、不被当成内容。
    badge.contentEditable = "false";

    badge.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (arrayOpBusy) return;

      var host = unit.closest ? unit.closest("[data-group]") : null;
      var group = host ? host.getAttribute("data-group") : null;
      if (!group) {
        toast("无法定位分组", false); // 无法定位分组
        return;
      }
      if (!window.confirm("删除这一项？不可撤销")) return; // 删除这一项？不可撤销
      arrayOp(group, "remove", Number(unit.dataset.idx), badge);
    });

    // keep mousedown from bubbling into contenteditable / image handlers
    badge.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    unit.appendChild(badge);
  }

  // ---------------------------------------------------------------------------
  // scan + dispatch
  // ---------------------------------------------------------------------------
  function scan() {
    var nodes = document.querySelectorAll("[data-md]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var kind = node.getAttribute("data-edit");
      switch (kind) {
        case "text":
        case "rich":
          wireEditable(node, kind);
          break;
        case "image":
          if (node.tagName === "IMG") wireImage(node);
          break;
        case "link":
          if (node.tagName === "A") wireLink(node);
          break;
        default:
          // unknown / missing kind -> leave the element untouched
          break;
      }
    }
  }

  function scanGroups() {
    var groups = document.querySelectorAll("[data-group]");
    for (var i = 0; i < groups.length; i++) wireGroup(groups[i]);

    var units = document.querySelectorAll("[data-idx]");
    for (var j = 0; j < units.length; j++) wireUnit(units[j]);
  }

  // ---------------------------------------------------------------------------
  // bootstrap
  // ---------------------------------------------------------------------------
  function initEditor() {
    mountBanner();
    scan();              // existing value-editing: contenteditable / image / link
    neutralizeAnchors(); // cancel navigation for anchors wrapping editables
    scanGroups();        // add-control bars + remove badges
    restoreScroll();     // jump back after an add/remove reload
  }

  ready(initEditor);
})();

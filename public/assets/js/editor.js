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
  var IMG_PREFIX = "/assets/img/product/";

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
    if (kind === "rich") return node.innerHTML;
    return (node.textContent || "").trim();
  }

  function wireEditable(node, kind) {
    node.setAttribute("contenteditable", "true");
    node.setAttribute("spellcheck", "false");

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

  ready(function () {
    mountBanner();
    scan();
  });
})();

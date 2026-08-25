// 表单提交（站点层，纯前端）：拦截 wpforms 快照表单的 submit，POST 到 form action 指的端点。
// 端点是可配置的相对路径（/api/inquiry、/api/subscribe）——本地由 mock 接收器接住（假发送），
// 生产期换成真实端点（Lambda URL / 第三方），本文件零改动。
// 产物仍是自包含静态 HTML：无运行时拼接，此脚本只管"提交"这一个行为。
(function () {
  "use strict";

  // 死 dropzone 激活：WPForms 快照的上传区没有真实 <input type=file>，补一个并接点击。
  function wireUploader(form) {
    var zone = form.querySelector(".wpforms-uploader");
    if (!zone || zone.dataset.wired) return;
    zone.dataset.wired = "1";
    var input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.name = "files";
    input.style.display = "none";
    form.appendChild(input);
    zone.style.cursor = "pointer";
    zone.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var names = [];
      for (var i = 0; i < Math.min(input.files.length, 5) ; i++) names.push(input.files[i].name);
      var hint = zone.querySelector(".modern-hint");
      if (hint) hint.textContent = names.length ? "已选择：" + names.join("、") : "你最多可以上传5个文件。";
    });
  }

  function showMessage(form, ok, text) {
    var box = form.parentNode.querySelector(".form-submit-msg");
    if (!box) {
      box = document.createElement("div");
      box.className = "form-submit-msg";
      form.parentNode.insertBefore(box, form.nextSibling);
    }
    box.setAttribute("style", "margin:12px 0;padding:10px 14px;border-radius:3px;font-size:14px;" +
      (ok ? "background:#eef7ee;color:#2e7d32;border:1px solid #cde8cd" : "background:#fdeeee;color:#c62828;border:1px solid #f5cccc"));
    box.textContent = text;
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.classList || !form.classList.contains("wpforms-form")) return;
    var action = form.getAttribute("action");
    if (!action) return; // 无端点的表单不拦截
    e.preventDefault();

    var btn = form.querySelector('button[type="submit"], .wpforms-submit');
    var btnText = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "发送中…"; }
    var done = function (ok, text) {
      if (btn) { btn.disabled = false; btn.textContent = btnText; }
      showMessage(form, ok, text);
      if (ok) form.reset();
    };

    fetch(action, { method: "POST", body: new FormData(form) })
      .then(function (res) {
        if (res.ok) done(true, "已发送，我们会尽快与您联系。");
        else done(false, "发送失败（" + res.status + "），请稍后再试。");
      })
      .catch(function () {
        done(false, "发送失败：网络不可达，请稍后再试或直接邮件联系我们。");
      });
  });

  document.addEventListener("DOMContentLoaded", function () {
    var forms = document.querySelectorAll(".wpforms-form");
    for (var i = 0; i < forms.length; i++) wireUploader(forms[i]);
  });
})();

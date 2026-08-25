// 文章页左栏目录（TOC）自动生成器 —— 全站 chrome，从原站逐字复用、零引擎介入。
// 扫 .craneinfo 内带 id 的 h2/h3，生成可点击跳转的目录（h2 一级、h3 缩进）。
// 非文章页（无 #Topics .craneinfo）自动空转，故可全站 layout 引入一次、各 post 模版不再各写一遍。
(function () {
	function buildTOC() {
		var root = document.querySelector('#Topics .craneinfo');
		var ul = document.querySelector('#rank-math-toc nav ul');
		if (!root || !ul) return;
		ul.innerHTML = '';
		var heads = root.querySelectorAll('h2[id], h3[id]');
		var curSub = null;
		heads.forEach(function (h) {
			var li = document.createElement('li');
			var a = document.createElement('a');
			a.href = '#' + h.id;
			a.textContent = (h.textContent || '').trim();
			li.appendChild(a);
			if (h.tagName === 'H2') {
				li.className = 'h2-item';
				ul.appendChild(li);
				var sub = document.createElement('ul');
				li.appendChild(sub);
				curSub = sub;
			} else {
				(curSub || ul).appendChild(li);
			}
		});
		ul.querySelectorAll('li > ul:empty').forEach(function (e) { e.remove(); });
	}
	if (document.readyState !== 'loading') buildTOC();
	else document.addEventListener('DOMContentLoaded', buildTOC);
})();

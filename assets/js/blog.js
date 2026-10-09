(function () {
  'use strict';

  // 화면 읽기 프로그램에 짧은 알림 ("복사했습니다" 등)
  var announcer = document.createElement('p');
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  document.body.appendChild(announcer);

  function announce(message) {
    announcer.textContent = message;
  }

  // 외부 링크 새 탭. rel은 통째로 바꾸지 않고 덧붙임 (me, nofollow 유지)
  function initExternalLinks() {
    document.querySelectorAll('a[href^="http"]').forEach(function (link) {
      if (link.hostname !== window.location.hostname) {
        link.target = '_blank';
        link.relList.add('noopener', 'noreferrer');
        // 화면 읽기 프로그램에만 새 탭으로 열린다고 알림
        var note = document.createElement('span');
        note.className = 'sr-only';
        note.textContent = ' (새 탭)';
        link.appendChild(note);
      }
    });
  }

  // 가로로 넘치는 표·코드 블록만 Tab으로 들어가서 화살표로 스크롤 (Safari는 스스로 안 해 줌).
  // 안 넘치면 Tab 멈춤을 늘리지 않게 뺌. 화면 폭이 바뀌면 다시 잼
  function initScrollers() {
    var boxes = document.querySelectorAll('.post-content .table-scroll, .post-content div.highlighter-rouge pre');
    if (!boxes.length) return;

    function update(box) {
      if (box.scrollWidth > box.clientWidth) {
        box.tabIndex = 0;
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', box.tagName === 'PRE' ? '코드 (가로 스크롤)' : '표 (가로 스크롤)');
      } else {
        box.removeAttribute('tabindex');
        box.removeAttribute('role');
        box.removeAttribute('aria-label');
      }
    }

    boxes.forEach(update);
    // 웹폰트가 늦게 오면 글자 폭이 바뀜
    if (document.fonts) document.fonts.ready.then(function () { boxes.forEach(update); });
    if (!('ResizeObserver' in window)) return;
    var observer = new ResizeObserver(function (items) {
      items.forEach(function (item) { update(item.target); });
    });
    boxes.forEach(function (box) { observer.observe(box); });
  }

  // 코드 창: CSS가 그려 둔 띠 위에 언어 이름·복사 버튼을 얹고, 줄 번호를 pre 바깥 칸에 채움
  function initCodeBlocks() {
    document.querySelectorAll('.post-content div.highlighter-rouge').forEach(function (block) {
      var highlight = block.querySelector('div.highlight');
      var code = block.querySelector('pre code');
      if (!highlight || !code) return;

      var match = block.className.match(/\blanguage-([\w+#.-]+)/);
      var language = match ? match[1] : 'text';
      if (language === 'plaintext') language = 'text';

      var head = document.createElement('div');
      head.className = 'code-head';
      var label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = language;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = '복사';
      button.setAttribute('aria-label', '코드 복사');
      head.append(label, button);
      block.prepend(head);

      var count = code.textContent.replace(/\n$/, '').split('\n').length;
      var numbers = [];
      for (var i = 1; i <= count; i++) numbers.push(i);
      var gutter = document.createElement('div');
      gutter.className = 'code-lines';
      gutter.setAttribute('aria-hidden', 'true');
      gutter.textContent = numbers.join('\n');
      highlight.prepend(gutter);

      var timer = null;
      button.addEventListener('click', function () {
        if (!navigator.clipboard) return;
        // 줄 번호는 code 바깥이라 안 딸려 옴
        navigator.clipboard.writeText(code.textContent).then(function () {
          button.textContent = '복사됨';
          announce('코드를 복사했습니다');
          clearTimeout(timer);
          timer = setTimeout(function () {
            button.textContent = '복사';
            announce('');
          }, 1500);
        }, function () {});
      });
    });
  }

  // TOC: 현재 위치 강조 + 소목차 접기·펼치기
  function initToc() {
    var toc = document.querySelector('.toc');
    if (!toc) return;
    var scroller = toc.querySelector('.toc__inner');
    var list = toc.querySelector('.toc__list');
    if (!scroller || !list) return;

    var entries = [];
    toc.querySelectorAll('.toc__list a[href^="#"]').forEach(function (link) {
      // 한글·숫자로 시작하는 id가 있어서 querySelector 대신 getElementById
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      var li = link.parentElement;
      var parent = li.parentElement === list ? li : li.parentElement.closest('li');
      entries.push({ link: link, li: li, parent: parent, target: target });
    });
    if (!entries.length) return;

    var groups = [];
    Array.prototype.forEach.call(list.children, function (li, index) {
      var sub = li.querySelector(':scope > ul');
      if (!sub) return;
      var link = li.querySelector(':scope > a');
      sub.id = 'toc-sub-' + index;
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toc__toggle';
      toggle.setAttribute('aria-controls', sub.id);
      toggle.setAttribute('aria-label', (link ? link.textContent.trim() : '') + ' 소목차');
      toggle.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      li.insertBefore(toggle, sub);
      li.classList.add('has-children');
      var group = { li: li, sub: sub, toggle: toggle, userOpen: null };
      toggle.addEventListener('click', function () {
        group.userOpen = !li.classList.contains('is-open');
        render();
      });
      groups.push(group);
    });
    toc.classList.add('toc--collapsible');

    var active = null;
    var activeParent = null;

    function render() {
      groups.forEach(function (group) {
        var open = group.userOpen !== null ? group.userOpen : group.li === activeParent;
        group.li.classList.toggle('is-open', open);
        group.toggle.setAttribute('aria-expanded', String(open));
        // 접힌 목록은 Tab이 안 들어가게
        group.sub.inert = !open;
      });
    }

    function keepInView(link) {
      var box = scroller.getBoundingClientRect();
      var rect = link.getBoundingClientRect();
      if (rect.top < box.top) {
        scroller.scrollTop += rect.top - box.top - 8;
      } else if (rect.bottom > box.bottom) {
        scroller.scrollTop += rect.bottom - box.bottom + 8;
      }
    }

    function update() {
      // display: none이면 (1400px 이하) 계산 안 함
      if (!toc.offsetParent) return;
      var line = window.innerHeight * 0.25;
      var current = null;
      var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atEnd) {
        current = entries[entries.length - 1];
      } else {
        // 읽는 선 위로 지나간 마지막 제목
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].target.getBoundingClientRect().top <= line) current = entries[i];
          else break;
        }
      }
      if (current === active) return;

      if (active) {
        active.li.classList.remove('is-active');
        active.link.removeAttribute('aria-current');
      }
      active = current;
      var nextParent = active ? active.parent : null;
      if (nextParent !== activeParent) {
        // 섹션이 바뀌면 그 두 섹션은 다시 자동으로 접고 펼침
        groups.forEach(function (group) {
          if (group.li === activeParent || group.li === nextParent) group.userOpen = null;
        });
        activeParent = nextParent;
      }
      render();
      if (active) {
        active.li.classList.add('is-active');
        active.link.setAttribute('aria-current', 'location');
        keepInView(active.link);
        // 펼치는 애니메이션(0.25초)이 끝난 뒤 위치로 한 번 더
        var link = active.link;
        setTimeout(function () { if (active && active.link === link) keepInView(link); }, 260);
      }
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        update();
      });
    }

    render();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  // giscus: 댓글 600px쯤 앞에 오면 그때 스크립트를 넣음
  function initComments() {
    var container = document.getElementById('giscus-comments');
    if (!container) return;

    function load() {
      var script = document.createElement('script');
      script.src = 'https://giscus.app/client.js';
      Array.prototype.forEach.call(container.attributes, function (attr) {
        if (attr.name.indexOf('data-') === 0) script.setAttribute(attr.name, attr.value);
      });
      script.crossOrigin = 'anonymous';
      script.async = true;
      container.appendChild(script);
    }

    window.addEventListener('message', function onMessage(event) {
      if (event.origin !== 'https://giscus.app') return;
      var status = container.querySelector('.comments__status');
      if (status) status.remove();
      window.removeEventListener('message', onMessage);
    });

    if (!('IntersectionObserver' in window)) {
      load();
      return;
    }
    var observer = new IntersectionObserver(function (items) {
      if (!items.some(function (item) { return item.isIntersecting; })) return;
      observer.disconnect();
      load();
    }, { rootMargin: '600px 0px' });
    observer.observe(container);
  }

  // 카테고리·태그 색인: 지금 보이는 묶음(주소 해시, 없으면 첫 묶음)의 칩에 aria-current.
  // 처음 열 때는 이 스크립트가 :target보다 먼저 돌아서 해시를 직접 비교함
  function initTaxonomy() {
    var index = document.querySelector('.tax-index');
    if (!index) return;
    var chips = index.querySelectorAll('.chip');

    function mark() {
      var current = Array.prototype.find.call(chips, function (chip) {
        return chip.hash === window.location.hash;
      }) || chips[0];
      chips.forEach(function (chip) {
        if (chip === current) chip.setAttribute('aria-current', 'true');
        else chip.removeAttribute('aria-current');
      });
    }

    mark();
    window.addEventListener('hashchange', mark);
  }

  // 검색 모달 (lunr). 처음 열 때만 lunr.min.js → lunr-store.js 순서로 불러옴
  function initSearch() {
    var dialog = document.getElementById('search');
    var opener = document.querySelector('[data-search-open]');
    if (!dialog || !opener || typeof dialog.showModal !== 'function') return;
    var input = dialog.querySelector('#search-input');
    var status = dialog.querySelector('#search-status');
    var count = dialog.querySelector('#search-count');
    var results = dialog.querySelector('#search-results');
    var index = null;
    var loading = null;

    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    }

    function loadIndex() {
      if (!loading) {
        loading = loadScript(dialog.dataset.lunr)
          .then(function () { return loadScript(dialog.dataset.store); })
          .then(function () {
            /* global lunr, store */
            // 색인 설정은 lunr-en.js와 같게 (필드 4개, trimmer 제거)
            index = lunr(function () {
              this.field('title');
              this.field('excerpt');
              this.field('categories');
              this.field('tags');
              this.ref('id');
              this.pipeline.remove(lunr.trimmer);
              for (var item in store) {
                this.add({
                  title: store[item].title,
                  excerpt: store[item].excerpt,
                  categories: store[item].categories,
                  tags: store[item].tags,
                  id: item
                });
              }
            });
          })
          .catch(function (error) {
            loading = null;
            throw error;
          });
      }
      return loading;
    }

    function query(text) {
      var q = text.toLowerCase();
      return index.query(function (builder) {
        q.split(lunr.tokenizer.separator).forEach(function (term) {
          builder.term(term, { boost: 100 });
          if (q.lastIndexOf(' ') != q.length - 1) {
            builder.term(term, { usePipeline: false, wildcard: lunr.Query.wildcard.TRAILING, boost: 10 });
          }
          if (term != '') {
            builder.term(term, { usePipeline: false, editDistance: 1, boost: 1 });
          }
        });
      });
    }

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // 일치 구간을 찾아 조각마다 이스케이프한 뒤 <mark>로 감쌈
    function highlight(text, terms) {
      var lower = text.toLowerCase();
      var ranges = [];
      terms.forEach(function (term) {
        var from = 0;
        var at;
        while ((at = lower.indexOf(term, from)) !== -1) {
          ranges.push([at, at + term.length]);
          from = at + term.length;
        }
      });
      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      ranges.forEach(function (range) {
        var last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range.slice());
      });
      var html = '';
      var cursor = 0;
      merged.forEach(function (range) {
        html += escapeHtml(text.slice(cursor, range[0]));
        html += '<mark>' + escapeHtml(text.slice(range[0], range[1])) + '</mark>';
        cursor = range[1];
      });
      return { html: html + escapeHtml(text.slice(cursor)), first: merged.length ? merged[0][0] : -1 };
    }

    function snippet(text, terms) {
      var found = highlight(text, terms);
      if (found.first <= 24) return found.html;
      // 첫 일치 부분이 보이게 앞을 자름
      var start = text.lastIndexOf(' ', found.first - 16);
      start = start > 0 ? start + 1 : found.first - 16;
      return '…' + highlight(text.slice(start), terms).html;
    }

    function search() {
      var text = input.value.trim();
      results.innerHTML = '';
      count.textContent = '';
      if (!text) {
        status.textContent = '';
        return;
      }
      var found = query(input.value);
      var terms = text.toLowerCase().split(lunr.tokenizer.separator).filter(Boolean);
      if (!found.length) {
        status.textContent = '‘' + text + '’에 맞는 글이 없습니다.';
        return;
      }
      status.textContent = '';
      count.textContent = '검색 결과 ' + found.length + '개';
      found.forEach(function (result) {
        var doc = store[result.ref];
        var li = document.createElement('li');
        li.innerHTML =
          '<a href="' + escapeHtml(doc.url) + '">' +
            '<span class="search__title">' + highlight(doc.title, terms).html + '</span>' +
            '<span class="search__excerpt">' + snippet(doc.excerpt, terms) + '</span>' +
          '</a>';
        results.appendChild(li);
      });
    }

    function open() {
      dialog.showModal();
      input.focus();
      if (index) return;
      status.textContent = '검색 데이터를 불러오는 중…';
      loadIndex().then(function () {
        status.textContent = '';
        search();
      }, function () {
        status.textContent = '검색 데이터를 불러오지 못했습니다. 창을 닫았다가 다시 열어 주세요.';
      });
    }

    opener.addEventListener('click', open);
    input.addEventListener('input', function () {
      if (index) search();
    });
    dialog.querySelector('[data-search-close]').addEventListener('click', function () {
      dialog.close();
    });
    // type="search" 입력칸은 ESC를 글자 지우기로 먼저 써 버려서 바로 닫히게 직접 처리
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      dialog.close();
    });
    // 뒤 흐린 화면을 누르면 닫음
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', function () {
      opener.focus();
    });
  }

  initExternalLinks();
  initCodeBlocks();
  initScrollers();
  initToc();
  initComments();
  initTaxonomy();
  initSearch();
})();

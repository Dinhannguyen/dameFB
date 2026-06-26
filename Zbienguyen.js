// ==UserScript==
// @name         Tool Báo Cáo (Lõi ĐMC x UI Zbie) - Auto Refresh & Timer
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Lõi tự động báo cáo, UI Zbie. Đếm giờ, đếm vòng, hiển thị bước, tự động Refresh khi kẹt/đủ vòng.
// @match        https://www.facebook.com/*
// @match        https://m.facebook.com/*
// @match        https://touch.facebook.com/*
// @match        https://mbasic.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://*.facebook.com/*
// @grant        none
// ==/UserScript==

(async () => {
    'use strict';

    // ========== CẤU HÌNH GIAO DIỆN ==========
    const AVATAR_URL = "https://scontent.fsgn2-5.fna.fbcdn.net/v/t39.30808-6/728580785_3786162091525795_7954611106013383803_n.jpg?stp=dst-jpg_tt6&cstp=mx1170x1270&ctp=s565x565&_nc_cat=111&ccb=1-7&_nc_sid=127cfc&_nc_ohc=n4xdd07GVJoQ7kNvwE2iA3w&_nc_oc=AdoZ1_BF1bJAOgxbCQW_EK_QjsGgT-kCyKQTKX5uAG6cqFrANthQrDi6SnvbIgc_jLs&_nc_zt=23&_nc_ht=scontent.fsgn2-5.fna&_nc_gid=_TBPQL1kba9BwNniJEXNDg&_nc_ss=7b2a8&oh=00_Af8HkP481L-gJ_oofTjDwvYatA5XBjp8d4yHhVK9EoiQOA&oe=6A42FB66";
    const PANEL_BG = "rgba(15, 5, 10, 0.95)";
    const NEON_PINK = "#ff007f";
    const NEON_GOLD = "#ffcc00";
    const TEXT_WHITE = "#ffffff";

    // ========== CẤU HÌNH LÕI BÁO CÁO ==========
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const BASE_DELAY = isMobile ? 400 : 300;
    const INPUT_DELAY = isMobile ? 2000 : 1500;
    const WAIT_FOR_ACTION = isMobile ? 1200 : 800;
    const DONE_DELAY = 400;
    const SOMETHING_RETRIES = 4;
    const INTER_REPORT_DELAY = 500;
    const CYCLE_REST = 1000;

    // Nâng cấp: Thời gian rình nút (20 lần x 600ms = 12 giây cho mỗi nút)
    const MAX_WAIT_RETRIES = 20;
    const MAX_CONSECUTIVE_ERRORS = 3;

    // ========== QUẢN LÝ BỘ NHỚ TẠM (LOCAL STORAGE) ==========
    const LDB = {
        get: (key, def) => localStorage.getItem('zbie_' + key) || def,
        set: (key, val) => localStorage.setItem('zbie_' + key, val),
        del: (key) => localStorage.removeItem('zbie_' + key)
    };

    // Lấy dữ liệu cũ ra (nếu vừa bị Refresh)
    let userDelay = parseInt(LDB.get('delay', 3000));
    let refreshAfterLoops = parseInt(LDB.get('refreshLoops', 5));
    let isRunning = false;
    let isPaused = false;
    let shouldStop = false;

    let totalReportsDone = parseInt(LDB.get('reports', 0));
    let totalLoopsCompleted = parseInt(LDB.get('loops', 0));
    let startTimestamp = parseInt(LDB.get('startTime', Date.now()));
    let consecutiveErrors = 0;
    let runtimeInterval = null;

    // ========== NGÔN NGỮ BÁO CÁO ==========
    const LANG = {
        menu: ["Profile settings see more options", "その他のオプション", "प्रोफ़ाइल सेटिंग पर ले जाने वाला 'और विकल्प देखें'"],
        reportProfile: ["Report profile", "Báo cáo trang cá nhân", "プロフィールを報告", "प्रोफाइल रिपोर्ट गर्नुहोस्"],
        somethingAbout: ["Something about this profile", "Có gì đó về trang cá nhân này", "このプロフィールに関すること", "यो प्रोफाइलका बारेमा केही कुरा"],
        fakeProfile: ["Fake profile", "Trang cá nhân giả mạo", "偽プロフィール", "नक्कli प्रोफाइल"],
        notRealPerson: ["not a real person", "không phải người thật", "実在しない人物である", "उहाँ वास्तविक व्यक्ति hoइन"],
        celebrity: ["celebrity", "public figure", "A celebrity or public figure", "Người nổi tiếng hoặc nhân vật công chúng", "有名人・著名人", "सेलिब्रेटी वा प्रसिद्ध व्यक्ति"],
        submit: ["Submit", "Gửi", "Send", "送信", "पेस गर्नुहोस्", "सबमिट करें"],
        done: ["Done", "Xong", "Hoàn tất", "Close", "Đóng", "完了", "सम्पन्न भयो", "ओके"],
        next: ["Next", "Tiếp", "Tiếp tục", "次へ", "अर्को", "आगे बढ़ें"]
    };
    const INPUT_XPATH = "//*[@aria-label=\"Facebook Page name or URL\" or @aria-label=\"Facebookページ名またはURL\" or @aria-label=\"Facebook पृष्ठको नाम वा URL\" or @aria-label=\"Facebook पेज का नाम या URL\"]";

    // ========== HÀM LOG & TIỆN ÍCH GIAO DIỆN ==========
    function log(msg, type = 'info') {
        const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⏳' : 'ℹ️';
        console.log(`[Tool] ${prefix} ${msg}`);

        const logArea = document.getElementById('log-area-inline');
        if (logArea) {
            const entry = document.createElement('div');
            entry.style.fontSize = '11px';
            entry.style.color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : type === 'warning' ? '#ffcc00' : '#4dabf7';
            entry.textContent = `${new Date().toLocaleTimeString()} | ${msg}`;
            logArea.appendChild(entry);
            logArea.scrollTop = logArea.scrollHeight;
            if (logArea.children.length > 50) logArea.removeChild(logArea.firstChild);
        }
    }

    function updateTimer() {
        if (!isRunning || isPaused) return;
        const now = Date.now();
        const diff = Math.floor((now - startTimestamp) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        const timeEl = document.getElementById('runtime-display');
        if (timeEl) timeEl.textContent = `${h}:${m}:${s}`;
    }

    // ========== HÀM TIỆN ÍCH LÕI TỰ ĐỘNG ==========
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const getElementByXpath = (path) => {
        try { return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }
        catch(e) { return null; }
    };
    const isInsidePanel = (el) => el.closest('#zbie-control-panel') !== null || el.closest('#zbie-minimized-icon') !== null;

    function safeClick(el) {
        if (!el) return false;
        el.scrollIntoView({block: "center", inline: "center"});
        el.focus();
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        return true;
    }

    function findActionButton(keywords) {
        const selectors = ['button', 'div[role="button"]', 'a[role="button"]', 'span[role="button"]', 'div[role="menuitem"]', 'div[tabindex="0"]'];
        let all = [...document.querySelectorAll(selectors.join(','))];
        all = all.filter(el => el.offsetParent !== null && !isInsidePanel(el));
        for (let el of all) {
            let txt = (el.innerText || "").trim().toLowerCase();
            for (let k of keywords) {
                if (txt.includes(k.toLowerCase())) return el;
            }
        }
        return null;
    }

    function findButtonByKeywords(keywords) {
        let all = document.querySelectorAll('div[role="button"], button, span, div[role="menuitem"], div[tabindex="0"], li, a, div[role="option"]');
        for (let el of all) {
            if (!el.offsetParent || isInsidePanel(el)) continue;
            let txt = (el.innerText || "").trim().toLowerCase();
            for (let k of keywords) {
                if (txt.includes(k.toLowerCase())) {
                    let clickable = el.closest('div[role="button"], button') || el;
                    clickable.scrollIntoView({block: "center", inline: "center"});
                    return clickable;
                }
            }
        }
        return null;
    }

    function simulateInputWithTracker(element, text) {
        element.focus();
        let lastValue = element.value;
        element.value = text;
        let event = new Event('input', { bubbles: true });
        let tracker = element._valueTracker;
        if (tracker) { tracker.setValue(lastValue); }
        element.dispatchEvent(event);
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function findMenuElement() {
        for (let lbl of LANG.menu) {
            let el = document.querySelector(`[aria-label="${lbl}"]`);
            if (el && el.offsetParent && !isInsidePanel(el)) return el;
        }
        let allBtns = document.querySelectorAll('div[role="button"], button, span[role="button"]');
        for (let btn of allBtns) {
            if (!btn.offsetParent || isInsidePanel(btn)) continue;
            if (btn.innerText.includes('その他') || btn.innerText.includes('Other') || btn.innerText.includes('More') || btn.innerText.includes('…')) {
                return btn.closest('div[role="button"], button') || btn;
            }
        }
        return null;
    }

    async function clickMetaResult() {
        for (let retry = 4; retry > 0; retry--) {
            let options = document.querySelectorAll('div[role="listbox"] span, ul[role="listbox"] span, div[role="presentation"] span');
            for (let span of options) {
                if (!span.offsetParent || isInsidePanel(span)) continue;
                if (span.innerText.trim() === "Meta") {
                    safeClick(span);
                    await sleep(1000);
                    return true;
                }
            }
            let imgs = document.querySelectorAll('div[role="listbox"] img');
            if (imgs.length > 0) {
                safeClick(imgs[0]);
                await sleep(1000);
                return true;
            }
            if (retry === 2 || retry === 1) {
                let inp = getElementByXpath(INPUT_XPATH);
                if (inp) {
                    simulateInputWithTracker(inp, "Meta ");
                    await sleep(1500);
                }
            }
            await sleep(500);
        }
        return false;
    }

    // ========== 2 LOẠI BÁO CÁO ==========
    const reportTypes = [
        {
            name: "Fake - Not real person",
            steps: [
                { name: "Menu", special: "menu" },
                { name: "Report profile", keywords: LANG.reportProfile },
                { name: "Something about", keywords: LANG.somethingAbout, optional: true },
                { name: "Fake profile", keywords: LANG.fakeProfile },
                { name: "Not a real person", keywords: LANG.notRealPerson },
                { name: "Submit", keywords: LANG.submit, action: true },
                { name: "Next", keywords: LANG.next, action: true },
                { name: "Done", keywords: LANG.done, action: true, done: true }
            ]
        },
        {
            name: "Celebrity",
            steps: [
                { name: "Menu", special: "menu" },
                { name: "Report profile", keywords: LANG.reportProfile },
                { name: "Something about", keywords: LANG.somethingAbout, optional: true },
                { name: "Fake profile", keywords: LANG.fakeProfile },
                { name: "Celebrity or public figure", keywords: LANG.celebrity },
                { name: "Nhập tên Meta", inputData: "Meta ", special: "input" },
                { name: "Chọn Meta", special: "meta" },
                { name: "Next", keywords: LANG.next, action: true },
                { name: "Submit", keywords: LANG.submit, action: true },
                { name: "Next", keywords: LANG.next, action: true },
                { name: "Done", keywords: LANG.done, action: true, done: true }
            ]
        }
    ];

    // ========== THỰC HIỆN BÁO CÁO ==========
    async function executeReport(reportConfig) {
        log(`[Vòng ${totalLoopsCompleted + 1}] Bắt đầu luồng: ${reportConfig.name}...`, 'info');
        const steps = reportConfig.steps;

        for (let i = 0; i < steps.length; i++) {
            if (shouldStop) return false;
            while (isPaused && !shouldStop) await sleep(400);
            if (shouldStop) return false;

            const step = steps[i];

            // Xử lý bước Optional
            if (step.optional && step.name.startsWith("Something")) {
                let found = false;
                for (let r = 0; r < SOMETHING_RETRIES; r++) {
                    const el = findButtonByKeywords(step.keywords);
                    if (el) { safeClick(el); await sleep(userDelay); found = true; break; }
                    await sleep(500);
                }
                if (!found) console.warn(`Bỏ qua bước phụ: ${step.name}`);
                continue;
            }

            // Xử lý Input
            if (step.special === "input") {
                const inp = getElementByXpath(INPUT_XPATH);
                if (inp) { simulateInputWithTracker(inp, step.inputData); await sleep(INPUT_DELAY); }
                else log(`Lỗi: Không tìm thấy ô nhập liệu ở bước ${step.name}`, 'error');
                continue;
            }

            // Xử lý Meta list
            if (step.special === "meta") {
                await clickMetaResult();
                continue;
            }

            // Xử lý tìm nút thông thường (SMART WAIT)
            let el = null;
            const isMenu = step.special === "menu";
            const isAction = step.action === true;

            let logWaitMsg = false;
            for (let retry = 0; retry < MAX_WAIT_RETRIES; retry++) {
                if (shouldStop) break;
                if (isMenu) el = findMenuElement();
                else if (isAction) el = findActionButton(step.keywords);
                else if (step.keywords) el = findButtonByKeywords(step.keywords);

                if (el) break; // Tìm thấy thì thoát vòng rình

                if (retry === 3 && !logWaitMsg) {
                    log(`Đang chờ nút "${step.name}" xuất hiện...`, 'warning');
                    logWaitMsg = true;
                }
                await sleep(600);
            }

            if (!el) {
                log(`Lỗi: Không tìm thấy nút "${step.name}" sau 12s. Kẹt luồng!`, 'error');
                return false; // Trả về false để đếm lỗi
            }

            safeClick(el);
            log(`Đã click: ${step.name}`, 'info');

            if (isMenu) await sleep(800);
            else if (step.done) await sleep(DONE_DELAY);
            else if (isAction) await sleep(WAIT_FOR_ACTION);
            else await sleep(userDelay);
        }

        totalReportsDone++;
        LDB.set('reports', totalReportsDone); // Lưu bộ nhớ
        updateUIDisplays();
        log(`Thành công luồng: ${reportConfig.name}`, 'success');
        return true;
    }

    // ========== VÒNG LẶP CHÍNH ==========
    async function startProcess() {
        shouldStop = false;
        isPaused = false;
        isRunning = true;

        if (!LDB.get('startTime')) LDB.set('startTime', Date.now());
        startTimestamp = parseInt(LDB.get('startTime'));

        if (runtimeInterval) clearInterval(runtimeInterval);
        runtimeInterval = setInterval(updateTimer, 1000);

        updateButtons();
        log('--- KHỞI CHẠY TIẾN TRÌNH ---', 'success');

        while (!shouldStop) {
            let loopSuccess = true;
            for (let i = 0; i < reportTypes.length && !shouldStop; i++) {
                const report = reportTypes[i];
                let result = await executeReport(report);

                // Cơ chế tự động Refresh nếu lỗi liên tục
                if (!result && !shouldStop) {
                    consecutiveErrors++;
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        log(`Lỗi liên tục ${MAX_CONSECUTIVE_ERRORS} lần! Web đang kẹt. Đang tự động Refresh...`, 'error');
                        LDB.set('autoRun', 'true');
                        await sleep(2000);
                        location.reload();
                        return;
                    }
                } else {
                    consecutiveErrors = 0; // Reset lỗi nếu trơn tru
                }

                if (!shouldStop) await sleep(INTER_REPORT_DELAY);
            }

            if (!shouldStop) {
                totalLoopsCompleted++;
                LDB.set('loops', totalLoopsCompleted);
                updateUIDisplays();

                log(`Hoàn thành vòng ${totalLoopsCompleted}. Đang nghỉ ngơi ${CYCLE_REST/1000}s...`, 'warning');
                await sleep(CYCLE_REST);

                // Cơ chế tự động Refresh khi đủ số vòng chống Lag RAM
                if (totalLoopsCompleted % refreshAfterLoops === 0) {
                    log(`Đã đạt mốc ${refreshAfterLoops} vòng. Đang Refresh làm sạch RAM...`, 'warning');
                    LDB.set('autoRun', 'true');
                    await sleep(1000);
                    location.reload();
                    return;
                }
            }
        }

        // Khi bị Dừng hẳn
        isRunning = false;
        clearInterval(runtimeInterval);
        LDB.set('autoRun', 'false');
        LDB.del('startTime'); // Xóa thời gian để lần sau đếm lại từ đầu
        updateButtons();
        log(`⏹ Đã dừng. Tổng BC: ${totalReportsDone} | Vòng: ${totalLoopsCompleted}`, 'success');
    }

    // ========== CẬP NHẬT TRẠNG THÁI UI ==========
    function updateUIDisplays() {
        document.getElementById('count-display').textContent = totalReportsDone;
        document.getElementById('loop-display').textContent = totalLoopsCompleted;
    }

    function updateButtons() {
        const startBtn = document.getElementById('btn-start');
        const statusEl = document.getElementById('status-text');

        if (isRunning && !isPaused) {
            startBtn.textContent = '⏸ Tạm ngừng';
            startBtn.style.background = '#2a1a00';
            startBtn.style.color = NEON_GOLD;
            statusEl.textContent = '● Đang chạy';
            statusEl.style.color = NEON_PINK;
        } else if (isRunning && isPaused) {
            startBtn.textContent = '▶ Tiếp tục';
            startBtn.style.background = '#2a0014';
            startBtn.style.color = NEON_PINK;
            statusEl.textContent = '⏸ Tạm dừng';
            statusEl.style.color = NEON_GOLD;
        } else {
            startBtn.textContent = '▶ Bắt đầu';
            startBtn.style.background = '#2a0014';
            startBtn.style.color = NEON_PINK;
            statusEl.textContent = '● Dừng';
            statusEl.style.color = '#777';
        }
    }

    // ========== XÂY DỰNG PANEL GIAO DIỆN ==========
    function buildPanel() {
        const style = document.createElement('style');
        style.textContent = `
            .zbie-btn { flex:1; border:none; padding:6px 0; border-radius:6px; cursor:pointer; font-weight:bold; transition:0.3s; font-family:'Segoe UI',sans-serif; font-size:12px; outline:none; text-transform: uppercase;}
            .zbie-btn:hover { transform:scale(1.03); }
            .zbie-btn-stop { background:rgba(255,50,50,0.1); color:#ff4d4d; border:1px solid #ff4d4d; }
            .zbie-btn-stop:hover { background:rgba(255,50,50,0.2); box-shadow:0 0 10px rgba(255,77,77,0.4); }
            #log-area-inline { height:95px; overflow-y:auto; background:rgba(0,0,0,0.6); border-radius:4px; padding:6px; font-size:10px; color:#ccc; font-family:monospace; line-height: 1.4;}
            #log-area-inline div { border-bottom:1px solid rgba(255,255,255,0.05); padding:2px 0; }
            #log-area-inline::-webkit-scrollbar { width: 4px; }
            #log-area-inline::-webkit-scrollbar-thumb { background: ${NEON_PINK}; border-radius: 4px; }
            .zbie-row { display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); padding:4px 8px; border-radius:4px; margin-bottom: 5px;}
            .zbie-label { font-size:11px; color:${NEON_GOLD}; font-weight:600; }
            .zbie-input { width:45px; background:transparent; color:${TEXT_WHITE}; border:none; border-bottom:1px solid ${NEON_PINK}; text-align:center; outline:none; font-family:monospace; font-size:12px; font-weight:bold; padding: 2px 0;}
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'zbie-control-panel';
        Object.assign(panel.style, {
            position: 'fixed', bottom: '30px', right: '30px',
            background: PANEL_BG, border: `1px solid ${NEON_PINK}`,
            borderRadius: '10px', padding: '12px', zIndex: '999998',
            fontFamily: "'Segoe UI', sans-serif", color: TEXT_WHITE, width: '280px',
            boxShadow: `0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(255,0,127,0.3)`,
            backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', gap: '8px'
        });

        panel.innerHTML = `
            <div id="zbie-header-drag" style="display:flex; justify-content:space-between; align-items:center; cursor:move; border-bottom:1px solid rgba(255,0,127,0.3); padding-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <img class="zbie-avatar" src="${AVATAR_URL}" style="width:30px; height:30px; border-radius:6px; border:2px solid ${NEON_GOLD}; box-shadow:0 0 8px ${NEON_GOLD}; object-fit:cover;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:900; font-size:14px; color:${NEON_PINK}; text-shadow:0 0 8px ${NEON_PINK};">Zbie Nguyễn. </span>
                        <span style="font-size:10px; color:#aaa; font-family:monospace;">⏱ T.Gian: <span id="runtime-display" style="color:${TEXT_WHITE};">00:00:00</span></span>
                    </div>
                </div>
                <button id="btn-minimize" style="background:transparent; border:none; color:${TEXT_WHITE}; font-size:18px; font-weight:bold; cursor:pointer;">−</button>
            </div>

            <div class="zbie-row">
                <span class="zbie-label">⏱ Delay nút (ms):</span>
                <input type="number" id="input-delay" class="zbie-input" value="${userDelay}" min="500" step="500">
            </div>
            <div class="zbie-row">
                <span class="zbie-label">🔄 Auto F5 sau (vòng):</span>
                <input type="number" id="input-refresh" class="zbie-input" value="${refreshAfterLoops}" min="1">
            </div>

            <div style="display:flex; gap:6px; margin-top:2px;">
                <button id="btn-start" class="zbie-btn">▶ Bắt đầu</button>
                <button id="btn-stop" class="zbie-btn zbie-btn-stop">⏹ Dừng</button>
            </div>

            <div style="font-size:11px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.5); padding:6px 8px; border-radius:4px; margin-top: 2px;">
                <span>BC: <span id="count-display" style="color:#fff; font-weight:bold; font-size:13px;">${totalReportsDone}</span> | Vòng: <span id="loop-display" style="color:#fff; font-weight:bold; font-size:13px;">${totalLoopsCompleted}</span></span>
                <span id="status-text" style="font-weight:bold; font-size:10px; text-transform:uppercase;">● Dừng</span>
            </div>
            <div id="log-area-inline"></div>
        `;
        document.body.appendChild(panel);

        // Mini icon
        const mini = document.createElement('div');
        mini.id = 'zbie-minimized-icon';
        Object.assign(mini.style, {
            display: 'none', position: 'fixed', bottom: '30px', right: '30px',
            width: '50px', height: '50px', borderRadius: '50%',
            border: `2px solid ${NEON_PINK}`, boxShadow: `0 0 15px ${NEON_PINK}`,
            cursor: 'pointer', zIndex: '999999', overflow: 'hidden', transition: '0.3s'
        });
        mini.innerHTML = `<img class="zbie-avatar" src="${AVATAR_URL}" style="width:100%; height:100%; object-fit:cover; background:#000;">`;
        document.body.appendChild(mini);

        // Sự kiện thu gọn / phóng to
        document.getElementById('btn-minimize').onclick = () => { panel.style.display = 'none'; mini.style.display = 'block'; };
        mini.onclick = () => { mini.style.display = 'none'; panel.style.display = 'flex'; };

        // Lắng nghe thay đổi Cấu hình và lưu lại bộ nhớ
        document.getElementById('input-delay').addEventListener('change', (e) => {
            userDelay = Math.max(500, parseInt(e.target.value));
            e.target.value = userDelay;
            LDB.set('delay', userDelay);
        });
        document.getElementById('input-refresh').addEventListener('change', (e) => {
            refreshAfterLoops = Math.max(1, parseInt(e.target.value));
            e.target.value = refreshAfterLoops;
            LDB.set('refreshLoops', refreshAfterLoops);
        });

        // Sự kiện nút
        document.getElementById('btn-start').onclick = () => {
            if (!isRunning) {
                LDB.set('autoRun', 'true');
                startProcess();
            } else if (isRunning && !isPaused) {
                isPaused = true;
                updateButtons();
                log('Đã tạm dừng', 'warning');
            } else if (isRunning && isPaused) {
                isPaused = false;
                updateButtons();
                log('Tiếp tục tiến trình', 'success');
            }
        };

        document.getElementById('btn-stop').onclick = () => {
            if (isRunning) {
                if(confirm('Bạn muốn dừng hẳn tool và reset lại bộ đếm?')) {
                    shouldStop = true;
                    isPaused = false;
                    LDB.set('autoRun', 'false');
                    LDB.del('reports'); LDB.del('loops'); LDB.del('startTime');
                    totalReportsDone = 0; totalLoopsCompleted = 0;
                    updateUIDisplays();
                    document.getElementById('runtime-display').textContent = "00:00:00";
                    updateButtons();
                }
            }
        };

        // Kéo thả (Drag & Drop)
        let dragActive = false, startX, startY, panelStartX, panelStartY;
        document.getElementById('zbie-header-drag').addEventListener('pointerdown', (e) => {
            if (e.target.id === 'btn-minimize') return;
            dragActive = true;
            startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            panelStartX = rect.left; panelStartY = rect.top;
            panel.setPointerCapture(e.pointerId);
            panel.style.transition = 'none';
        });
        panel.addEventListener('pointermove', (e) => {
            if (!dragActive) return;
            e.preventDefault();
            let nx = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, panelStartX + (e.clientX - startX)));
            let ny = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, panelStartY + (e.clientY - startY)));
            panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
            panel.style.right = 'auto'; panel.style.bottom = 'auto';
        });
        panel.addEventListener('pointerup', () => { dragActive = false; panel.style.transition = ''; });
    }

    // ========== KHỞI CHẠY & KIỂM TRA TRẠNG THÁI ==========
    buildPanel();
    updateUIDisplays();
    updateButtons();

    // Nếu trước đó đang Auto Run (do bị Refresh), tự động kích hoạt lại
    if (LDB.get('autoRun') === 'true') {
        log('Khôi phục trạng thái bộ nhớ sau khi tải lại trang!', 'success');
        // Đợi 3 giây cho Facebook load xong DOM rồi auto click Bắt đầu
        setTimeout(() => {
            if(document.getElementById('btn-start')) {
                document.getElementById('btn-start').click();
            }
        }, 3000);
    } else {
        log('Tool sẵn sàng. Tinh chỉnh cấu hình và bấm Bắt đầu.', 'info');
    }
})();

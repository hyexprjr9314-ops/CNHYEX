
    // Default Seed Databases (For Initial Setup & Reset)
    const DEFAULT_USERS_DB = [
      { id: 1, name: '홍길동', email: 'hong@hanyang.com', dept: '경리', workplace: '본사', role: '과장', type: '팀원급', sysRole: '일반사용자', joindate: '2020-03-01', phone: '010-1111-2222', active: true, raw_score: 91.5, final_score: 91.5, is_adjusted: false, final_grade: 'S', completed: 0, total: 6, company: '한양고속' },
      { id: 2, name: '이순신', email: 'lee@chungnam.com', dept: '안전관리', workplace: '본사', role: '차장', type: '팀장급', sysRole: '일반사용자', joindate: '2018-05-15', phone: '010-2222-3333', active: true, raw_score: 88.0, final_score: 88.0, is_adjusted: false, final_grade: 'A', completed: 0, total: 6, company: '충남고속' },
      { id: 3, name: '강감찬', email: 'kang@hanyang.com', dept: '사업', workplace: '본사', role: '부장', type: '부서실장급', sysRole: '일반사용자', joindate: '2015-01-10', phone: '010-3333-4444', active: true, raw_score: 100.0, final_score: 100.0, is_adjusted: true, final_grade: 'EX', completed: 0, total: 6, company: '한양고속' },
      { id: 4, name: '유종열', email: 'jongyeol@hanyang.com', dept: '인사총무', workplace: '본사', role: '대리', type: '팀원급', sysRole: '관리자', joindate: '2021-09-01', phone: '010-4444-5555', active: true, raw_score: 95.0, final_score: 95.0, is_adjusted: false, final_grade: 'S', completed: 0, total: 6, company: '한양고속' },
      { id: 5, name: '김유신', email: 'kim@chungnam.com', dept: '차량', workplace: '아산영업소', role: '팀장', type: '팀장급', sysRole: '일반사용자', joindate: '2017-11-20', phone: '010-5555-6666', active: true, raw_score: 82.4, final_score: 82.4, is_adjusted: false, final_grade: 'B', completed: 0, total: 6, company: '충남고속' },
      { id: 6, name: '윤봉길', email: 'yoon@chungnam.com', dept: '영업소', workplace: '천안영업소', role: '주임', type: '팀원급', sysRole: '일반사용자', joindate: '2022-04-12', phone: '010-6666-7777', active: true, raw_score: 78.5, final_score: 78.5, is_adjusted: false, final_grade: 'B', completed: 0, total: 6, company: '충남고속' },
      { id: 7, name: '안중근', email: 'ahn@hanyang.com', dept: '정비', workplace: '대전영업소', role: '반장', type: '팀원급', sysRole: '일반사용자', joindate: '2019-08-05', phone: '010-7777-8888', active: true, raw_score: 86.0, final_score: 86.0, is_adjusted: false, final_grade: 'A', completed: 0, total: 6, company: '한양고속' }
    ];

    const DEFAULT_CYCLES_DB = [
      { id: 1, name: "'26년 상반기 인사평가", desc: "2026년 상반기 전사 360° 동료 다면평가 주간", start: "2026-01-01", end: "2026-06-30", deadline: "2026-07-31", status: "진행 중" }
    ];

    const DEFAULT_QUESTIONS_DB = [
      { id: 1, category: "성과", type: "5지선다형", weight: 33.3, max_score: 5, text: "이번 평가 기간 중 이 동료가 담당한 업무에서 가장 의미 있었던 성과나 완수한 목표는 무엇이라고 생각하시나요?", required: true, is_default: true },
      { id: 2, category: "협업", type: "5지선다형", weight: 33.3, max_score: 5, text: "이 동료가 업무를 진행하면서 문제를 해결했거나, 협업을 통해 긍정적인 결과를 만들었던 사례가 있다면 작성해 주세요.", required: true, is_default: true },
      { id: 3, category: "성장", type: "5지선다형", weight: 33.4, max_score: 5, text: "이 동료가 앞으로 더 성장하기 위해 개선하면 좋을 점이나, 발전 가능성이 높다고 생각되는 부분이 있다면 작성해 주세요.", required: true, is_default: true }
    ];

    const DEFAULT_HISTORY_DB = [
      {
        cycleId: 101,
        cycleName: "'25년 하반기 인사평가",
        closedAt: "2025-12-31",
        closedBy: "대표이사 / 인사관리자",
        snapshot: [
          { name: '홍길동', company: '한양고속', dept: '경리', role: '과장', score: 91.5, grade: 'S' },
          { name: '이순신', company: '충남고속', dept: '안전관리', role: '차장', score: 88.0, grade: 'A' },
          { name: '강감찬', company: '한양고속', dept: '사업', role: '부장', score: 100.0, grade: 'EX' },
          { name: '유종열', company: '한양고속', dept: '인사총무', role: '대리', score: 95.0, grade: 'S' },
          { name: '김유신', company: '충남고속', dept: '차량', role: '팀장', score: 82.4, grade: 'B' }
        ]
      }
    ];

    const DEFAULT_CYCLE_SCORES_DB = {
      1: {
        1: { raw: 91.5, final: 91.5, is_adjusted: false, grade: 'S' },
        2: { raw: 88.0, final: 88.0, is_adjusted: false, grade: 'A' },
        3: { raw: 100.0, final: 100.0, is_adjusted: true, grade: 'EX' },
        4: { raw: 95.0, final: 95.0, is_adjusted: false, grade: 'S' },
        5: { raw: 82.4, final: 82.4, is_adjusted: false, grade: 'B' },
        6: { raw: 78.5, final: 78.5, is_adjusted: false, grade: 'B' },
        7: { raw: 86.0, final: 86.0, is_adjusted: false, grade: 'A' }
      }
    };

    let usersDb = [];
    let cyclesDb = [];
    let customQuestionsDb = [];
    let evaluationHistoryDb = [];
    let cycleScoresDb = {};

    // LocalStorage Helper Functions
    let currentActiveView = 'list';
    let currentActiveSubtab = 'users';

    function saveToLocalStorage() {
      try {
        localStorage.setItem('cnhy_users_db', JSON.stringify(usersDb));
        localStorage.setItem('cnhy_cycles_db', JSON.stringify(cyclesDb));
        localStorage.setItem('cnhy_questions_db', JSON.stringify(customQuestionsDb));
        localStorage.setItem('cnhy_history_db', JSON.stringify(evaluationHistoryDb));
        localStorage.setItem('cnhy_cycle_scores_db', JSON.stringify(cycleScoresDb));
        localStorage.setItem('cnhy_current_user', JSON.stringify(currentLoggedInUser));
        localStorage.setItem('cnhy_last_view', currentActiveView);
        localStorage.setItem('cnhy_last_subtab', currentActiveSubtab);
      } catch (e) {
        console.error('LocalStorage write failed:', e);
      }
    }

    function loadFromLocalStorage() {
      try {
        const u = localStorage.getItem('cnhy_users_db');
        const c = localStorage.getItem('cnhy_cycles_db');
        const q = localStorage.getItem('cnhy_questions_db');
        const h = localStorage.getItem('cnhy_history_db');
        const cs = localStorage.getItem('cnhy_cycle_scores_db');
        const cur = localStorage.getItem('cnhy_current_user');

        usersDb = u ? JSON.parse(u) : JSON.parse(JSON.stringify(DEFAULT_USERS_DB));
        cyclesDb = c ? JSON.parse(c) : JSON.parse(JSON.stringify(DEFAULT_CYCLES_DB));
        customQuestionsDb = q ? JSON.parse(q) : JSON.parse(JSON.stringify(DEFAULT_QUESTIONS_DB));
        evaluationHistoryDb = h ? JSON.parse(h) : JSON.parse(JSON.stringify(DEFAULT_HISTORY_DB));
        cycleScoresDb = cs ? JSON.parse(cs) : JSON.parse(JSON.stringify(DEFAULT_CYCLE_SCORES_DB));
        if (cur) currentLoggedInUser = JSON.parse(cur);
      } catch (e) {
        console.error('LocalStorage read failed:', e);
        usersDb = JSON.parse(JSON.stringify(DEFAULT_USERS_DB));
        cyclesDb = JSON.parse(JSON.stringify(DEFAULT_CYCLES_DB));
        customQuestionsDb = JSON.parse(JSON.stringify(DEFAULT_QUESTIONS_DB));
        evaluationHistoryDb = JSON.parse(JSON.stringify(DEFAULT_HISTORY_DB));
        cycleScoresDb = JSON.parse(JSON.stringify(DEFAULT_CYCLE_SCORES_DB));
      }
    }

    function resetToDefaultData() {
      if (confirm('모든 데이터를 초기 샘플 데모 데이터로 리셋하시겠습니까?\n(추가된 사용자, 마감 이력, 변경된 점수 등이 모두 초기화됩니다.)')) {
        localStorage.clear();
        usersDb = JSON.parse(JSON.stringify(DEFAULT_USERS_DB));
        cyclesDb = JSON.parse(JSON.stringify(DEFAULT_CYCLES_DB));
        customQuestionsDb = JSON.parse(JSON.stringify(DEFAULT_QUESTIONS_DB));
        evaluationHistoryDb = JSON.parse(JSON.stringify(DEFAULT_HISTORY_DB));
        cycleScoresDb = JSON.parse(JSON.stringify(DEFAULT_CYCLE_SCORES_DB));
        saveToLocalStorage();
        alert('모든 데이터가 초기 샘플 데이터로 복구되었습니다!');
        location.reload();
      }
    }

    // Load persisted state on script execution
    loadFromLocalStorage();

    function populateCycleSelects() {
      const myReportSelect = document.getElementById('my-report-cycle-select');
      const questionSelect = document.getElementById('question-cycle-select');
      const permSelect = document.getElementById('perm-cycle-select');
      const summarySelect = document.getElementById('summary-cycle-select');
      const historyCloseSelect = document.getElementById('history-close-cycle-select');

      if (!cyclesDb || cyclesDb.length === 0) return;

      // Sort by newest created cycle first (top of dropdown list)
      const sortedCycles = [...cyclesDb].sort((a, b) => b.id - a.id);

      const optionsHtml = sortedCycles.map((c, i) => `<option value="${c.id}" ${i === 0 ? 'selected' : ''}>[${c.status}] ${c.name} (${c.start} ~ ${c.end})</option>`).join('');

      let myReportOptionsHtml = optionsHtml;
      if (evaluationHistoryDb && evaluationHistoryDb.length > 0) {
        const historyOptionsHtml = evaluationHistoryDb.map(h => `<option value="history_${h.cycleId}">[🔒 과거 보관이력] ${h.cycleName} (마감: ${h.closedAt})</option>`).join('');
        myReportOptionsHtml = optionsHtml + historyOptionsHtml;
      }

      if (myReportSelect) myReportSelect.innerHTML = myReportOptionsHtml;
      if (questionSelect) questionSelect.innerHTML = optionsHtml;
      if (permSelect) permSelect.innerHTML = optionsHtml;
      if (summarySelect) summarySelect.innerHTML = optionsHtml;
      if (historyCloseSelect) historyCloseSelect.innerHTML = optionsHtml;
    }

    function handleCloseCycleSubmit() {
      if (!currentLoggedInUser.isAdmin && !currentLoggedInUser.isExecutive) {
        alert('평가 마감 권한이 없습니다. (임원 및 관리자 전용)');
        return;
      }

      const selectEl = document.getElementById('history-close-cycle-select');
      if (!selectEl || !selectEl.value) {
        alert('마감할 평가 주기를 선택해 주세요.');
        return;
      }

      const cycleId = parseInt(selectEl.value);
      const targetCycle = cyclesDb.find(c => c.id === cycleId);

      if (!targetCycle) {
        alert('유효한 평가 주기를 선택해 주세요.');
        return;
      }

      if (targetCycle.status === '마감/보관됨') {
        alert(`[${targetCycle.name}] 은(는) 이미 마감 및 보관 완료된 평가 주기입니다.`);
        return;
      }

      if (!confirm(`정말로 평가 주기 [${targetCycle.name}] 을(를) 마감 처리하시겠습니까?\n\n마감 시 모든 최종 환산 점수가 과거 이력 스냅샷으로 영구 보관되며, 임원 및 관리자만 조회 가능한 보관소로 저장됩니다.`)) {
        return;
      }

      targetCycle.status = '마감/보관됨';

      const snapshot = usersDb.map(u => ({
        name: u.name,
        company: u.company,
        dept: u.dept,
        role: u.role,
        score: u.final_score,
        grade: u.final_grade,
        is_adjusted: u.is_adjusted
      }));

      evaluationHistoryDb.unshift({
        cycleId: targetCycle.id,
        cycleName: targetCycle.name,
        closedAt: new Date().toISOString().split('T')[0],
        closedBy: `${currentLoggedInUser.name} (${currentLoggedInUser.role || '관리자'})`,
        snapshot: snapshot
      });

      alert(`평가 주기 [${targetCycle.name}] 이(가) 성공적으로 마감되었습니다!\n과거 평가 이력 보관소에서 조회하실 수 있습니다.`);

      saveToLocalStorage();
      populateCycleSelects();
      renderCyclesList();
      renderHistoryTable();
    }

    function deleteArchivedHistory(cycleId) {
      if (!currentLoggedInUser.isAdmin && !currentLoggedInUser.isExecutive) {
        alert('보관된 평가 이력 삭제 권한이 없습니다. (임원 및 관리자 전용)');
        return;
      }

      const idx = evaluationHistoryDb.findIndex(h => h.cycleId === cycleId);
      if (idx === -1) return;

      const targetHistory = evaluationHistoryDb[idx];

      if (confirm(`정말로 보관된 과거 평가 이력 [${targetHistory.cycleName}] 항목을 삭제하시겠습니까?\n삭제 후에는 영구 보관된 성적 스냅샷이 완전히 제거됩니다.`)) {
        evaluationHistoryDb.splice(idx, 1);
        alert(`보관된 과거 평가 이력 [${targetHistory.cycleName}] 항목이 성공적으로 삭제되었습니다.`);

        saveToLocalStorage();
        renderHistoryTable();
      }
    }

    function renderHistoryTable() {
      const container = document.getElementById('archived-history-container');
      const countEl = document.getElementById('archived-cycles-count');
      if (!container) return;

      if (countEl) countEl.innerText = `${evaluationHistoryDb.length}건`;
      container.innerHTML = '';

      if (evaluationHistoryDb.length === 0) {
        container.innerHTML = `<div class="bg-slate-900/60 p-8 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">보관된 과거 평가 이력이 없습니다.</div>`;
        return;
      }

      evaluationHistoryDb.forEach(archive => {
        const div = document.createElement('div');
        div.className = 'bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl';

        let rowsHtml = archive.snapshot.map(s => {
          let badge = `<span class="bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded text-[10px]">${s.grade} Grade</span>`;
          if (s.grade === 'EX') badge = `<span class="glitter-another-level border border-amber-300/80 text-amber-200 font-bold px-2 py-0.5 rounded text-[10px]">🪽 EX (ANOTHER LEVEL)</span>`;
          else if (s.grade === 'S') badge = `<span class="glitter-diamond border border-cyan-400/80 text-cyan-200 font-bold px-2 py-0.5 rounded text-[10px]">💎 S Grade</span>`;
          else if (s.grade === 'A') badge = `<span class="glitter-gold border border-amber-500/80 text-amber-300 font-bold px-2 py-0.5 rounded text-[10px]">🥇 A Grade</span>`;

          return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-800/40">
              <td class="py-2.5 px-3 font-bold text-white">${s.name}</td>
              <td class="py-2.5 px-3 text-slate-400">${s.company} • ${s.dept}부</td>
              <td class="py-2.5 px-3 text-slate-400">${s.role}</td>
              <td class="py-2.5 px-3 font-mono font-bold text-brandTeal">${s.score.toFixed(1)}점</td>
              <td class="py-2.5 px-3">${badge}</td>
            </tr>
          `;
        }).join('');

        div.innerHTML = `
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-800 pb-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="bg-brandTeal/20 text-brandTeal border border-brandTeal/30 px-2 py-0.5 rounded text-[10px] font-bold">Closed</span>
                <span class="text-xs text-slate-400 font-bold">마감일: ${archive.closedAt}</span>
              </div>
              <h3 class="text-base font-bold text-white">${archive.cycleName}</h3>
              <p class="text-xs text-slate-400 mt-1">🔒 최종 확정자: ${archive.closedBy}</p>
            </div>
            <button onclick="deleteArchivedHistory(${archive.cycleId})" class="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-2.5 py-1 rounded text-[11px] font-bold border border-rose-500/20 transition">이력삭제</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-800 text-slate-400">
                  <th class="py-2 px-3 font-bold">성명</th>
                  <th class="py-2 px-3 font-bold">소속 및 부서</th>
                  <th class="py-2 px-3 font-bold">직위</th>
                  <th class="py-2 px-3 font-bold">최종점수</th>
                  <th class="py-2 px-3 font-bold">평가등급</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `;
        container.appendChild(div);
      });
    }

    function renderMyResults() {
      const selectEl = document.getElementById('my-report-cycle-select');
      if (!selectEl) return;
      const selectedVal = selectEl.value;

      let empScoreData = null;
      let userDbRecord = currentLoggedInUser;
      let isAdjusted = false;

      if (selectedVal && selectedVal.startsWith('history_')) {
        const histId = parseInt(selectedVal.replace('history_', ''));
        const histArchive = evaluationHistoryDb.find(h => h.cycleId === histId);
        if (histArchive) {
          const snap = histArchive.snapshot.find(s => s.name === (currentLoggedInUser ? currentLoggedInUser.name : '유종열'));
          if (snap) {
            empScoreData = {
              raw: snap.score,
              final: snap.score,
              grade: snap.grade,
              is_adjusted: snap.is_adjusted
            };
            isAdjusted = snap.is_adjusted;
          }
        }
      } else {
        const cycleId = selectedVal ? parseInt(selectedVal) : (typeof currentSelectedSummaryCycleId !== 'undefined' ? currentSelectedSummaryCycleId : 1);
        const cycleScores = cycleScoresDb[cycleId] || {};
        empScoreData = currentLoggedInUser ? cycleScores[currentLoggedInUser.id] : null;
        if (empScoreData) {
          isAdjusted = empScoreData.is_adjusted;
        }
      }

      const isPublished = (typeof isResultPublished !== 'undefined') ? isResultPublished : true;
      const hasActualEvaluations = empScoreData && (empScoreData.raw > 0 || empScoreData.final > 0);

      const cardEl = document.getElementById('my-grade-card');
      const medalEl = document.getElementById('my-medal-container');
      const titleEl = document.getElementById('my-grade-title');
      const scoreEl = document.getElementById('my-total-score');
      const chartCard = document.getElementById('my-chart-card');
      const adjustedNotice = document.getElementById('my-adjusted-notice');
      const adjustedScoreEl = document.getElementById('my-adjusted-total-score');
      const perfValEl = document.getElementById('my-perf-val');
      const collabValEl = document.getElementById('my-collab-val');
      const growthValEl = document.getElementById('my-growth-val');
      const harmonyValEl = document.getElementById('my-harmony-val');
      const aiStrengthEl = document.getElementById('my-ai-strength');
      const aiGuideEl = document.getElementById('my-ai-guide');
      const pBar = document.getElementById('my-perf-bar');
      const cBar = document.getElementById('my-collab-bar');
      const gBar = document.getElementById('my-growth-bar');
      const hBar = document.getElementById('my-harmony-bar');

      if (!isPublished) {
        if (scoreEl) scoreEl.innerText = `-`;
        if (cardEl) cardEl.className = "bg-slate-900/90 border border-slate-800 px-6 py-3 rounded-2xl text-center flex items-center gap-4 transition-all shadow-xl";
        if (medalEl) medalEl.innerHTML = `<i class="fa-solid fa-lock text-amber-500 text-3xl animate-pulse"></i>`;
        if (titleEl) {
          titleEl.className = "text-xl font-black text-slate-400";
          titleEl.innerText = `🔒 평가 결과 비공개 상태`;
        }
        if (aiStrengthEl) aiStrengthEl.innerHTML = '🔒 관리자가 평가 결과를 비공개 중입니다.';
        if (aiGuideEl) aiGuideEl.innerHTML = '🔒 평가 기간이 종료된 후 공개 여부를 문의해 주세요.';
      } else if (!hasActualEvaluations) {
        if (scoreEl) scoreEl.innerText = `-`;
        if (cardEl) cardEl.className = "bg-slate-900/90 border border-slate-800 px-6 py-3 rounded-2xl text-center flex items-center gap-4 transition-all shadow-xl";
        if (medalEl) medalEl.innerHTML = `<i class="fa-solid fa-hourglass-start text-amber-400 text-3xl animate-pulse"></i>`;
        if (titleEl) {
          titleEl.className = "text-xl font-black text-slate-400";
          titleEl.innerText = `⏳ 미평가 (평가 진행 중)`;
        }
        if (aiStrengthEl) aiStrengthEl.innerText = '⏳ 평가 결과가 아직 등록되지 않았습니다.';
      } else {
        const grade = empScoreData.grade;
        const totalScore = empScoreData.final.toFixed(1);
        if (scoreEl) scoreEl.innerText = `${totalScore}점`;
        if (adjustedScoreEl) adjustedScoreEl.innerText = `${totalScore}점`;

        if (grade === 'EX') {
          cardEl.className = "glitter-another-level border-2 px-6 py-4 rounded-2xl text-center flex items-center gap-4 transition-all shadow-2xl relative overflow-hidden";
          medalEl.innerHTML = `<span class="text-4xl animate-bounce">🪽</span>`;
          titleEl.className = "text-xl font-black text-amber-200";
          titleEl.innerText = `EX Grade (ANOTHER LEVEL)`;
        } else if (grade === 'S') {
          cardEl.className = "glitter-diamond border px-6 py-3 rounded-2xl text-center flex items-center gap-4 transition-all shadow-2xl";
          medalEl.innerHTML = `<i class="fa-solid fa-gem text-cyan-300 text-3xl"></i>`;
          titleEl.className = "text-xl font-black text-cyan-200";
          titleEl.innerText = `S Grade (Diamond)`;
        } else if (grade === 'A') {
          cardEl.className = "glitter-gold border px-6 py-3 rounded-2xl text-center flex items-center gap-4 transition-all shadow-2xl";
          medalEl.innerHTML = `<i class="fa-solid fa-award text-amber-300 text-3xl"></i>`;
          titleEl.className = "text-xl font-black text-amber-300";
          titleEl.innerText = `A Grade (Gold)`;
        } else {
          cardEl.className = "bg-slate-800/90 border border-slate-700 px-6 py-3 rounded-2xl text-center flex items-center gap-4 transition-all shadow-xl";
          medalEl.innerHTML = `<i class="fa-solid fa-medal text-slate-300 text-3xl"></i>`;
          titleEl.className = "text-xl font-black text-slate-200";
          titleEl.innerText = `B Grade (Silver)`;
        }
      }

      if (adjustedScoreEl && empScoreData) adjustedScoreEl.innerText = `${empScoreData.final.toFixed(1)}점`;

      if (!empScoreData) {
        if (perfValEl) perfValEl.innerText = '-';
        if (collabValEl) collabValEl.innerText = '-';
        if (growthValEl) growthValEl.innerText = '-';
        if (harmonyValEl) harmonyValEl.innerText = '-';

        if (pBar) pBar.style.width = '0%';
        if (cBar) cBar.style.width = '0%';
        if (gBar) gBar.style.width = '0%';
        if (hBar) hBar.style.width = '0%';

        if (aiStrengthEl) aiStrengthEl.innerText = '⏳ 해당 평가 주기는 아직 평가가 실시되거나 마감되지 않았습니다.';
        if (aiGuideEl) aiGuideEl.innerText = '⏳ 다면평가가 완료되면 AI 종합 성과 진단 및 맞춤형 성장 가이드라인이 제공됩니다.';
      } else {
        if (isAdjusted) {
          // HIDE category chart graph when executive adjustment is applied
          if (chartCard) chartCard.classList.add('hidden');
          if (adjustedNotice) adjustedNotice.classList.remove('hidden');
        } else {
          // SHOW category chart graph when normal
          if (chartCard) chartCard.classList.remove('hidden');
          if (adjustedNotice) adjustedNotice.classList.add('hidden');

          const finalScore = empScoreData.final;
          const pVal = Math.min(100, Math.max(60, (finalScore - 2.5).toFixed(1)));
          const cVal = Math.min(100, Math.max(60, (finalScore).toFixed(1)));
          const gVal = Math.min(100, Math.max(60, (finalScore - 7.0).toFixed(1)));
          const hVal = Math.min(100, Math.max(60, (finalScore - 1.0).toFixed(1)));

          if (perfValEl) perfValEl.innerText = `${pVal}점`;
          if (collabValEl) collabValEl.innerText = `${cVal}점`;
          if (growthValEl) growthValEl.innerText = `${gVal}점`;
          if (harmonyValEl) harmonyValEl.innerText = `${hVal}점`;

          if (pBar) pBar.style.width = '0%';
          if (cBar) cBar.style.width = '0%';
          if (gBar) gBar.style.width = '0%';
          if (hBar) hBar.style.width = '0%';

          setTimeout(() => {
            if (pBar) pBar.style.width = `${pVal}%`;
            if (cBar) cBar.style.width = `${cVal}%`;
            if (gBar) gBar.style.width = `${gVal}%`;
            if (hBar) hBar.style.width = `${hVal}%`;
          }, 100);
        }

        if (aiStrengthEl) aiStrengthEl.innerText = `실무 전산 및 행정 마감의 완결성이 매우 높으며, 사칙 준수 및 부서 간 협업 항목에서 고득점을 기록함 (최종점수 ${empScoreData.final.toFixed(1)}점).`;
        if (aiGuideEl) aiGuideEl.innerText = `월 1회 통합 전산 결산 교육 참여 및 양사 본사-영업소 실무 프로세스 매뉴얼 문서화 시도 권장.`;
      }

      // 3. Trigger Celebration Fireworks Explosion
      triggerFireworksAnimation();
    }

    // Admin Subtab Switcher
    function switchAdminTab(subtab) {
      const isExecOnly = currentLoggedInUser.isExecutive && !currentLoggedInUser.isAdmin;
      
      // Permission check for History subtab (Executive & Admin only)
      if (subtab === 'history' && !currentLoggedInUser.isAdmin && !currentLoggedInUser.isExecutive) {
        alert('과거 평가 이력 조회 권한이 없습니다. (임원 및 관리자 전용)');
        subtab = 'summary';
      }

      if (isExecOnly && subtab !== 'summary' && subtab !== 'history') {
        alert('임원 권한 사용자는 [📋 점수 집계 & 2차 조정] 및 [🔒 평가 마감 & 과거 이력] 접근 권한이 부여됩니다.');
        subtab = 'summary';
      }

      // Hide/Show subtab navigation buttons for Executives
      ['users', 'cycles', 'questions', 'permissions'].forEach(st => {
        const btn = document.getElementById(`admin-tab-${st}`);
        if (btn) {
          if (isExecOnly) btn.classList.add('hidden');
          else btn.classList.remove('hidden');
        }
      });

      const subtabs = ['users', 'cycles', 'questions', 'permissions', 'summary', 'history'];
      subtabs.forEach(st => {
        const el = document.getElementById(`admin-subtab-${st}`);
        const btn = document.getElementById(`admin-tab-${st}`);
        if (el) el.classList.add('hidden');
        if (btn) btn.className = "px-4 py-2 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white flex items-center gap-2 font-bold";
      });

      const targetEl = document.getElementById(`admin-subtab-${subtab}`);
      const targetBtn = document.getElementById(`admin-tab-${subtab}`);
      if (targetEl) targetEl.classList.remove('hidden');
      if (targetBtn) targetBtn.className = "px-4 py-2 rounded-xl transition bg-brandTeal text-white shadow-lg flex items-center gap-2 font-bold";

      currentActiveSubtab = subtab;
      saveToLocalStorage();

      populateCycleSelects();

      if (subtab === 'users') renderUsersTable();
      if (subtab === 'cycles') renderCyclesList();
      if (subtab === 'questions') renderQuestionsList();
      if (subtab === 'permissions') renderPermissionsTable();
      if (subtab === 'summary') renderAdminSummaryTable();
      if (subtab === 'history') renderHistoryTable();
    }

    let currentLoggedInUser = { name: '유종열', email: 'jongyeol@hanyang.com', role: '대리', dept: '인사총무', sysRole: '관리자', isAdmin: true, isExecutive: false };

    // Login Handler
    function handleLoginSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('login-emp-id').value.trim().toLowerCase();
      const pass = document.getElementById('login-password').value;

      const foundUser = usersDb.find(u => u.email.toLowerCase() === email);
      const isAdminUser = email.includes('admin') || email.includes('jongyeol') || (foundUser && (foundUser.sysRole === '관리자' || foundUser.email.includes('jongyeol')));
      const isExecUser = foundUser && (foundUser.type === '임원급' || (foundUser.role && (foundUser.role.includes('임원') || foundUser.role.includes('이사') || foundUser.role.includes('상무') || foundUser.role.includes('전무') || foundUser.role.includes('대표'))));

      if (foundUser) {
        currentLoggedInUser = { ...foundUser, isAdmin: isAdminUser, isExecutive: isExecUser };
      } else {
        currentLoggedInUser = { name: '유종열', email: email, role: '대리', dept: '인사총무', sysRole: isAdminUser ? '관리자' : '일반사용자', isAdmin: isAdminUser, isExecutive: false };
      }

      // Show/Hide top header items
      const headerUserInfo = document.getElementById('header-user-info');
      const mainNavTabs = document.getElementById('main-nav-tabs');
      if (headerUserInfo) headerUserInfo.classList.remove('hidden');
      if (mainNavTabs) mainNavTabs.classList.remove('hidden');

      // Update header badge
      document.getElementById('current-user-badge').innerText = `${currentLoggedInUser.name} (${currentLoggedInUser.email})`;

      // Admin Tab visibility check (Visible for Admins & Executives)
      const adminNavTab = document.getElementById('nav-tab-admin');
      const evalManageNavTab = document.getElementById('nav-tab-evalmanage');
      if (evalManageNavTab) {
        if (currentLoggedInUser.isAdmin || currentLoggedInUser.isExecutive) {
          evalManageNavTab.classList.remove('hidden');
        } else {
          evalManageNavTab.classList.add('hidden');
        }
      }
      if (adminNavTab) {
        if (currentLoggedInUser.isAdmin || currentLoggedInUser.isExecutive) {
          adminNavTab.classList.remove('hidden');
        } else {
          adminNavTab.classList.add('hidden');
        }
      }

      saveToLocalStorage();

      if (currentLoggedInUser.isAdmin || currentLoggedInUser.isExecutive) {
        navigateTo('admin');
        if (currentLoggedInUser.isExecutive && !currentLoggedInUser.isAdmin) {
          switchAdminTab('summary');
        } else {
          switchAdminTab('users');
        }
      } else {
        navigateTo('list');
        renderEmployeeGrid();
      }
    }

    function handlePasswordChangeSubmit(e) {
      e.preventDefault();
      const newP = document.getElementById('modal-new-password').value;
      const confP = document.getElementById('modal-confirm-password').value;

      if (newP.length < 4 || newP !== confP) {
        alert('비밀번호 확인이 일치하지 않거나 4자리 미만입니다.');
        return;
      }

      document.getElementById('modal-password-change').classList.add('hidden');
      alert('비밀번호가 안전하게 변경되었습니다!');
      
      const email = document.getElementById('login-emp-id').value.trim().toLowerCase();
      const foundUser = usersDb.find(u => u.email.toLowerCase() === email);
      const isAdminUser = email.includes('admin') || email.includes('jongyeol') || (foundUser && (foundUser.sysRole === '관리자' || foundUser.email.includes('jongyeol')));
      const isExecUser = foundUser && (foundUser.type === '임원급' || (foundUser.role && (foundUser.role.includes('임원') || foundUser.role.includes('이사') || foundUser.role.includes('상무') || foundUser.role.includes('전무') || foundUser.role.includes('대표'))));

      if (foundUser) {
        currentLoggedInUser = { ...foundUser, isAdmin: isAdminUser, isExecutive: isExecUser };
      } else {
        currentLoggedInUser = { name: '유종열', email: email, role: '대리', dept: '인사총무', sysRole: isAdminUser ? '관리자' : '일반사용자', isAdmin: isAdminUser, isExecutive: false };
      }

      const headerUserInfo = document.getElementById('header-user-info');
      const mainNavTabs = document.getElementById('main-nav-tabs');
      if (headerUserInfo) headerUserInfo.classList.remove('hidden');
      if (mainNavTabs) mainNavTabs.classList.remove('hidden');
      document.getElementById('current-user-badge').innerText = `${currentLoggedInUser.name} (${currentLoggedInUser.email})`;

      saveToLocalStorage();
      navigateTo('list');
      renderEmployeeGrid();
    }

    function handleLogout() {
      localStorage.removeItem('cnhy_current_user');
      localStorage.removeItem('cnhy_last_view');
      currentLoggedInUser = null;
      
      const headerUserInfo = document.getElementById('header-user-info');
      const mainNavTabs = document.getElementById('main-nav-tabs');
      if (headerUserInfo) headerUserInfo.classList.add('hidden');
      if (mainNavTabs) mainNavTabs.classList.add('hidden');

      navigateTo('login');
    }

    // Employee Grid Handler (Strict Matching: HQ <-> HQ, Branch <-> Same Company Branch)
    function renderEmployeeGrid() {
      const container = document.getElementById('employee-card-grid');
      container.innerHTML = '';

      const loggedInEmail = currentLoggedInUser ? currentLoggedInUser.email.toLowerCase() : '';
      const loggedInUserObj = usersDb.find(u => u.email.toLowerCase() === loggedInEmail) || currentLoggedInUser;
      const loggedInCompany = loggedInUserObj ? loggedInUserObj.company : '한양고속';
      const loggedInWorkplace = loggedInUserObj ? (loggedInUserObj.workplace || '본사') : '본사';
      const isLoggedInHQ = !loggedInWorkplace.includes('영업소') && !(loggedInUserObj.dept && loggedInUserObj.dept.includes('영업소'));

      // Simple & Clear Branch Matching Rule: Branch Office -> Same Company Only
      const targetEmployees = usersDb.filter(emp => {
        if (emp.email.toLowerCase() === loggedInEmail) return false; // Exclude self (자기평가 제외)

        const isEmpBranch = emp.workplace.includes('영업소') || emp.dept.includes('영업소');

        if (isLoggedInHQ) {
          // HQ staff evaluates HQ staff (Cross-company allowed for HQ)
          return !isEmpBranch;
        } else {
          // Branch Office staff ONLY evaluates SAME COMPANY employees ((주)한양고속은 한양고속끼리, (주)충남고속은 충남고속끼리)
          return emp.company.includes(loggedInCompany.replace('(주)', '').trim());
        }
      });

      const mySubmissions = JSON.parse(localStorage.getItem('cnhy_user_submissions') || '{}');
      let doneCount = 0;

      targetEmployees.forEach(emp => {
        const subKey = `${loggedInUserObj.id || currentLoggedInUser.id}_${emp.id}`;
        const isDone = mySubmissions[subKey] === true;
        if (isDone) doneCount++;

        const isCrossHQ = emp.company !== loggedInCompany;

        const card = document.createElement('div');
        if (isDone) {
          card.className = `glass-card rounded-2xl p-5 border border-emerald-500/30 bg-emerald-950/10 transition flex flex-col justify-between space-y-4 cursor-default`;
        } else {
          card.className = `glass-card rounded-2xl p-5 border border-slate-800 hover:border-brandTeal/50 transition cursor-pointer flex flex-col justify-between space-y-4 ${!emp.active ? 'opacity-50 pointer-events-none' : ''}`;
          card.onclick = () => openEvaluationForm(emp);
        }

        card.innerHTML = `
          <div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${emp.company.includes('한양') ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}">${emp.company}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isDone ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">${isDone ? '✅ 평가 완료' : '⏳ 대기 중'}</span>
            </div>
            <h4 class="text-base font-bold text-white">${emp.name} ${emp.role}</h4>
            <p class="text-xs text-slate-400 mt-1">${emp.dept}부 • ${emp.assigned_task || emp.workplace}</p>
            <div class="mt-2 flex items-center gap-1.5">
              <span class="text-[9px] font-bold px-2 py-0.5 rounded ${isCrossHQ ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'}">
                <i class="fa-solid ${isCrossHQ ? 'fa-shuffle' : 'fa-building'} mr-1"></i>
                ${isCrossHQ ? '본사 양사 유관부서 교차 평가 대상' : '본사 동일 소속 유관부서 평가 대상'}
              </span>
            </div>
          </div>
          <div class="border-t border-slate-800/80 pt-3 flex justify-between items-center text-xs">
            <span class="text-slate-500">${emp.active ? '동료평가 권한 활성화' : '권한 비활성화'}</span>
            <span class="${isDone ? 'text-emerald-400' : 'text-brandTeal'} font-bold">${isDone ? '🔒 평가 제출 완료됨' : '동료평가 작성'} ${isDone ? '' : '<i class="fa-solid fa-arrow-right text-[10px]"></i>'}</span>
          </div>
        `;
        container.appendChild(card);
      });

      // Update counter
      const totEl = document.getElementById('count-total-assignments');
      const compEl = document.getElementById('count-completed-assignments');
      if (totEl) totEl.innerText = `${targetEmployees.length} 건`;
      if (compEl) compEl.innerText = `${doneCount} 건`;
    }

    function openEvaluationForm(emp) {
      currentTargetEmp = emp;
      document.getElementById('eval-target-company').innerText = `(${emp.company})`;
      document.getElementById('eval-target-name').innerText = `${emp.name} ${emp.role}`;
      document.getElementById('eval-target-dept').innerText = `${emp.dept}부 • ${emp.assigned_task || emp.workplace}`;

      document.getElementById('modal-privacy-pledge').classList.remove('hidden');
    }

    function closePrivacyPledgeModal(agreed) {
      document.getElementById('modal-privacy-pledge').classList.add('hidden');
      if (agreed) {
        renderPeerQuestions();
        navigateTo('eval');
      }
    }

    function renderPeerQuestions() {
      const container = document.getElementById('statutory-questions-container');
      container.innerHTML = '';

      const dept = currentTargetEmp ? currentTargetEmp.dept : '인사총무';
      const isManager = currentTargetEmp ? (currentTargetEmp.type === '팀장급' || currentTargetEmp.role.includes('팀장') || currentTargetEmp.role.includes('부장')) : false;

      // Department Statutory Wording Map (Article 22 ~ 28)
      let statutoryTaskText = "문서 규칙 예규 관리 및 채용, 급여지급의 정확성 (사칙 제22조)";
      if (dept.includes('경리')) statutoryTaskText = "수입지출 관리, 자금 계획 및 결산의 정확성 (사칙 제23조)";
      else if (dept.includes('사업') || dept.includes('영업부')) statutoryTaskText = "노선 인허가, 매표/검표 위탁 관리, 운행일보 심사 및 통계 (사칙 제24조)";
      else if (dept.includes('차량')) statutoryTaskText = "차량 등록/검사, 폐차 관리 및 부품 절감 방안 연구 (사칙 제25조)";
      else if (dept.includes('안전')) statutoryTaskText = "교통안전계획, 사고 조사 분석 및 승무원 배차/근태 (사칙 제26조)";
      else if (dept.includes('영업소')) statutoryTaskText = "현장 수입금 정산 마감 및 고객 서비스, 현장 민원 조율 (사칙 제27조)";
      else if (dept.includes('정비')) statutoryTaskText = "차량 보수용품 출납 및 공구기계 관리, 기술 전수 (사칙 제28조)";

      // 10 Detailed Statutory Categories
      const tenCategories = [
        { cat: "1. [공통]", text: "회사 정관 및 사칙, 기본 일터 규율을 철저히 준수하는가?" },
        { cat: "2. [부서공통]", text: `${dept}부 소속 공동 목표 및 주요 성과(KPI) 달성을 위해 책임감 있게 기여하는가?` },
        { cat: "3. [직무전문성]", text: `사칙 기반 고유 직무 역량: ${statutoryTaskText}` },
        { cat: "4. [세부전문성]", text: `${dept}부 실무 전산, 마감, 서류 검토 및 행정 처리 완결성이 뛰어난가?` },
        { cat: "5. [업무적합성]", text: "과업의 완급을 조율하여 주어진 기한 내 완성도 있게 과업을 수행하는가?" },
        { cat: "6. [협조능력]", text: "타 부서 및 동료의 업무 요청 시 적극적으로 소통하고 협조를 제공하는가?" },
        { cat: "7. [분위기 환경조성]", text: "근무지 내 긍정적이고 화목한 일터 분위기를 조성하며 배려하는가?" },
        { cat: "8. [성격]", text: "예의 바르고 배려 있는 어투로 동료의 의견을 경청하는 성숙한 애티튜드를 갖추었는가?" },
        { cat: "9. [장차 활용가능성]", text: "타 직무 순환 배치 및 융합 업무 수행 시에도 뛰어난 활약 가능성을 갖추었는가?" },
        { cat: "10. [잠재력]", text: "신기술 습득 및 실무 프로세스 개선(자동화) 혁신 태도가 우수한가?" }
      ];

      // Render Track Info Badge Header
      const trackBadge = document.createElement('div');
      trackBadge.className = 'p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex justify-between items-center text-xs mb-3';
      trackBadge.innerHTML = `
        <span class="font-bold text-brandTeal">
          <i class="fa-solid fa-layer-group mr-1"></i>
          적용 트랙: <strong>${isManager ? 'Track B (팀장급)' : 'Track A (일반 사무직)'}</strong>
        </span>
        <span class="text-slate-400 text-[11px]">
          ${isManager ? '외부 타 부서장 평가(70%) + 임원 평가(30%)' : '동료(40%) + 외부(20%) + 부서장(30%) + 임원(10%)'}
        </span>
      `;
      container.appendChild(trackBadge);

      tenCategories.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2';
        item.innerHTML = `
          <div class="flex justify-between items-center">
            <p class="text-xs font-bold text-slate-200">Q${idx + 1}. ${q.cat} ${q.text}</p>
            <span class="text-[10px] bg-teal-500/20 text-brandTeal font-bold px-2 py-0.5 rounded">5지선다형</span>
          </div>
          <div class="flex items-center gap-3 pt-1">
            ${[1, 2, 3, 4, 5].map(num => `
              <label class="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="pq_${idx}" value="${num}" ${num === 4 ? 'checked' : ''} class="accent-brandTeal">
                <span class="text-xs text-slate-300 font-bold">${num}점</span>
              </label>
            `).join('')}
          </div>
        `;
        container.appendChild(item);
      });
    }

    function updateCommentCounter() {
      const text = document.getElementById('eval-comment-input').value;
      const counter = document.getElementById('comment-char-counter');
      counter.innerText = `${text.length} / 50자 이상`;
      if (text.length >= 50) {
        counter.className = "text-xs font-bold text-emerald-400";
      } else {
        counter.className = "text-xs font-bold text-amber-400";
      }
    }

    function openPreviewModal() {
      const text = document.getElementById('eval-comment-input').value;
      if (text.length < 50) {
        alert('신뢰도 높은 피드백을 위해 동료평가 서술 코멘트는 50자 이상 작성해야 합니다.');
        return;
      }

      const p = document.getElementById('slider-perf').value;
      const c = document.getElementById('slider-collab').value;
      const g = document.getElementById('slider-growth').value;

      document.getElementById('preview-sliders-summary').innerText = `성과 ${p} | 협업 ${c} | 성장 ${g}`;
      document.getElementById('preview-comment-summary').innerText = `"${text}"`;
      document.getElementById('modal-preview').classList.remove('hidden');
    }

    function closePreviewModal() {
      document.getElementById('modal-preview').classList.add('hidden');
    }

    function updateCompletedCounts() {
      const total = usersDb.length;
      const done = usersDb.filter(u => u.completed === u.total).length;
      const totEl = document.getElementById('count-total-assignments');
      const compEl = document.getElementById('count-completed-assignments');
      if (totEl) totEl.innerText = `${total} 건`;
      if (compEl) compEl.innerText = `${done} 건`;
    }

    function confirmFinalSubmission() {
      closePreviewModal();
      if (currentTargetEmp) {
        currentTargetEmp.completed = currentTargetEmp.total;

        // Dynamic 10 Statutory Questions Score Calculation (1~5 scaled to 100)
        let qSum = 0;
        let qCount = 0;
        for (let i = 0; i < 10; i++) {
          const checkedRadio = document.querySelector(`input[name="pq_${i}"]:checked`);
          if (checkedRadio) {
            qSum += (parseInt(checkedRadio.value) * 20);
            qCount++;
          }
        }

        const perfVal = parseFloat(document.getElementById('slider-perf').value) || 85;
        const collabVal = parseFloat(document.getElementById('slider-collab').value) || 90;
        const growthVal = parseFloat(document.getElementById('slider-growth').value) || 80;

        const qAvg = qCount > 0 ? (qSum / qCount) : 85;
        const sliderAvg = (perfVal + collabVal + growthVal) / 3;
        const computedRaw = Math.round(((qAvg * 0.6) + (sliderAvg * 0.4)) * 10) / 10;

        if (!currentTargetEmp.is_adjusted) {
          currentTargetEmp.raw_score = computedRaw;
          currentTargetEmp.final_score = computedRaw;
          if (computedRaw >= 90) currentTargetEmp.final_grade = 'S';
          else if (computedRaw >= 80) currentTargetEmp.final_grade = 'A';
          else if (computedRaw >= 70) currentTargetEmp.final_grade = 'B';
          else if (computedRaw >= 60) currentTargetEmp.final_grade = 'C';
          else currentTargetEmp.final_grade = 'D';
        }

        const subKey = `${currentLoggedInUser.id}_${currentTargetEmp.id}`;
        const mySubmissions = JSON.parse(localStorage.getItem('cnhy_user_submissions') || '{}');
        mySubmissions[subKey] = true;
        localStorage.setItem('cnhy_user_submissions', JSON.stringify(mySubmissions));
      }

      saveToLocalStorage();
      renderEmployeeGrid();
      renderAdminSummaryTable();
      renderUsersTable();
      updateCompletedCounts();

      alert(`[${currentTargetEmp ? currentTargetEmp.name : ''}] 님에 대한 360° 동료평가가 성공적으로 제출되어 '✅ 평가 완료' 상태로 변경되었습니다!`);
      navigateTo('list');
    }

    let currentEditingUserId = null;

    // ADMIN SUBTAB 1: USERS & CSV BULK REGISTRATION
    function renderUsersTable() {
      const tbody = document.getElementById('user-table-body');
      tbody.innerHTML = '';
      document.getElementById('user-list-count').innerText = usersDb.length;

      usersDb.forEach((u) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/40 transition';
        const autoPassword = `pw${String(u.id).padStart(4, '0')}!`;
        const roleBadge = u.sysRole === '관리자'
          ? `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold text-[10px]">👑 관리자</span>`
          : `<span class="bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-bold text-[10px]">👤 일반사용자</span>`;

        tr.innerHTML = `
          <td class="py-2.5 px-3 font-bold text-white">${u.name}</td>
          <td class="py-2.5 px-3"><span class="text-[10px] font-bold px-2 py-0.5 rounded ${u.company.includes('한양') ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}">${u.company}</span></td>
          <td class="py-2.5 px-3 font-mono text-teal-300">${u.email}</td>
          <td class="py-2.5 px-3">${u.dept}부 • ${u.workplace}</td>
          <td class="py-2.5 px-3 text-slate-400">${u.role}</td>
          <td class="py-2.5 px-3"><span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">${u.type}</span></td>
          <td class="py-2.5 px-3">${roleBadge}</td>
          <td class="py-2.5 px-3 text-slate-400">${u.joindate}</td>
          <td class="py-2.5 px-3 font-mono text-slate-400">${u.phone}</td>
          <td class="py-2.5 px-3 font-mono text-amber-400 font-bold">${autoPassword}</td>
          <td class="py-2.5 px-3 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="openEditUserModal(${u.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 border border-blue-500/30">
                <i class="fa-solid fa-pen-to-square"></i> 수정
              </button>
              <button onclick="deleteUserAccount(${u.id})" class="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 border border-rose-500/30">
                <i class="fa-solid fa-trash-can"></i> 삭제
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function openEditUserModal(id) {
      const user = usersDb.find(u => u.id === id);
      if (!user) return;
      currentEditingUserId = id;

      document.getElementById('edit-user-id').value = user.id;
      document.getElementById('edit-user-company').value = user.company.includes('충남') ? '(주)충남고속' : '(주)한양고속';
      document.getElementById('edit-user-name').value = user.name;
      document.getElementById('edit-user-email').value = user.email;
      document.getElementById('edit-user-dept').value = user.dept;
      document.getElementById('edit-user-workplace').value = user.workplace;
      document.getElementById('edit-user-role').value = user.role;
      document.getElementById('edit-user-type').value = user.type;
      document.getElementById('edit-user-sysrole').value = user.sysRole || '일반사용자';
      document.getElementById('edit-user-joindate').value = user.joindate;
      document.getElementById('edit-user-phone').value = user.phone;

      document.getElementById('modal-edit-user').classList.remove('hidden');
    }

    function closeEditUserModal() {
      document.getElementById('modal-edit-user').classList.add('hidden');
    }

    function handleEditUserSubmit(e) {
      e.preventDefault();
      const user = usersDb.find(u => u.id === currentEditingUserId);
      if (!user) return;

      user.company = document.getElementById('edit-user-company').value;
      user.name = document.getElementById('edit-user-name').value.trim();
      user.email = document.getElementById('edit-user-email').value.trim().toLowerCase();
      user.dept = document.getElementById('edit-user-dept').value.trim();
      user.workplace = document.getElementById('edit-user-workplace').value.trim();
      user.role = document.getElementById('edit-user-role').value.trim();
      user.type = document.getElementById('edit-user-type').value;
      user.sysRole = document.getElementById('edit-user-sysrole').value;
      user.joindate = document.getElementById('edit-user-joindate').value;
      user.phone = document.getElementById('edit-user-phone').value.trim();

      alert(`사용자 [${user.name}] 님의 계정 정보 및 시스템 권한(${user.sysRole})이 정상적으로 수정되었습니다.`);
      closeEditUserModal();
      saveToLocalStorage();
      renderUsersTable();
      renderEmployeeGrid();
      renderAdminSummaryTable();
    }

    function deleteUserAccount(id) {
      const userIdx = usersDb.findIndex(u => u.id === id);
      if (userIdx === -1) return;
      const userName = usersDb[userIdx].name;

      if (confirm(`사용자 [${userName}] 님의 계정을 정말 삭제하시겠습니까?\n삭제 후에는 해당 사용자의 계정이 시스템에서 즉시 제거됩니다.`)) {
        usersDb.splice(userIdx, 1);
        alert(`사용자 [${userName}] 계정이 성공적으로 삭제되었습니다.`);
        saveToLocalStorage();
        renderUsersTable();
        renderEmployeeGrid();
        renderAdminSummaryTable();
      }
    }

    function handleAddUserSubmit(e) {
      e.preventDefault();
      const company = document.getElementById('user-company-in').value;
      const name = document.getElementById('user-name-in').value.trim();
      const email = document.getElementById('user-email-in').value.trim().toLowerCase();
      const dept = document.getElementById('user-dept-in').value.trim();
      const workplace = document.getElementById('user-workplace-in').value.trim();
      const role = document.getElementById('user-role-in').value.trim();
      const joindateEl = document.getElementById('user-joindate-in');
      const joindate = joindateEl ? joindateEl.value : new Date().toISOString().slice(0,10);
      const type = document.getElementById('user-type-in').value;
      const sysRole = document.getElementById('user-sysrole-in').value;
      const phone = document.getElementById('user-phone-in').value.trim();

      const newId = usersDb.length + 1;

      usersDb.push({
        id: newId,
        name,
        email,
        dept,
        workplace,
        role,
        type,
        sysRole,
        joindate,
        phone,
        active: true,
        raw_score: 85.0,
        final_score: 85.0,
        is_adjusted: false,
        final_grade: 'A',
        completed: 6,
        total: 6,
        company,
        assigned_task: `${dept}부 고유 업무`
      });

      alert(`사용자 [${name} (${company} - ${sysRole})] 님이 성공적으로 등록되었습니다. 최초 자동 생성 비밀번호가 부여되었습니다.`);
      saveToLocalStorage();
      renderUsersTable();
    }

    function downloadCSVTemplate() {
      const header = "성명,이메일,소속사,부서,근무지,직급,입사일자,사원구분,전화번호,시스템권한\n";
      const sample = "홍길동,hong@hanyang.com,(주)한양고속,경리,본사,과장,2020-03-01,팀원급,010-1234-5678,일반사용자\n";
      const content = "\uFEFF" + header + sample;

      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', '사용자_일괄등록_양식.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function handleCSVUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length >= 8) {
            usersDb.push({
              id: usersDb.length + 1,
              name: cols[0],
              email: cols[1].toLowerCase(),
              company: cols[2] || (cols[4].includes('충남') ? '(주)충남고속' : '(주)한양고속'),
              dept: cols[3],
              workplace: cols[4],
              role: cols[5],
              joindate: cols[6],
              type: cols[7],
              phone: cols[8] || '010-0000-0000',
              active: true,
              raw_score: 85.0,
              final_score: 85.0,
              is_adjusted: false,
              final_grade: 'A',
              completed: 6,
              total: 6,
              assigned_task: `${cols[3]}부 업무`
            });
            count++;
          }
        }

        alert(`CSV 파일에서 총 ${count}명의 사용자를 소속사 정보와 함께 일괄 등록 완료하였습니다!`);
        saveToLocalStorage();
        renderUsersTable();
      };
      reader.readAsText(file, 'utf-8');
    }

    let currentEditingCycleId = null;

    // ADMIN SUBTAB 2: CYCLES
    function renderCyclesList() {
      const container = document.getElementById('cycle-list-container');
      container.innerHTML = '';

      cyclesDb.forEach(c => {
        const div = document.createElement('div');
        div.className = 'bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex justify-between items-center';
        div.innerHTML = `
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded text-[10px]">${c.status}</span>
              <span class="text-xs text-slate-400">업무기간: ${c.start} ~ ${c.end}</span>
            </div>
            <h4 class="text-sm font-bold text-white">${c.name}</h4>
            <p class="text-xs text-slate-400 mt-1">${c.desc}</p>
            <p class="text-[10px] text-amber-400 mt-1"><i class="fa-solid fa-clock mr-1"></i>평가 마감일: ${c.deadline}</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openEditCycleModal(${c.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-blue-500/30">
              <i class="fa-solid fa-pen-to-square"></i> 수정
            </button>
            <button onclick="deleteEvaluationCycle(${c.id})" class="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-rose-500/30">
              <i class="fa-solid fa-trash-can"></i> 삭제
            </button>
          </div>
        `;
        container.appendChild(div);
      });
    }

    function openEditCycleModal(id) {
      const cycle = cyclesDb.find(c => c.id === id);
      if (!cycle) return;
      currentEditingCycleId = id;

      document.getElementById('edit-cycle-id').value = cycle.id;
      document.getElementById('edit-cycle-name').value = cycle.name;
      document.getElementById('edit-cycle-desc').value = cycle.desc;
      document.getElementById('edit-cycle-start').value = cycle.start;
      document.getElementById('edit-cycle-end').value = cycle.end;
      document.getElementById('edit-cycle-deadline').value = cycle.deadline;
      document.getElementById('edit-cycle-status').value = cycle.status;

      document.getElementById('modal-edit-cycle').classList.remove('hidden');
    }

    function closeEditCycleModal() {
      document.getElementById('modal-edit-cycle').classList.add('hidden');
    }

    function handleEditCycleSubmit(e) {
      e.preventDefault();
      const cycle = cyclesDb.find(c => c.id === currentEditingCycleId);
      if (!cycle) return;

      cycle.name = document.getElementById('edit-cycle-name').value.trim();
      cycle.desc = document.getElementById('edit-cycle-desc').value.trim();
      cycle.start = document.getElementById('edit-cycle-start').value;
      cycle.end = document.getElementById('edit-cycle-end').value;
      cycle.deadline = document.getElementById('edit-cycle-deadline').value;
      cycle.status = document.getElementById('edit-cycle-status').value;

      alert(`평가 주기 [${cycle.name}] 정보가 성공적으로 수정되었습니다.`);
      closeEditCycleModal();
      saveToLocalStorage();
      populateCycleSelects();
      renderCyclesList();
    }

    function deleteEvaluationCycle(id) {
      const idx = cyclesDb.findIndex(c => c.id === id);
      if (idx === -1) return;
      const name = cyclesDb[idx].name;

      if (confirm(`평가 주기 [${name}] 항목을 정말 삭제하시겠습니까?\n삭제 후에는 해당 평가 주기가 리스트에서 완전 제거됩니다.`)) {
        cyclesDb.splice(idx, 1);
        delete cycleScoresDb[id];
        alert(`평가 주기 [${name}] 항목이 성공적으로 삭제되었습니다.`);
        saveToLocalStorage();
        populateCycleSelects();
        renderCyclesList();
        renderAdminSummaryTable();
      }
    }

    function handleCreateCycleSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('cycle-name-in').value.trim();
      const desc = document.getElementById('cycle-desc-in').value.trim();
      const start = document.getElementById('cycle-start-in').value;
      const end = document.getElementById('cycle-end-in').value;
      const deadline = document.getElementById('cycle-deadline-in').value;
      const status = document.getElementById('cycle-status-in').value;

      const newId = Date.now();
      const newCycle = {
        id: newId,
        name,
        desc,
        start,
        end,
        deadline,
        status
      };

      cyclesDb.push(newCycle);
      cycleScoresDb[newId] = {}; // Clean, empty score database for the new cycle

      saveToLocalStorage();
      populateCycleSelects();
      renderCyclesList();

      // Automatically select the new cycle in the summary dropdown
      const summarySelect = document.getElementById('summary-cycle-select');
      if (summarySelect) {
        summarySelect.value = newId;
      }
      renderAdminSummaryTable();

      alert(`✨ 새 평가 주기 [${name}]가 성공적으로 등록되었습니다!\n\n[점수 집계 & 2차 조정] 탭에서 해당 주기가 자동 선택되었으며, 아직 평가가 실시되지 않아 전체 인원이 '⏳ 미평가 (-)' 상태로 표시됩니다.`);
    }

    // ADMIN SUBTAB 3: QUESTIONS & WEIGHTS
    function recalculateWeights() {
      const p = parseFloat(document.getElementById('weight-perf-in').value) || 0;
      const c = parseFloat(document.getElementById('weight-collab-in').value) || 0;
      const g = parseFloat(document.getElementById('weight-growth-in').value) || 0;

      const sum = p + c + g;
      const indicator = document.getElementById('weight-total-indicator');
      if (Math.abs(sum - 100) < 0.1) {
        indicator.innerText = `카테고리 가중치 합계: ${sum.toFixed(1)}% (적정)`;
        indicator.className = "text-xs font-bold text-emerald-400";
      } else {
        indicator.innerText = `카테고리 가중치 합계: ${sum.toFixed(1)}% (합계 100% 조정 필요)`;
        indicator.className = "text-xs font-bold text-amber-400";
      }
    }

    function renderQuestionsList() {
      const container = document.getElementById('questions-list-container');
      if (!container) return;
      container.innerHTML = '';

      const questionSelect = document.getElementById('question-cycle-select');
      const selectedCycleId = questionSelect && questionSelect.value ? parseInt(questionSelect.value) : null;

      const filteredQuestions = selectedCycleId
        ? customQuestionsDb.filter(q => !q.cycleId || String(q.cycleId) === String(selectedCycleId))
        : customQuestionsDb;

      if (filteredQuestions.length === 0) {
        container.innerHTML = `<div class="bg-slate-900/60 p-6 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">선택된 평가 주기에 등록된 커스텀 질문이 없습니다. 위 양식에서 질문을 추가해 주세요.</div>`;
        return;
      }

      filteredQuestions.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = 'bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex justify-between items-center';
        div.innerHTML = `
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="bg-teal-500/20 text-brandTeal text-[10px] font-bold px-2 py-0.5 rounded">${q.category}</span>
              <span class="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded">${q.type}</span>
              ${q.required ? '<span class="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-1.5 py-0.5 rounded">필수</span>' : ''}
              ${q.is_default ? '<span class="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded">기본질문</span>' : ''}
            </div>
            <h4 class="text-xs font-bold text-white">Q${idx + 1}. (동료평가) ${q.text}</h4>
            <p class="text-[10px] text-slate-400 mt-1">가중치: ${q.weight}% | 최대점수: ${q.max_score}점</p>
          </div>
        `;
        container.appendChild(div);
      });
    }

    function handleAddQuestionSubmit(e) {
      e.preventDefault();
      const questionSelect = document.getElementById('question-cycle-select');
      const cycleId = questionSelect ? parseInt(questionSelect.value) : 1;
      const category = document.getElementById('q-category-in').value;
      const type = document.getElementById('q-type-in').value;
      const weight = parseFloat(document.getElementById('q-weight-in').value) || 0;
      const max_score = parseInt(document.getElementById('q-maxscore-in').value) || 5;
      const text = document.getElementById('q-text-in').value.trim();
      const required = document.getElementById('q-required-check').checked;
      const is_default = document.getElementById('q-default-check').checked;

      customQuestionsDb.push({
        id: customQuestionsDb.length + 1,
        cycleId: cycleId,
        category,
        type,
        weight,
        max_score,
        text,
        required,
        is_default
      });

      const targetCycle = cyclesDb.find(c => String(c.id) === String(cycleId));
      const cycleName = targetCycle ? targetCycle.name : '선택된 평가주기';

      alert(`[${cycleName}] 평가 주기에 [${category}] 커스텀 동료평가 질문이 성공적으로 추가되었습니다!`);
      document.getElementById('q-text-in').value = '';
      saveToLocalStorage();
      renderQuestionsList();
    }

    // ADMIN SUBTAB 4: PERMISSIONS
    function renderPermissionsTable() {
      const tbody = document.getElementById('permission-table-body');
      tbody.innerHTML = '';

      usersDb.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/40 transition';
        tr.innerHTML = `
          <td class="py-3 px-3 font-bold text-white">${u.name}</td>
          <td class="py-3 px-3 text-teal-300 font-mono">${u.email}</td>
          <td class="py-3 px-3">${u.company} • ${u.dept}부</td>
          <td class="py-3 px-3 text-slate-400">${u.role} (${u.type})</td>
          <td class="py-3 px-3">
            <span class="${u.active ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">
              ${u.active ? '🟢 동료평가 활성화' : '🔴 비활성화'}
            </span>
          </td>
          <td class="py-3 px-3 text-right">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" ${u.active ? 'checked' : ''} onchange="toggleUserPermission(${u.id})" class="sr-only peer">
              <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brandTeal"></div>
            </label>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function toggleUserPermission(userId) {
      const user = usersDb.find(u => u.id === userId);
      if (user) {
        user.active = !user.active;
        alert(`[${user.name}] 님의 동료평가 권한이 ${user.active ? '활성화' : '비활성화'} 되었습니다.`);
        saveToLocalStorage();
        renderPermissionsTable();
        renderEmployeeGrid();
      }
    }

    // ADMIN SUBTAB 5: SUMMARY & 2ND ADJUSTMENT
    let currentSelectedSummaryCycleId = 1;

    function renderAdminSummaryTable() {
      const summarySelect = document.getElementById('summary-cycle-select');
      if (summarySelect && summarySelect.value) {
        currentSelectedSummaryCycleId = parseInt(summarySelect.value);
      } else if (cyclesDb && cyclesDb.length > 0) {
        const sortedCycles = [...cyclesDb].sort((a, b) => b.id - a.id);
        currentSelectedSummaryCycleId = sortedCycles[0].id;
      } else {
        currentSelectedSummaryCycleId = 1;
      }

      const tbody = document.getElementById('admin-table-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      const cycleScores = cycleScoresDb[currentSelectedSummaryCycleId] || {};

      usersDb.forEach(emp => {
        const empScoreData = cycleScores[emp.id];
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/40 transition cursor-pointer';

        let rawScoreStr = '-';
        let finalScoreStr = '-';
        let isAdjustedStr = '<span class="text-slate-500">미상신</span>';
        let gradeBadgeHtml = `<span class="inline-flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-xl text-slate-400 text-xs font-bold"><i class="fa-solid fa-hourglass-start text-amber-400/80"></i> ⏳ 미평가 (진행중)</span>`;

        if (empScoreData) {
          rawScoreStr = `${empScoreData.raw.toFixed(1)}점`;
          finalScoreStr = `${empScoreData.final.toFixed(1)}점`;
          isAdjustedStr = `<span class="${empScoreData.is_adjusted ? 'text-amber-400 font-bold' : 'text-slate-500'}">${empScoreData.is_adjusted ? '조정됨' : '미조정'}</span>`;

          const g = empScoreData.grade;
          if (g === 'EX' || empScoreData.final >= 100) {
            gradeBadgeHtml = `
              <div class="relative inline-flex items-center gap-1.5 glitter-another-level border border-amber-300/90 px-3 py-1 rounded-xl shadow-xl shadow-amber-900/50">
                <span class="text-base animate-bounce">🪽</span>
                <span class="font-black text-xs text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-pink-200 to-cyan-200">EX (ANOTHER LEVEL)</span>
              </div>
            `;
          } else if (g === 'S') {
            gradeBadgeHtml = `
              <div class="relative inline-flex items-center gap-1.5 glitter-diamond border border-cyan-400/80 px-3 py-1 rounded-xl shadow-lg shadow-cyan-900/40">
                <i class="fa-solid fa-gem text-cyan-300 text-sm animate-spin3d"></i>
                <span class="font-black text-xs text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-200 to-purple-300">S Grade</span>
              </div>
            `;
          } else if (g === 'A') {
            gradeBadgeHtml = `
              <div class="inline-flex items-center gap-1.5 glitter-gold border border-amber-500/80 px-2.5 py-1 rounded-xl shadow-md">
                <i class="fa-solid fa-award text-amber-300 text-sm animate-spin3d"></i>
                <span class="font-black text-xs text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500">A Grade</span>
              </div>
            `;
          } else if (g === 'B') {
            gradeBadgeHtml = `
              <div class="inline-flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded-xl">
                <i class="fa-solid fa-medal text-slate-300 text-sm animate-spin3d"></i>
                <span class="font-bold text-xs text-slate-200">B Grade</span>
              </div>
            `;
          } else if (g === 'C') {
            gradeBadgeHtml = `
              <div class="inline-flex items-center gap-1.5 bg-amber-950/60 border border-amber-700/60 px-2.5 py-1 rounded-xl">
                <i class="fa-solid fa-shield text-amber-500 text-sm animate-spin3d"></i>
                <span class="font-bold text-xs text-amber-400">C Grade</span>
              </div>
            `;
          } else if (g === 'D') {
            gradeBadgeHtml = `
              <div class="inline-flex items-center gap-1.5 bg-stone-900/90 border border-stone-700 px-2.5 py-1 rounded-xl">
                <i class="fa-solid fa-cube text-stone-300 text-sm animate-spin3d"></i>
                <span class="font-bold text-xs text-stone-300">D Grade</span>
              </div>
            `;
          }
        }

        tr.onclick = () => openScoreAdjustmentModal(emp, empScoreData);

        const canViewDetails = currentLoggedInUser && (currentLoggedInUser.isAdmin || currentLoggedInUser.isExecutive);

        tr.innerHTML = `
          <td class="py-3 px-3 font-bold text-white">
            ${canViewDetails ? `
              <button onclick="event.stopPropagation(); openDetailEvalModal(${emp.id})" class="text-brandTeal hover:underline flex items-center gap-1 font-extrabold text-left group">
                <span>${emp.name}</span>
                <i class="fa-solid fa-magnifying-glass-chart text-[10px] text-teal-400 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition"></i>
              </button>
            ` : `<span>${emp.name}</span>`}
          </td>
          <td class="py-3 px-3">${emp.company} • ${emp.dept}부</td>
          <td class="py-3 px-3 text-slate-400">${emp.role}</td>
          <td class="py-3 px-3 font-mono">${rawScoreStr}</td>
          <td class="py-3 px-3 font-mono font-bold text-brandTeal">${finalScoreStr}</td>
          <td class="py-3 px-3">${isAdjustedStr}</td>
          <td class="py-3 px-3">${gradeBadgeHtml}</td>
          <td class="py-3 px-3 text-right">
            <button onclick="event.stopPropagation(); openScoreAdjustmentModal(usersDb.find(u=>u.id===${emp.id}), cycleScoresDb['${currentSelectedSummaryCycleId}'] ? cycleScoresDb['${currentSelectedSummaryCycleId}']['${emp.id}'] : null)" class="bg-slate-800 hover:bg-slate-700 text-xs px-2.5 py-1 rounded text-slate-300 font-bold border border-slate-700">점수 입력/조정</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function openDetailEvalModal(empId) {
      if (!currentLoggedInUser || (!currentLoggedInUser.isAdmin && !currentLoggedInUser.isExecutive)) {
        alert('피평가자 상세 360° 평가 내역은 임원 및 관리자 전용 기능입니다.');
        return;
      }

      const emp = usersDb.find(u => String(u.id) === String(empId));
      if (!emp) return;

      const cycleId = currentSelectedSummaryCycleId || 1;
      const cycleScores = cycleScoresDb[cycleId] || {};
      const scoreData = cycleScores[emp.id] || { raw: emp.raw_score || 85.0, final: emp.final_score || 85.0, grade: emp.final_grade || 'A' };

      document.getElementById('detail-modal-emp-name').innerText = `${emp.name} ${emp.role} 상세 360° 평가 리포트`;
      document.getElementById('detail-modal-emp-info').innerText = `${emp.company} • ${emp.dept}부 | ${emp.workplace} 근무`;
      document.getElementById('detail-modal-raw-score').innerText = `${scoreData.raw.toFixed(1)}점`;
      document.getElementById('detail-modal-final-score').innerText = `${scoreData.final.toFixed(1)}점`;

      const gradeBadgeEl = document.getElementById('detail-modal-grade-badge');
      if (scoreData.grade === 'EX') {
        gradeBadgeEl.className = 'font-bold text-xs text-amber-300';
        gradeBadgeEl.innerText = '🪽 EX (ANOTHER LEVEL)';
      } else if (scoreData.grade === 'S') {
        gradeBadgeEl.className = 'font-bold text-xs text-cyan-300';
        gradeBadgeEl.innerText = '💎 S Grade';
      } else if (scoreData.grade === 'A') {
        gradeBadgeEl.className = 'font-bold text-xs text-amber-400';
        gradeBadgeEl.innerText = '🥇 A Grade';
      } else {
        gradeBadgeEl.className = 'font-bold text-xs text-slate-300';
        gradeBadgeEl.innerText = `${scoreData.grade} Grade`;
      }

      // Mock / Seed Detailed Evaluations for 360 view
      const sampleEvaluators = [
        {
          name: '이순신 차장',
          dept: '안전관리부 (충남고속)',
          type: '1차 동료평가자',
          scores: { perf: 5, collab: 5, growth: 4, converted: 93.3 },
          comment: '월간 안전운행 지침 준수율이 매우 높고, 사고 발생 시 대처 능력이 탁월함. 타 부서원들과의 소통도 원활하여 항상 긍정적인 신뢰를 형성함.'
        },
        {
          name: '강감찬 부장',
          dept: '사업부 (한양고속)',
          type: '2차 교류 부서장',
          scores: { perf: 4, collab: 4, growth: 5, converted: 86.7 },
          comment: '본사-영업소 간 실무 프로세스 매뉴얼 문서화 시도가 인상적임. 적극적인 업무 개선 의지가 있으며 향후 리더십 발휘가 기대됨.'
        },
        {
          name: '유종열 대리',
          dept: '인사총무부 (한양고속)',
          type: '동료 협업 평가자',
          scores: { perf: 5, collab: 5, growth: 5, converted: 100.0 },
          comment: '전사 전산 결산 지원 및 문제 해결 시 즉각적으로 피드백을 제공함. 360도 평가지표 전 항목에서 훌륭한 모범을 보여줌.'
        }
      ];

      document.getElementById('detail-modal-eval-count').innerText = `${sampleEvaluators.length}명 제출 완료`;

      const listContainer = document.getElementById('detail-modal-evaluators-list');
      listContainer.innerHTML = sampleEvaluators.map((ev, idx) => `
        <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-3 shadow-md">
          <div class="flex justify-between items-center border-b border-slate-800/80 pb-2.5">
            <div class="flex items-center gap-2">
              <span class="bg-brandTeal/20 text-brandTeal text-[10px] font-bold px-2 py-0.5 rounded-full border border-brandTeal/30">${ev.type}</span>
              <h4 class="text-xs font-bold text-white">${ev.name}</h4>
              <span class="text-[11px] text-slate-400">(${ev.dept})</span>
            </div>
            <span class="text-xs font-mono font-bold text-amber-400">평가 환산: ${ev.scores.converted.toFixed(1)}점</span>
          </div>

          <div class="grid grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-xl text-[11px] text-slate-300 text-center">
            <div>성과: <strong class="text-white">${ev.scores.perf}점</strong> / 5점</div>
            <div>협업: <strong class="text-white">${ev.scores.collab}점</strong> / 5점</div>
            <div>성장: <strong class="text-white">${ev.scores.growth}점</strong> / 5점</div>
          </div>

          <div class="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 space-y-1">
            <span class="text-[11px] font-bold text-slate-400 block"><i class="fa-solid fa-comment-dots text-brandTeal mr-1"></i>서술형 피드백 코멘트:</span>
            <p class="text-xs text-slate-200 leading-relaxed font-normal">"${ev.comment}"</p>
          </div>
        </div>
      `).join('');

      document.getElementById('modal-detail-evaluation').classList.remove('hidden');
    }

    function closeDetailEvalModal() {
      document.getElementById('modal-detail-evaluation').classList.add('hidden');
    }

    function openScoreAdjustmentModal(emp, empScoreData) {
      selectedAdjustId = emp.id;
      const curScore = empScoreData ? empScoreData.final : 85.0;
      document.getElementById('adjust-emp-name').innerText = `${emp.name} ${emp.role} (선택된 주기 점수: ${empScoreData ? curScore + '점' : '미평가'})`;
      document.getElementById('adjust-score-input').value = curScore;
      document.getElementById('modal-score-adjustment').classList.remove('hidden');
      setTimeout(() => {
        const input = document.getElementById('adjust-score-input');
        input.focus();
        input.select();
      }, 100);
    }

    function saveScoreAdjustment() {
      const val = parseFloat(document.getElementById('adjust-score-input').value);
      if (isNaN(val) || val < 0 || val > 100) {
        alert('올바른 점수(0~100)를 입력하세요.');
        return;
      }

      let grade = 'D';
      if (val >= 100) grade = 'EX';
      else if (val >= 90) grade = 'S';
      else if (val >= 80) grade = 'A';
      else if (val >= 70) grade = 'B';
      else if (val >= 60) grade = 'C';

      if (!cycleScoresDb[currentSelectedSummaryCycleId]) {
        cycleScoresDb[currentSelectedSummaryCycleId] = {};
      }

      cycleScoresDb[currentSelectedSummaryCycleId][selectedAdjustId] = {
        raw: val,
        final: val,
        is_adjusted: true,
        grade: grade
      };

      const emp = usersDb.find(e => String(e.id) === String(selectedAdjustId));

      document.getElementById('modal-score-adjustment').classList.add('hidden');
      
      saveToLocalStorage();

      // Re-render summary table
      renderAdminSummaryTable();

      alert(`[${emp ? emp.name : '피평가자'}] 님의 해당 평가 주기 2차 점수가 ${val.toFixed(1)}점(${grade} Grade)으로 등록/조정되었습니다!`);
    }

    function toggleResultPublishing() {
      isResultPublished = !isResultPublished;
      const btnText = document.getElementById('admin-publish-status-text');
      const btn = document.getElementById('admin-publish-toggle-btn');

      if (isResultPublished) {
        btnText.innerText = '🌐 결과 공개 중 (클릭 시 비공개)';
        btn.className = 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/30';
        alert('평가 결과가 피평가자들에게 공개되었습니다.');
      } else {
        btnText.innerText = '🔒 결과 비공개 (클릭 시 공개)';
        btn.className = 'bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center gap-2 shadow-lg shadow-rose-900/30';
        alert('평가 결과가 다시 비공개로 변경되었습니다.');
      }
    }

    function downloadCSVReport() {
      let csvHeader = "이름,이메일,부서,근무지,직급,구분,최종점수,조정여부,원점수,평균점수(100점 환산),평가횟수,성과,협업,성장\n";
      let csvRows = usersDb.map(e => {
        const perf = (e.final_score * 0.35).toFixed(1);
        const collab = (e.final_score * 0.35).toFixed(1);
        const growth = (e.final_score * 0.30).toFixed(1);
        return `${e.name},${e.email},${e.dept},${e.workplace},${e.role},${e.type},${e.final_score.toFixed(1)},${e.is_adjusted ? '조정됨' : '미조정'},${e.raw_score.toFixed(1)},${e.final_score.toFixed(1)},${e.completed},${perf},${collab},${growth}`;
      }).join("\n");

      const csvContent = "\uFEFF" + csvHeader + csvRows;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `충남한양_인사평가_전체리포트_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function handleAddGoal() {
      const title = document.getElementById('goal-title-input').value.trim();
      const cat = document.getElementById('goal-category-select').value;
      if (!title) {
        alert('목표 명칭을 입력해주세요.');
        return;
      }

      const container = document.getElementById('goals-list-container');
      const item = document.createElement('div');
      item.className = 'bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex justify-between items-center';
      item.innerHTML = `
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="bg-teal-500/20 text-brandTeal text-[10px] font-bold px-2 py-0.5 rounded">${cat}</span>
            <span class="text-xs text-amber-400 font-bold">승인대기</span>
          </div>
          <h4 class="text-sm font-bold text-white">${title}</h4>
          <p class="text-xs text-slate-400 mt-1">💬 피드백: 관리자 검토 중입니다. 승인 후 확정됩니다.</p>
        </div>
      `;
      container.insertBefore(item, container.firstChild);
      document.getElementById('goal-title-input').value = '';
      alert('등록된 목표는 관리자의 승인을 거쳐 확정됩니다.');
    }

    // Default Initialization
    window.addEventListener('DOMContentLoaded', () => {
      loadFromLocalStorage();

      const lastView = localStorage.getItem('cnhy_last_view');
      const lastSubtab = localStorage.getItem('cnhy_last_subtab') || 'users';

      const storedUser = localStorage.getItem('cnhy_current_user');
      const headerUserInfo = document.getElementById('header-user-info');
      const mainNavTabs = document.getElementById('main-nav-tabs');

      if (!storedUser) {
        currentLoggedInUser = null;
        if (headerUserInfo) headerUserInfo.classList.add('hidden');
        if (mainNavTabs) mainNavTabs.classList.add('hidden');
        navigateTo('login');
      } else {
        currentLoggedInUser = JSON.parse(storedUser);
        if (headerUserInfo) headerUserInfo.classList.remove('hidden');
        if (mainNavTabs) mainNavTabs.classList.remove('hidden');

        const badge = document.getElementById('current-user-badge');
        if (badge) badge.innerText = `${currentLoggedInUser.name} (${currentLoggedInUser.email})`;

        const evalManageNavTab = document.getElementById('nav-tab-evalmanage');
        const adminNavTab = document.getElementById('nav-tab-admin');
        if (evalManageNavTab) {
          if (currentLoggedInUser.isAdmin || currentLoggedInUser.isExecutive) {
            evalManageNavTab.classList.remove('hidden');
          } else {
            evalManageNavTab.classList.add('hidden');
          }
        }
        if (adminNavTab) {
          if (currentLoggedInUser.isAdmin || currentLoggedInUser.isExecutive) {
            adminNavTab.classList.remove('hidden');
          } else {
            adminNavTab.classList.add('hidden');
          }
        }

        populateCycleSelects();
        renderEmployeeGrid();

        const targetView = (lastView && lastView !== 'login') ? lastView : 'list';
        navigateTo(targetView);

        if (targetView === 'evalmanage' || targetView === 'admin') {
          switchAdminTab(lastSubtab);
        }
      }
    });

    function navigateTo(viewId) {
      currentActiveView = viewId;
      localStorage.setItem('cnhy_last_view', viewId);

      // Hide all main section views
      const views = ['login', 'list', 'eval', 'goals', 'myresults', 'evalmanage', 'admin'];
      views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
        
        const tab = document.getElementById(`nav-tab-${v}`);
        if (tab) {
          tab.className = "px-4 py-2 rounded-xl transition text-slate-400 hover:bg-slate-800 hover:text-white flex items-center gap-2";
        }
      });

      // Show current active view
      const activeEl = document.getElementById(`view-${viewId}`);
      if (activeEl) {
        if (viewId === 'login') {
          activeEl.classList.remove('hidden');
          activeEl.classList.add('flex');
        } else {
          activeEl.classList.remove('hidden');
        }
      }

      // Highlight active nav tab if applicable
      const activeTab = document.getElementById(`nav-tab-${viewId}`);
      if (activeTab) {
        if (viewId === 'evalmanage') {
          activeTab.className = "px-4 py-2 rounded-xl transition bg-brandTeal text-white shadow-lg flex items-center gap-2 border border-brandTeal/30";
        } else if (viewId === 'admin') {
          activeTab.className = "px-4 py-2 rounded-xl transition bg-brandGold text-white shadow-lg flex items-center gap-2 border border-brandGold/30";
        } else {
          activeTab.className = "px-4 py-2 rounded-xl transition bg-brandTeal text-white shadow-lg flex items-center gap-2";
        }
      }

      // View specific rendering triggers
      if (viewId === 'list') {
        renderEmployeeGrid();
      } else if (viewId === 'myresults') {
        renderMyResults();
      } else if (viewId === 'admin') {
        switchAdminTab('users');
      } else if (viewId === 'evalmanage') {
        if (currentActiveSubtab === 'users') {
          switchAdminTab('cycles');
        } else {
          switchAdminTab(currentActiveSubtab);
        }
      }
    }
  
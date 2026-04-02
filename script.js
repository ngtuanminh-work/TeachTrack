// ===== Helper Date Local =====
function toLocalIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() { return toLocalIso(new Date()); }
function thisMonth() { return todayStr().slice(0,7); }

// ===== DATA =====
const STORAGE_KEY = 'tt_v4_tabbed';
let D = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        let parsed = JSON.parse(raw);
        const now = new Date();
        const today = toLocalIso(now);
        const currentTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

        if (parsed.sessions) {
            parsed.sessions = parsed.sessions.filter(s => {
                if (s.date > today) return false;
                if (s.date === today && s.end > currentTimeStr) return false;
                return true;
            });
        }
        
        // MIGRATION: Thùng rác
        if (!parsed.trash) {
            parsed.trash = [];
            if (parsed.schedules) {
                const inactive = parsed.schedules.filter(s => s.active === false);
                inactive.forEach(s => parsed.trash.push({ ...s, trashedAt: s.endDate || todayStr(), trashType: 'finished', trashedSessions: [] }));
                parsed.schedules = parsed.schedules.filter(s => s.active !== false);
            }
        }

        if (!parsed.trash_sessions) parsed.trash_sessions = [];
        if (!parsed.trash_absences) parsed.trash_absences = [];

        // MIGRATION: Rate History cho phép thay đổi lương mà không ảnh hưởng buổi cũ
        if (!parsed.settings) parsed.settings = { rates: { base: 85000, extra: 0, minutes: 60 } };
        if (!parsed.settings.rateHistory) {
            let eDate = '2020-01-01'; // Mặc định từ xa xưa
            if (parsed.sessions && parsed.sessions.length > 0) {
                eDate = parsed.sessions.reduce((min, s) => s.date < min ? s.date : min, parsed.sessions[0].date);
            }
            parsed.settings.rateHistory = [{
                date: eDate,
                base: parsed.settings.rates.base || 85000,
                minutes: parsed.settings.rates.minutes || 60,
                extra: parsed.settings.rates.extra || 0
            }];
        }
        
        return parsed;
    }
  } catch(e) {}
  return { settings:{rates:{base:85000, extra:0, minutes:60}, rateHistory: [{date: '2020-01-01', base: 85000, minutes: 60, extra: 0}]}, schedules:[], sessions:[], trash:[], trash_sessions:[], trash_absences:[] };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(D));
  renderAll();
}

// ===== CONSTANTS & UTILS =====
const WD = ['CN','T2','T3','T4','T5','T6','T7'];
const COLORS = ['#f0b429','#3fb950','#388bfd','#f85149','#bf91f3','#79c0ff','#56d364','#ffa657'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(n) { return Math.round(n).toLocaleString('vi-VN') + 'đ'; }
function fmtDate(ds) { if(!ds) return ''; const [y,m,d]=ds.split('-'); return `${d}/${m}/${y}`; }
function schById(id) { return D.schedules.find(s=>s.id===id); }

// Hàm lấy mức lương TẠI THỜI ĐIỂM ngày cụ thể
function getRateForDate(dateStr) {
    if (!D.settings.rateHistory || D.settings.rateHistory.length === 0) return D.settings.rates;
    const sorted = [...D.settings.rateHistory].sort((a,b) => b.date.localeCompare(a.date));
    for (let r of sorted) {
        if (dateStr >= r.date) return r;
    }
    return sorted[sorted.length - 1]; 
}

function isValidTime(t) { return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t); }

function formatTime(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + ':' + v.substring(2, 4);
    input.value = v;
}

function autoCountStudents(text) {
    if (!text) { document.getElementById('msch-stu').value = 1; return; }
    let count = 1;
    if (text.includes('-')) count = text.split('-').filter(x => x.trim().length > 0).length;
    else if (text.includes(',')) count = text.split(',').filter(x => x.trim().length > 0).length;
    document.getElementById('msch-stu').value = Math.max(1, count);
}

function updateManualStudentCount() {
    const sid = document.getElementById('mse-class').value;
    const sch = schById(sid);
    if (sch) document.getElementById('mse-stu').value = sch.students || 1;
}

function calcMoney(start, end, stu, dateStr) {
  if (stu <= 0) return 0;
  const r = getRateForDate(dateStr || todayStr());
  const min = (new Date('1970-01-01T'+end) - new Date('1970-01-01T'+start)) / 60000;
  const rateMins = (r.minutes && r.minutes > 0) ? r.minutes : 60;
  const base = r.base || 85000;
  const ext = r.extra ?? 0;
  const rateVal = base + (stu - 1) * ext;
  return min > 0 ? (rateVal / rateMins) * min : 0;
}

function getRemaining(sch) {
  if (!sch.total || sch.total <= 0) return Infinity;
  const done = D.sessions.filter(s => s.scheduleId === sch.id && s.students > 0).length;
  return Math.max(0, sch.total - done);
}

function predictEnd(sch) {
  if (sch.active === false) return sch.endDate || null;
  const rem = getRemaining(sch);
  if (!isFinite(rem) || rem <= 0) return null;
  const absList = sch.absences || [];
  const wds = Object.keys(sch.timeSlots).map(Number);
  if (wds.length === 0) return null;
  
  let d = new Date(); d.setHours(0,0,0,0);
  let [sy, sm, sd] = sch.startDate.split('-').map(Number);
  let startD = new Date(sy, sm-1, sd);
  if (startD > d) d = startD;

  let count = 0; let safety = 0;
  while (count < rem && safety++ < 1500) {
    const ds = toLocalIso(d);
    if (wds.includes(d.getDay()) && !absList.includes(ds)) count++;
    if (count < rem) d.setDate(d.getDate() + 1);
  }
  return count >= rem ? toLocalIso(d) : null;
}

function getClassDates(sch) {
    if (!sch || !sch.timeSlots) return [];
    const wds = Object.keys(sch.timeSlots).map(Number);
    if (wds.length === 0) return [];

    let dates = [];
    let cur = new Date(); cur.setHours(0,0,0,0);
    cur.setDate(cur.getDate() - 30); // Lùi lại 1 tháng

    let end = new Date(); end.setHours(0,0,0,0);
    end.setDate(end.getDate() + 30); // Tới 1 tháng sau

    let [sy, sm, sd] = sch.startDate.split('-').map(Number);
    let startD = new Date(sy, sm-1, sd); startD.setHours(0,0,0,0);

    if (cur < startD) cur = new Date(startD);

    while (cur <= end) {
        if (wds.includes(cur.getDay())) dates.push(toLocalIso(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

// ===== REAL-TIME AUTO SYNC =====
function autoSync() {
    const now = new Date();
    const currentDayStr = toLocalIso(now);
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${h}:${m}`;
    let hasNew = false;

    D.schedules.forEach(sch => {
        if (sch.active === false && !sch.endDate) return;
        
        let [sy, sm, sd] = sch.startDate.split('-').map(Number);
        let cur = new Date(sy, sm-1, sd);
        let limitStr = currentDayStr;
        if (sch.active === false && sch.endDate && sch.endDate < limitStr) limitStr = sch.endDate;
        let [ly, lm, ld] = limitStr.split('-').map(Number);
        let limitDate = new Date(ly, lm-1, ld);

        while (cur <= limitDate) {
            const ds = toLocalIso(cur);
            const wdStr = String(cur.getDay());

            if (sch.timeSlots && sch.timeSlots[wdStr]) {
                const tInfo = sch.timeSlots[wdStr];
                const exists = D.sessions.find(x => x.date === ds && x.scheduleId === sch.id);
                
                if (!exists) {
                    let canAdd = true;
                    if (ds === currentDayStr && currentTimeStr < tInfo.end) canAdd = false;

                    if (canAdd) {
                        let done = D.sessions.filter(s => s.scheduleId === sch.id && s.students > 0).length;
                        if (sch.total > 0 && done >= sch.total) break;

                        if ((sch.absences||[]).includes(ds)) {
                             D.sessions.push({
                                 id: uid(), scheduleId: sch.id, date: ds,
                                 start: tInfo.start, end: tInfo.end, students: 0,
                                 money: 0, note: 'Lớp nghỉ',
                                 className: sch.name, classColor: sch.color, absentStudents: []
                             });
                        } else {
                            D.sessions.push({
                                id: uid(), scheduleId: sch.id, date: ds,
                                start: tInfo.start, end: tInfo.end, students: sch.students,
                                money: calcMoney(tInfo.start, tInfo.end, sch.students, ds), note: '',
                                className: sch.name, classColor: sch.color, absentStudents: []
                            });
                        }
                        hasNew = true;
                    }
                }
            }
            cur.setDate(cur.getDate() + 1);
        }
    });

    if (hasNew) { localStorage.setItem(STORAGE_KEY, JSON.stringify(D)); return true; }
    return false;
}

setInterval(() => { if (autoSync()) renderAll(); }, 60000);

// ===== TABS & MODALS =====
function showTab(name, el) {
  localStorage.setItem('tt_last_tab', name);
  if (autoSync()) { /* Data changed silently */ }
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('page-'+name).classList.add('active');
  
  if (name === 'dashboard') {
      setTimeout(() => renderAll(), 10);
  } else {
      renderAll();
  }
}

function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }

function toggleDay(wd, defaultStart="", defaultEnd="") {
    const btn = document.getElementById(`dtog-${wd}`);
    const container = document.getElementById('time-inputs-container');
    const rowId = `trow-${wd}`;
    
    if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        const row = document.getElementById(rowId);
        if(row) row.remove();
    } else {
        btn.classList.add('active');
        const row = document.createElement('div');
        row.className = 'time-row';
        row.id = rowId;
        row.innerHTML = `
            <span>${WD[wd]}</span>
            <div class="fg"><label style="font-size:10px;margin:0">Bắt đầu</label><input type="text" class="t-start" data-wd="${wd}" value="${defaultStart}" placeholder="VD: 17:30" maxlength="5" oninput="formatTime(this)" required></div>
            <div class="fg"><label style="font-size:10px;margin:0">Kết thúc</label><input type="text" class="t-end" data-wd="${wd}" value="${defaultEnd}" placeholder="VD: 19:30" maxlength="5" oninput="formatTime(this)" required></div>
        `;
        const rows = Array.from(container.children);
        const nextNode = rows.find(r => {
            let rId = parseInt(r.id.split('-')[1]);
            let wWeight = wd===0 ? 7 : wd;
            let rWeight = rId===0 ? 7 : rId;
            return rWeight > wWeight;
        });
        if (nextNode) container.insertBefore(row, nextNode);
        else container.appendChild(row);
    }
}

// ===== TAB ĐIỂM DANH (ATTENDANCE) =====
function renderAttendanceTab() {
    const sid = document.getElementById('stu-class-select').value;
    const container = document.getElementById('stu-dates-container');
    const card = document.getElementById('stu-attendance-card');
    const newCard = document.getElementById('stu-new-card');

    let activeEl = container.querySelector('.date-tog.active');
    let selectedDate = activeEl ? activeEl.id.replace('stu-tog-', '') : null;

    if(!sid) {
        container.innerHTML=''; card.style.display='none'; newCard.style.display='none';
        return;
    }

    newCard.style.display='block';
    const sch = schById(sid);
    const dates = getClassDates(sch);
    
    container.innerHTML = dates.map(d => {
        const dObj = new Date(d);
        const label = `${WD[dObj.getDay()]}`;
        const sub = `${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}`;
        return `<div class="date-tog" id="stu-tog-${d}" onclick="selectAttendanceDate('${sid}', '${d}')">${label}<span>${sub}</span></div>`;
    }).join('');

    renderStudentManagement(sid);

    let targetDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates.reduce((a, b) => Math.abs(new Date(a) - new Date()) < Math.abs(new Date(b) - new Date()) ? a : b, dates[0]);
    if(targetDate) {
        setTimeout(() => {
           let el = document.getElementById(`stu-tog-${targetDate}`);
           if(el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }, 100);
        selectAttendanceDate(sid, targetDate);
    }
}

function selectAttendanceDate(sid, date) {
    document.querySelectorAll('#stu-dates-container .date-tog').forEach(el => el.classList.remove('active'));
    const tog = document.getElementById(`stu-tog-${date}`);
    if(tog) tog.classList.add('active');

    const sch = schById(sid);
    document.getElementById('stu-attendance-card').style.display = 'block';
    document.getElementById('stu-att-date-title').textContent = fmtDate(date);

    let sess = D.sessions.find(s => s.scheduleId === sid && s.date === date);
    let absentList = sess && sess.absentStudents ? sess.absentStudents : [];
    const listEl = document.getElementById('stu-att-list');

    if ((sch.absences||[]).includes(date)) {
        listEl.innerHTML = '<div class="alert alert-ok" style="background:var(--red-dim);color:var(--red);border-color:var(--red)">🛑 Lớp đã báo nghỉ toàn bộ vào ngày này. Không cần điểm danh lẻ tẻ.</div>';
        return;
    }

    let names = sch.name.split(/[-,]/).map(s => s.trim()).filter(s => s);
    const isNamedClass = (names.length > 1) || (names.length === 1 && sch.students === 1);

    if (isNamedClass) {
        listEl.innerHTML = names.map(n => {
            const isAbs = absentList.includes(n);
            return `
            <div class="cls-item" style="padding: 12px 0; border-bottom: 1px dashed var(--border)">
                <div class="cls-name" style="font-size:14px; color:${isAbs?'var(--muted)':'var(--text)'}; text-decoration:${isAbs?'line-through':'none'}">${n}</div>
                <div style="display:flex; gap:5px">
                    ${isAbs
                      ? `<button class="btn btn-g btn-sm" onclick="toggleStudentAtt('${sid}', '${date}', '${n}', false)">🔄 Đổi thành Đã học</button>`
                      : `<button class="btn btn-r btn-sm" onclick="toggleStudentAtt('${sid}', '${date}', '${n}', true)">🚫 Vắng mặt</button>
                         <button class="btn btn-r btn-sm" style="background:transparent;border:1px solid var(--border)" onclick="tabDropOut('${sid}', '${n}')" title="Đánh dấu nghỉ hẳn từ nay về sau">Nghỉ luôn</button>`
                    }
                </div>
            </div>`;
        }).join('');
    } else {
         let absCount = 0;
         if (sess && sess.students !== undefined) {
             absCount = Math.max(0, sch.students - sess.students);
         }
         listEl.innerHTML = `
         <div class="row">
             <div class="fg"><label>Sĩ số chuẩn hiện tại</label><input type="text" value="${sch.students} HS" disabled></div>
             <div class="fg"><label>Số HS Vắng mặt</label><input type="number" id="num-abs-${date}" min="0" max="${sch.students}" value="${absCount}"></div>
             <div class="fg" style="flex:0;justify-content:flex-end"><button class="btn btn-p" onclick="saveNumAtt('${sid}', '${date}')">Lưu trạng thái</button></div>
         </div>`;
    }
}

function toggleStudentAtt(sid, date, studentName, makeAbsent) {
    const sch = schById(sid);
    let sess = D.sessions.find(s => s.scheduleId === sid && s.date === date);

    if (!sess) {
         let wdStr = String(new Date(date).getDay());
         let tInfo = sch.timeSlots[wdStr];
         if(!tInfo) return alert('Lỗi: Ngày này không nằm trong lịch cố định!');
         sess = {
             id: uid(), scheduleId: sch.id, date: date,
             start: tInfo.start, end: tInfo.end, students: sch.students,
             money: calcMoney(tInfo.start, tInfo.end, sch.students, date), note: '',
             className: sch.name, classColor: sch.color, absentStudents: []
         };
         D.sessions.push(sess);
    }

    if (!sess.absentStudents) sess.absentStudents = [];

    if (makeAbsent) {
        if(!sess.absentStudents.includes(studentName)) sess.absentStudents.push(studentName);
    } else {
        sess.absentStudents = sess.absentStudents.filter(n => n !== studentName);
    }

    let names = sch.name.split(/[-,]/).map(s => s.trim()).filter(s => s);
    let baseTotal = names.length > 0 ? names.length : sch.students;

    sess.students = Math.max(0, baseTotal - sess.absentStudents.length);
    sess.money = calcMoney(sess.start, sess.end, sess.students, date);
    sess.note = sess.absentStudents.length > 0 ? `Vắng: ${sess.absentStudents.join(', ')}` : '';

    save();
}

function saveNumAtt(sid, date) {
     const val = parseInt(document.getElementById(`num-abs-${date}`).value);
     const sch = schById(sid);
     if (val < 0 || val >= sch.students) return alert('Số vắng không hợp lệ!');

     let sess = D.sessions.find(s => s.scheduleId === sid && s.date === date);
     if (!sess) {
         let wdStr = String(new Date(date).getDay());
         let tInfo = sch.timeSlots[wdStr];
         sess = {
             id: uid(), scheduleId: sch.id, date: date,
             start: tInfo.start, end: tInfo.end, students: sch.students,
             money: 0, note: '', className: sch.name, classColor: sch.color
         };
         D.sessions.push(sess);
     }

     sess.students = Math.max(0, sch.students - val);
     sess.money = calcMoney(sess.start, sess.end, sess.students, date);
     sess.note = val > 0 ? `Vắng ${val} HS` : '';
     save();
     alert('Đã cập nhật lương cho ngày này!');
}

function renderStudentManagement(sid) {
    const sch = schById(sid);
    let names = sch.name.split(/[-,]/).map(s => s.trim()).filter(s => s);
    const isNamedClass = (names.length > 1) || (names.length === 1 && sch.students === 1);
    
    document.getElementById('stu-tab-new-name-label').textContent = isNamedClass ? "Tên học sinh mới" : "Số lượng học sinh thêm";
    document.getElementById('stu-tab-new-name').type = isNamedClass ? "text" : "number";
    document.getElementById('stu-tab-new-name').value = isNamedClass ? "" : "1";

    const countContainer = document.getElementById('stu-drop-count-container');
    if (!isNamedClass) {
        countContainer.innerHTML = `
        <div style="padding:10px; background:var(--bg); border-radius:var(--rs); border:1px solid var(--border)">
            <strong style="display:block; margin-bottom:8px; font-size:12px; color:var(--red)">Giảm sĩ số (Có HS nghỉ hẳn)</strong>
            <div class="row">
                <div class="fg"><label>Từ ngày</label><input type="date" id="count-drop-date" value="${todayStr()}"></div>
                <div class="fg"><label>Số HS nghỉ hẳn</label><input type="number" id="count-drop-num" min="1" max="${sch.students}" value="1"></div>
                <div class="fg" style="flex:0; justify-content:flex-end"><button class="btn btn-r" onclick="tabDropOutCount('${sch.id}')">Xác nhận</button></div>
            </div>
        </div>`;
    } else {
        countContainer.innerHTML = '';
    }
}

function tabDropOut(sid, studentName) {
    const dropDate = prompt(`Nhập ngày "${studentName}" CHÍNH THỨC NGHỈ LUÔN (YYYY-MM-DD):\n(Các buổi học của lớp từ ngày này trở đi sẽ bị trừ tiền và gạch tên)`, todayStr());
    if (!dropDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dropDate)) return alert('Sai định dạng ngày!');

    const sch = schById(sid);
    if (!sch) return;

    if (sch.students <= 1) return alert('Lớp chỉ còn 1 HS! Hãy dùng nút "Kết thúc" ở tab Lớp & Lịch nếu lớp này giải tán.');
    if (!confirm(`Xác nhận cho "${studentName}" nghỉ luôn từ ngày ${fmtDate(dropDate)}?\nLương các buổi sau ngày này sẽ tự động giảm xuống.`)) return;

    let names = sch.name.split(/[-,]/).map(s => s.trim()).filter(s => s);
    names = names.filter(n => n !== studentName);
    sch.name = names.join(' - ');
    sch.students = Math.max(1, sch.students - 1);

    let updatedCount = 0;
    D.sessions.forEach(s => {
        if (s.scheduleId === sid && s.date >= dropDate) {
            s.className = sch.name;
            s.students = Math.max(1, s.students - 1);
            s.money = calcMoney(s.start, s.end, s.students, s.date);
            s.note = `${studentName} nghỉ hẳn`;
            updatedCount++;
        }
    });

    save();
    alert(`Đã xoá ${studentName} khỏi lớp từ ngày ${fmtDate(dropDate)}.\nĐã tự động cập nhật lại lương cho ${updatedCount} buổi học hiện có.`);
}

function tabDropOutCount(sid) {
    const dropDate = document.getElementById('count-drop-date').value;
    const dropNum = parseInt(document.getElementById('count-drop-num').value);
    
    if(!dropDate || !dropNum || dropNum < 1) return alert('Vui lòng nhập số lượng và ngày hợp lệ!');
    const sch = schById(sid);
    if(!sch) return;
    if(dropNum >= sch.students) return alert('Số nghỉ luôn không thể lớn hơn hoặc bằng tổng sĩ số!\n(Nếu lớp giải tán, vui lòng dùng nút "Đóng sổ" ở tab Lớp & Lịch)');
    
    if(!confirm(`Xác nhận giảm sĩ số lớp bớt ${dropNum} HS kể từ ngày ${fmtDate(dropDate)}?`)) return;

    sch.students = Math.max(1, sch.students - dropNum);
    let updatedCount = 0;
    D.sessions.forEach(s => {
        if (s.scheduleId === sid && s.date >= dropDate) {
            s.students = Math.max(1, s.students - dropNum);
            s.money = calcMoney(s.start, s.end, s.students, s.date);
            s.note = `Giảm sĩ số (nghỉ hẳn ${dropNum} HS)`;
            updatedCount++;
        }
    });

    save();
    alert(`Thành công! Đã giảm sĩ số xuống còn ${sch.students}.\nĐã cập nhật lại lương cho ${updatedCount} buổi học hiện có.`);
}

function tabAddStudent() {
    const sid = document.getElementById('stu-class-select').value;
    const sch = schById(sid);
    if (!sch) return;

    let names = sch.name.split(/[-,]/).map(s => s.trim()).filter(s => s);
    const isNamedClass = (names.length > 1) || (names.length === 1 && sch.students === 1);
    const dateStr = document.getElementById('stu-tab-new-date').value;
    if (!dateStr) return alert('Vui lòng chọn ngày bắt đầu!');

    if (isNamedClass) {
        const newName = document.getElementById('stu-tab-new-name').value.trim();
        if (!newName) return alert('Vui lòng nhập tên Học sinh!');

        if (confirm(`Học sinh "${newName}" sẽ bắt đầu học từ ngày ${fmtDate(dateStr)}. Xác nhận thêm?`)) {
            if (sch.name) sch.name += ' - ' + newName;
            else sch.name = newName;
            sch.students += 1;

            let updatedCount = 0;
            D.sessions.forEach(s => {
                if (s.scheduleId === sid && s.date >= dateStr) {
                    s.className = sch.name;
                    s.students += 1;
                    s.money = calcMoney(s.start, s.end, s.students, s.date);
                    s.note = `Thêm ${newName}`;
                    updatedCount++;
                }
            });

            document.getElementById('stu-tab-new-name').value = '';
            save();
            alert(`Thành công! Đã thêm ${newName} vào lớp.\nĐã tự động cập nhật lương cho ${updatedCount} buổi học có sẵn từ ngày ${fmtDate(dateStr)}.`);
        }
    } else {
        const addNum = parseInt(document.getElementById('stu-tab-new-name').value);
        if (!addNum || addNum < 1) return alert('Vui lòng nhập số lượng thêm hợp lệ!');

        if (confirm(`Sẽ tăng sĩ số thêm ${addNum} HS mới bắt đầu từ ngày ${fmtDate(dateStr)}. Xác nhận thêm?`)) {
            sch.students += addNum;
            let updatedCount = 0;
            D.sessions.forEach(s => {
                if (s.scheduleId === sid && s.date >= dateStr) {
                    s.students += addNum;
                    s.money = calcMoney(s.start, s.end, s.students, s.date);
                    s.note = `Thêm ${addNum} HS mới`;
                    updatedCount++;
                }
            });

            document.getElementById('stu-tab-new-name').value = '1';
            save();
            alert(`Thành công! Sĩ số hiện tại là ${sch.students}.\nĐã tự động cập nhật lương cho ${updatedCount} buổi học có sẵn từ ngày ${fmtDate(dateStr)}.`);
        }
    }
}

// ===== ABSENCES (Báo nghỉ toàn bộ lớp) =====
function renderAbsenceDates() {
    const sid = document.getElementById('abs-class').value;
    const container = document.getElementById('abs-dates-container');
    const detail = document.getElementById('abs-detail');
    
    let activeEl = container.querySelector('.date-tog.active');
    let selectedDate = activeEl ? activeEl.id.replace('abs-tog-', '') : null;

    if(!sid) { container.innerHTML=''; detail.style.display='none'; return; }

    const sch = schById(sid);
    if(!sch) return;

    const dates = getClassDates(sch);
    container.innerHTML = dates.map(d => {
        const isAbsent = (sch.absences||[]).includes(d);
        const dObj = new Date(d);
        const label = `${WD[dObj.getDay()]}`;
        const sub = `${String(dObj.getDate()).padStart(2,'0')}/${String(dObj.getMonth()+1).padStart(2,'0')}`;
        return `<div class="date-tog ${isAbsent ? 'absent' : ''}" id="abs-tog-${d}" onclick="selectAbsenceDate('${sid}', '${d}')">${label}<span>${sub}</span></div>`;
    }).join('');

    let targetDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates.reduce((a, b) => Math.abs(new Date(a) - new Date()) < Math.abs(new Date(b) - new Date()) ? a : b, dates[0]);
    if(targetDate) {
        setTimeout(() => {
           let el = document.getElementById(`abs-tog-${targetDate}`);
           if(el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }, 100);
        selectAbsenceDate(sid, targetDate);
    }
}

function selectAbsenceDate(sid, date) {
    document.querySelectorAll('#abs-dates-container .date-tog').forEach(el => el.classList.remove('active'));
    const tog = document.getElementById(`abs-tog-${date}`);
    if(tog) tog.classList.add('active');

    const sch = schById(sid);
    const isAbsent = (sch.absences||[]).includes(date);
    const detail = document.getElementById('abs-detail');
    detail.style.display = 'block';
    document.getElementById('abs-detail-title').textContent = `Ngày ${fmtDate(date)}`;

    const btn = document.getElementById('btn-toggle-class-absent');
    if (isAbsent) {
        btn.className = 'btn btn-g';
        btn.textContent = '🔄 Bỏ báo nghỉ (Học bình thường)';
        btn.onclick = () => toggleWholeClassAbsence(sid, date, false);
    } else {
        btn.className = 'btn btn-r';
        btn.textContent = '🛑 Báo NGHỈ toàn bộ lớp ngày này';
        btn.onclick = () => toggleWholeClassAbsence(sid, date, true);
    }
}

function toggleWholeClassAbsence(sid, date, makeAbsent) {
    const sch = schById(sid);
    if(!sch.absences) sch.absences = [];

    if (makeAbsent) {
        if(!sch.absences.includes(date)) sch.absences.push(date);
        
        let sess = D.sessions.find(s => s.scheduleId === sid && s.date === date);
        if (sess) {
            sess.students = 0; sess.money = 0; sess.note = 'Lớp nghỉ';
        } else if (date <= todayStr()) {
            let wdStr = String(new Date(date).getDay());
            let tInfo = sch.timeSlots[wdStr];
            D.sessions.push({
                 id: uid(), scheduleId: sch.id, date: date,
                 start: tInfo.start, end: tInfo.end, students: 0,
                 money: 0, note: 'Lớp nghỉ', className: sch.name, classColor: sch.color, absentStudents: []
            });
        }
    } else {
        sch.absences = sch.absences.filter(d => d !== date);
        
        // Đưa vào Thùng rác báo nghỉ
        if (!D.trash_absences) D.trash_absences = [];
        D.trash_absences.push({ id: uid(), scheduleId: sid, date: date, className: sch.name, color: sch.color, trashedAt: todayStr() });

        let sessIdx = D.sessions.findIndex(s => s.scheduleId === sid && s.date === date);
        if (sessIdx > -1) {
            let sess = D.sessions[sessIdx];
            if (sess.students === 0 && sess.note === 'Lớp nghỉ') {
                 D.sessions.splice(sessIdx, 1);
            }
        }
        autoSync(); 
    }
    save();
}

function renderAbsences() {
  fillClassSelect('abs-class');
  renderAbsenceDates(); 
  
  const el = document.getElementById('abs-list');
  let hasAbs = false;
  let html = '';
  
  D.schedules.forEach(sch => {
      // Chỉ hiện các báo nghỉ chưa bị ẩn
      const visibleAbs = (sch.absences || []).filter(d => !(sch.hiddenAbsences || []).includes(d));
      if(visibleAbs.length > 0) {
          hasAbs = true;
          let tags = visibleAbs.sort().map(d => 
              `<div class="tag" style="display:inline-flex; align-items:center; gap:5px; background:var(--surface2); border:1px solid var(--border); padding:5px 10px; border-radius:20px; font-size:12px; margin: 4px 4px 0 0;">
                📅 ${fmtDate(d)} 
                <button style="background:transparent; border:none; color:var(--red); cursor:pointer; font-size:14px; margin-left:4px" onclick="toggleWholeClassAbsence('${sch.id}', '${d}', false)" title="Bỏ báo nghỉ">×</button>
               </div>`
          ).join('');
          
          html += `
          <div class="cls-item" style="flex-direction:column; align-items:flex-start">
            <div style="display:flex; align-items:center; gap:8px">
                <div class="dot" style="background:${sch.color}"></div><strong style="color:var(--accent)">${sch.name}</strong>
            </div>
            <div>${tags}</div>
          </div>`;
      }
  });
  
  if(!hasAbs) { el.innerHTML = '<div class="empty">Hiện tại không có lớp nào hiển thị trong danh sách nghỉ.</div>'; } 
  else { el.innerHTML = html; }
}

function hideAllAbsences() {
    if(!confirm('Xác nhận ẩn tất cả các ngày nghỉ hiện tại khỏi danh sách hiển thị?\n(Lịch nghỉ vẫn được áp dụng bình thường, chỉ là dọn dẹp cho gọn danh sách)')) return;
    D.schedules.forEach(sch => {
        if (sch.absences && sch.absences.length > 0) {
            if (!sch.hiddenAbsences) sch.hiddenAbsences = [];
            sch.hiddenAbsences = [...new Set([...sch.hiddenAbsences, ...sch.absences])];
        }
    });
    save();
}

// ===== ABSENCE TRASH =====
function openAbsenceTrashModal() {
    if(!D.trash_absences) D.trash_absences = [];
    renderAbsenceTrashList();
    openModal('modal-abs-trash');
}

function renderAbsenceTrashList() {
    const el = document.getElementById('abs-trash-list');
    if(!D.trash_absences || D.trash_absences.length === 0) {
        el.innerHTML = '<div class="empty">Thùng rác trống</div>'; return;
    }
    el.innerHTML = D.trash_absences.map(a => `
        <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
            <div class="dot" style="background:${a.color||'#888'};flex-shrink:0"></div>
            <div style="flex:1;min-width:140px">
                <strong>${a.className}</strong>
                <div style="font-size:11px;color:var(--muted);margin-top:2px">
                    Ngày nghỉ: ${fmtDate(a.date)} · Đã xoá: ${fmtDate(a.trashedAt)}
                </div>
            </div>
            <button class="btn btn-grn btn-sm" onclick="restoreAbsenceTrash('${a.id}')" title="Phục hồi báo nghỉ này">🔄 Phục hồi</button>
            <button class="btn btn-r btn-sm" onclick="permDelAbsence('${a.id}')" title="Xoá vĩnh viễn">🗑</button>
        </div>
    `).join('');
}

function restoreAbsenceTrash(id) {
    const idx = D.trash_absences.findIndex(a=>a.id===id);
    if(idx>-1) {
        const item = D.trash_absences[idx];
        toggleWholeClassAbsence(item.scheduleId, item.date, true);
        D.trash_absences.splice(idx,1);
        save();
        renderAbsenceTrashList();
        alert('Đã phục hồi lịch nghỉ!');
    }
}

function permDelAbsence(id) {
    if(!confirm('Xoá vĩnh viễn báo nghỉ này?')) return;
    D.trash_absences = D.trash_absences.filter(a=>a.id!==id);
    save(); renderAbsenceTrashList();
}

function permDeleteAllAbsenceTrash() {
    if(!D.trash_absences || D.trash_absences.length === 0) return alert('Thùng rác trống!');
    if(!confirm('Xoá vĩnh viễn tất cả trong thùng rác báo nghỉ?')) return;
    D.trash_absences = []; save(); renderAbsenceTrashList();
}


// ===== SCHEDULE/CLASS MODAL =====
function initColorPicker(selectedColor) {
  const popover = document.getElementById('msch-color-popover');
  popover.innerHTML = COLORS.map(c =>
    `<div class="color-swatch${c===selectedColor?' sel':''}" style="background:${c}" onclick="selectColor('${c}')" title="${c}"></div>`
  ).join('');
  document.getElementById('msch-color-btn').style.background = selectedColor;
  document.getElementById('msch-color').value = selectedColor;
}

function toggleColorPicker() {
  const p = document.getElementById('msch-color-popover');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function selectColor(c) {
  document.getElementById('msch-color').value = c;
  document.getElementById('msch-color-btn').style.background = c;
  document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('sel'));
  document.querySelectorAll('.color-swatch').forEach(el => { if(el.style.background===c||el.title===c) el.classList.add('sel'); });
  document.getElementById('msch-color-popover').style.display = 'none';
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('#msch-color-btn') && !e.target.closest('#msch-color-popover')) {
    const p = document.getElementById('msch-color-popover');
    if(p) p.style.display = 'none';
  }
});

function openScheduleModal(id) {
  document.getElementById('msch-id').value = id||'';
  document.querySelectorAll('.dtog').forEach(el => el.classList.remove('active'));
  document.getElementById('time-inputs-container').innerHTML = '';

  if (id) {
    const s = schById(id);
    document.getElementById('msch-title').textContent = 'Chỉnh sửa Lớp';
    document.getElementById('msch-name').value = s.name;
    document.getElementById('msch-stu').value = s.students;
    document.getElementById('msch-sdate').value = s.startDate||'';
    document.getElementById('msch-total').value = s.total||0;
    initColorPicker(s.color || COLORS[0]);
    
    if(s.timeSlots) {
        Object.keys(s.timeSlots).forEach(wd => {
            const t = s.timeSlots[wd];
            toggleDay(parseInt(wd), t.start, t.end);
        });
    }
  } else {
    document.getElementById('msch-title').textContent = 'Thêm Lớp mới';
    document.getElementById('msch-name').value = '';
    document.getElementById('msch-stu').value = 1;
    document.getElementById('msch-sdate').value = todayStr();
    document.getElementById('msch-total').value = 0;
    initColorPicker(COLORS[D.schedules.length % COLORS.length]);
  }
  openModal('modal-sched');
}

function saveSchedule() {
  const id = document.getElementById('msch-id').value;
  const timeSlots = {};
  let hasError = false;
  let timeFormatError = false;

  document.querySelectorAll('.time-row').forEach(row => {
      const wd = row.querySelector('.t-start').getAttribute('data-wd');
      const start = row.querySelector('.t-start').value;
      const end = row.querySelector('.t-end').value;
      if(!start || !end) hasError = true;
      else if(!isValidTime(start) || !isValidTime(end)) timeFormatError = true;
      timeSlots[wd] = { start, end };
  });

  if (Object.keys(timeSlots).length === 0) return alert('Vui lòng chọn ít nhất 1 ngày học trong tuần!');
  if (hasError) return alert('Vui lòng nhập đủ giờ bắt đầu và kết thúc cho các ngày đã chọn!');
  if (timeFormatError) return alert('❌ Giờ không hợp lệ! Vui lòng nhập đúng định dạng 24h (Ví dụ: 08:30 hoặc 17:45)');

  const obj = {
    name: document.getElementById('msch-name').value.trim(),
    timeSlots: timeSlots,
    students: +document.getElementById('msch-stu').value,
    startDate: document.getElementById('msch-sdate').value,
    total: +document.getElementById('msch-total').value||0,
  };

  if (!obj.name||!obj.startDate) return alert('Điền đầy đủ Tên lớp và Ngày khai giảng!');
  if (obj.students < 1) return alert('Số học sinh tối thiểu là 1!');
  
  if (id) {
    const idx = D.schedules.findIndex(s=>s.id===id);
    D.schedules[idx] = {...D.schedules[idx], ...obj};
  } else {
    obj.color = document.getElementById('msch-color').value || COLORS[D.schedules.length % COLORS.length];
    D.schedules.push({id:uid(), absences: [], active: true, ...obj});
  }
  closeModal('modal-sched');
  autoSync(); 
  save();
}

function finishSchedule(id) {
    const sch = schById(id);
    if (!confirm(`XÁC NHẬN KẾT THÚC LỚP?\n\nLớp [${sch.name}] sẽ được chuyển vào Thùng rác.\n- Lịch sử tiền lương vẫn được giữ nguyên.\n- Có thể phục hồi lại từ nút 🗑 Thùng rác bất cứ lúc nào.`)) return;
    if (!D.trash) D.trash = [];
    D.trash.push({ ...sch, active: false, endDate: todayStr(), trashedAt: todayStr(), trashType: 'finished', trashedSessions: [] });
    D.schedules = D.schedules.filter(s => s.id !== id);
    save();
}

function delSchedule(id) {
  if (!confirm('Chuyển lớp này vào Thùng rác?\nBạn có thể phục hồi lại từ nút 🗑 Thùng rác.\n\n(Xoá vĩnh viễn trong Thùng rác sẽ xoá cả lịch sử buổi dạy)')) return;
  if (!D.trash) D.trash = [];
  const sch = schById(id);
  const trashedSessions = D.sessions.filter(s => s.scheduleId === id);
  D.trash.push({ ...sch, trashedAt: todayStr(), trashType: 'deleted', trashedSessions });
  D.schedules = D.schedules.filter(s => s.id !== id);
  D.sessions = D.sessions.filter(s => s.scheduleId !== id);
  save();
}

function markCompletedSchedules() {
  const completed = D.schedules.filter(s => s.active !== false && getRemaining(s) === 0 && s.total > 0);
  if (completed.length === 0) return alert('Bảng lớp đang gọn gàng, không có lớp nào đã đạt đủ số buổi cần đóng sổ!');
  
  if (confirm(`Tìm thấy ${completed.length} lớp ĐÃ HOÀN THÀNH đủ số buổi yêu cầu.\nBạn có muốn tự động chuyển chúng vào Thùng rác không?\n(Có thể phục hồi lại bất cứ lúc nào)`)) {
    if (!D.trash) D.trash = [];
    completed.forEach(s => {
      D.trash.push({ ...s, active: false, endDate: todayStr(), trashedAt: todayStr(), trashType: 'finished', trashedSessions: [] });
    });
    const completedIds = completed.map(s => s.id);
    D.schedules = D.schedules.filter(s => !completedIds.includes(s.id));
    save();
    alert(`Đã đóng sổ và chuyển ${completed.length} lớp vào Thùng rác!`);
  }
}

// ===== MANUAL SESSION =====
function openSessionModal(id) {
  fillClassSelect('mse-class');
  document.getElementById('mse-id').value = id || '';
  
  if (id) {
      const s = D.sessions.find(x => x.id === id);
      document.getElementById('mse-class').value = s.scheduleId;
      document.getElementById('mse-date').value = s.date;
      document.getElementById('mse-start').value = s.start;
      document.getElementById('mse-end').value = s.end;
      document.getElementById('mse-stu').value = s.students;
      document.getElementById('mse-note').value = s.note || '';
      document.querySelector('#modal-sess .modal-title').textContent = 'Chỉnh sửa Buổi dạy';
  } else {
      document.getElementById('mse-date').value = todayStr();
      document.getElementById('mse-note').value = '';
      document.getElementById('mse-start').value = '';
      document.getElementById('mse-end').value = '';
      updateManualStudentCount();
      document.querySelector('#modal-sess .modal-title').textContent = 'Thêm buổi dạy thủ công';
  }
  openModal('modal-sess');
}

function saveManualSession() {
  const id = document.getElementById('mse-id').value;
  const scheduleId = document.getElementById('mse-class').value;
  const date = document.getElementById('mse-date').value;
  const start = document.getElementById('mse-start').value;
  const end = document.getElementById('mse-end').value;
  const students = +document.getElementById('mse-stu').value;
  const note = document.getElementById('mse-note').value;
  
  if (!scheduleId||!date||!start||!end) return alert('Điền đầy đủ!');
  if (!isValidTime(start) || !isValidTime(end)) return alert('❌ Giờ không hợp lệ! Vui lòng nhập chuẩn 24h (VD: 08:30 hoặc 17:30)');

  const c = schById(scheduleId);
  
  if (id) {
      const idx = D.sessions.findIndex(s => s.id === id);
      if (idx > -1) {
          D.sessions[idx] = {
              ...D.sessions[idx],
              scheduleId, date, start, end, students, note,
              money: calcMoney(start, end, students, date),
              className: c ? c.name : 'Không rõ', 
              classColor: c ? c.color : '#888'
          };
      }
  } else {
      D.sessions.push({
          id:uid(), scheduleId, date, start, end, students, money:calcMoney(start,end,students,date), note,
          className: c ? c.name : 'Không rõ', classColor: c ? c.color : '#888', absentStudents: []
      });
  }
  
  closeModal('modal-sess');
  save();
}

function delSession(id) {
  if (!confirm('Đưa biên lai buổi dạy này vào thùng rác?')) return;
  const idx = D.sessions.findIndex(s=>s.id===id);
  if(idx > -1) {
      if(!D.trash_sessions) D.trash_sessions = [];
      D.trash_sessions.push({...D.sessions[idx], trashedAt: todayStr()});
      D.sessions.splice(idx, 1);
      save();
  }
}

// ===== SESSION TRASH =====
function openSessionTrashModal() {
    if(!D.trash_sessions) D.trash_sessions = [];
    renderSessionTrashList();
    openModal('modal-sess-trash');
}

function renderSessionTrashList() {
    const el = document.getElementById('sess-trash-list');
    if(!D.trash_sessions || D.trash_sessions.length === 0) {
        el.innerHTML = '<div class="empty">Thùng rác trống</div>'; return;
    }
    el.innerHTML = D.trash_sessions.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
            <div class="dot" style="background:${s.classColor||'#888'};flex-shrink:0"></div>
            <div style="flex:1;min-width:140px">
                <strong>${s.className}</strong>
                <div style="font-size:11px;color:var(--muted);margin-top:2px">
                    Ngày học: ${fmtDate(s.date)} · Giờ: ${s.start}-${s.end} · ${fmt(s.money)}
                </div>
            </div>
            <button class="btn btn-g btn-sm" onclick="editSessionTrash('${s.id}')" title="Chỉnh sửa rồi phục hồi">✏️ Sửa & Phục hồi</button>
            <button class="btn btn-grn btn-sm" onclick="restoreSessionTrash('${s.id}')" title="Phục hồi buổi dạy này">🔄 Phục hồi</button>
            <button class="btn btn-r btn-sm" onclick="permDelSession('${s.id}')" title="Xoá vĩnh viễn">🗑</button>
        </div>
    `).join('');
}

function restoreSessionTrash(id) {
    const idx = D.trash_sessions.findIndex(s=>s.id===id);
    if(idx>-1) {
        const item = {...D.trash_sessions[idx]};
        delete item.trashedAt;
        D.sessions.push(item);
        D.trash_sessions.splice(idx,1);
        save();
        renderSessionTrashList();
    }
}

function editSessionTrash(id) {
    closeModal('modal-sess-trash');
    restoreSessionTrash(id);
    setTimeout(() => openSessionModal(id), 150);
}

function permDelSession(id) {
    if(!confirm('Xoá vĩnh viễn biên lai này?')) return;
    D.trash_sessions = D.trash_sessions.filter(s=>s.id!==id);
    save(); renderSessionTrashList();
}

function permDeleteAllSessionTrash() {
    if(!D.trash_sessions || D.trash_sessions.length === 0) return alert('Thùng rác trống!');
    if(!confirm('Xoá vĩnh viễn tất cả biên lai trong thùng rác?')) return;
    D.trash_sessions = []; save(); renderSessionTrashList();
}


// ===== SETTINGS & EXPORT =====
function saveRates() {
  const base = +document.getElementById('rateBase').value||85000;
  const minutes = +document.getElementById('rateMinutes').value||60;
  const extra = document.getElementById('rateExtra').value !== '' ? +document.getElementById('rateExtra').value : 0;
  const date = document.getElementById('rateDate').value || todayStr();

  if (!D.settings.rateHistory) D.settings.rateHistory = [];
  const existingIdx = D.settings.rateHistory.findIndex(r => r.date === date);

  if (existingIdx > -1) {
      D.settings.rateHistory[existingIdx] = { date, base, minutes, extra };
  } else {
      D.settings.rateHistory.push({ date, base, minutes, extra });
  }
  D.settings.rateHistory.sort((a,b) => a.date.localeCompare(b.date));

  // Sync D.settings.rates to the most recent entry
  const latest = [...D.settings.rateHistory].sort((a,b) => b.date.localeCompare(a.date))[0];
  D.settings.rates = { base: latest.base, minutes: latest.minutes, extra: latest.extra };

  save();
  showRatePreview();
  alert(`✅ Đã lưu mức lương áp dụng từ ngày ${fmtDate(date)}!\n(Các buổi học từ ngày đó trở đi sẽ dùng mức lương này, các buổi cũ hơn vẫn giữ nguyên)`);
}

function renderRateHistory() {
  const el = document.getElementById('rate-history-list');
  if (!el) return;
  const history = D.settings.rateHistory || [];
  if (history.length === 0) { el.innerHTML = ''; return; }
  const sorted = [...history].sort((a,b) => b.date.localeCompare(a.date));
  el.innerHTML = `
    <div class="card-title" style="margin-bottom:8px">📋 Lịch sử thay đổi lương</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Áp dụng từ ngày</th><th>Lương / HS</th><th>Phút</th><th>Cộng thêm / HS</th><th></th></tr></thead>
        <tbody>
          ${sorted.map((r, i) => `
            <tr ${i===0 ? 'style="background:rgba(240,180,41,0.06)"' : ''}>
              <td>${fmtDate(r.date)} ${i===0 ? '<span class="badge by" style="margin-left:4px">Hiện tại</span>' : ''}</td>
              <td class="money">${fmt(r.base)}</td>
              <td style="color:var(--muted)">${r.minutes}p</td>
              <td style="color:var(--muted)">${r.extra > 0 ? '+'+fmt(r.extra) : '—'}</td>
              <td><div style="display:flex;gap:4px">
                <button class="btn btn-g btn-sm" onclick="editRate('${r.date}')" title="Chỉnh sửa mức lương này">✏️</button>
                ${sorted.length > 1 ? `<button class="btn btn-r btn-sm" onclick="deleteRate('${r.date}')" title="Xoá mức lương này">🗑</button>` : ''}
              </div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function editRate(date) {
  const r = D.settings.rateHistory.find(x => x.date === date);
  if (!r) return;
  document.getElementById('rateBase').value = r.base;
  document.getElementById('rateMinutes').value = r.minutes;
  document.getElementById('rateExtra').value = r.extra;
  document.getElementById('rateDate').value = r.date;
  document.getElementById('rateBase').focus();
}

function deleteRate(date) {
  if ((D.settings.rateHistory||[]).length <= 1) return alert('Phải giữ lại ít nhất 1 mức lương!');
  if (!confirm(`Xoá mức lương áp dụng từ ngày ${fmtDate(date)}?`)) return;
  D.settings.rateHistory = D.settings.rateHistory.filter(r => r.date !== date);
  const latest = [...D.settings.rateHistory].sort((a,b) => b.date.localeCompare(a.date))[0];
  D.settings.rates = { base: latest.base, minutes: latest.minutes, extra: latest.extra };
  save();
}

function showRatePreview() {
  const base=D.settings.rates.base||85000, ext=D.settings.rates.extra??0, mins=D.settings.rates.minutes||60;
  document.getElementById('rate-preview').innerHTML =
    `Ví dụ ${mins} phút: 1HS = <strong>${fmt(base)}</strong> | 2HS = <strong>${fmt(base+ext)}</strong> | 3HS = <strong>${fmt(base+ext*2)}</strong>`;
}

function renderSettings() {
  if (!D.settings) D.settings = { rates: { base: 85000, extra: 0, minutes: 60 } };
  if (!D.settings.rates.minutes) D.settings.rates.minutes = 60;
  document.getElementById('rateBase').value = D.settings.rates.base;
  document.getElementById('rateMinutes').value = D.settings.rates.minutes;
  document.getElementById('rateExtra').value = D.settings.rates.extra;
  document.getElementById('rateDate').value = todayStr();
  showRatePreview();
  renderRateHistory();
}

function exportBackup() {
  try {
    const json = JSON.stringify(D, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teachtrack_backup_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById('backup-info').innerHTML = '<span style="color:var(--green)">✅ Đã tải file backup xuống thành công!</span>';
  } catch(err) {
    console.error('Export error:', err);
    alert('Lỗi khi xuất file! Vui lòng thử lại.');
  }
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    let imp;
    try {
      imp = JSON.parse(r.result);
      if (!imp.schedules) throw new Error("File không đúng định dạng TeachTrack");
      if (!imp.settings) imp.settings = { rates: { base: 85000, extra: 0, minutes: 60 } };
      if (!imp.settings.rates.minutes) imp.settings.rates.minutes = 60;
    } catch (err) { 
      alert('File backup không hợp lệ hoặc bị lỗi dữ liệu!'); 
      console.error(err);
      e.target.value = '';
      return;
    }

    D = imp;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(D));
    
    try { renderAll(); } catch(renderErr) { console.warn('Render warning after import:', renderErr); }
    
    document.getElementById('backup-info').innerHTML = '<span style="color:var(--green)">✅ Khôi phục thành công! Trang đã được tự động cập nhật.</span>';
    e.target.value = '';
  };
  r.readAsText(file);
}

function exportExcel() {
  const month = document.getElementById('sess-month').value;
  const clsF = document.getElementById('sess-class').value;
  let ss = D.sessions.filter(s => {
    if (month && !s.date.startsWith(month)) return false;
    if (clsF && s.scheduleId !== clsF) return false;
    return true;
  }).sort((a,b)=>a.date.localeCompare(b.date));

  const rows = ss.map(s => {
    const min = (new Date('1970-01-01T'+s.end)-new Date('1970-01-01T'+s.start))/60000;
    return {'Ngày':fmtDate(s.date),'Lớp':s.className||'?','Giờ bắt đầu':s.start,'Giờ kết thúc':s.end,'Số phút':min,'Số HS':s.students,'Thu nhập (đ)':Math.round(s.money),'Ghi chú':s.note||''};
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Chi tiết');
  XLSX.writeFile(wb, `teachtrack_${month||'all'}.xlsx`);
}

// ===== HELPERS =====
function fillClassSelect(selId) {
  let optionsMap = new Map();
  const sorted = [...D.schedules].sort((a,b) => (b.active===false ? 1 : 0) - (a.active===false ? 1 : 0));
  sorted.forEach(c => { optionsMap.set(c.id, `${c.name} ${c.active===false?'(Đã KT)':''}`); });
  
  D.sessions.forEach(s => {
      if (!optionsMap.has(s.scheduleId)) {
          optionsMap.set(s.scheduleId, `${s.className || 'Lớp ẩn'} (Đã xoá)`);
      }
  });

  let opts = '';
  for (let [id, name] of optionsMap.entries()) { opts += `<option value="${id}">${name}</option>`; }
  
  const el = document.getElementById(selId);
  if (el) {
      const curVal = el.value; 
      if (selId === 'sess-class') {
          el.innerHTML = '<option value="">Tất cả lớp</option>' + opts;
      } else {
          el.innerHTML = opts;
      }
      if (curVal && optionsMap.has(curVal)) el.value = curVal; 
  }
}

// ===== RENDER =====
let charts = {};
function mkChart(id, cfg) {
  const dbPage = document.getElementById('page-dashboard');
  if (dbPage && !dbPage.classList.contains('active')) return;

  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (el) charts[id] = new Chart(el, cfg);
}

function getChartOpts() {
  return {
    scales: {
      y: { grid:{color:'rgba(48,54,61,.8)'}, ticks:{color:'#7d8590', callback: v => (v/1000).toLocaleString('vi-VN') + 'k'} },
      x: { grid:{display:false}, ticks:{color:'#7d8590'} }
    },
    plugins: { 
        legend:{display:false},
        tooltip: { callbacks: { label: function(context) { return context.raw.toLocaleString('vi-VN') + ' đ'; } } }
    },
    responsive: true,
    maintainAspectRatio: false
  };
}

function renderAll() {
  fillClassSelect('stu-class-select');
  renderDashboard();
  renderSchedules();
  renderSessions();
  renderAttendanceTab();
  renderAbsences();
  renderSettings();
}

function renderDashboard() {
  const month = document.getElementById('dash-month').value;
  const ss = month ? D.sessions.filter(s=>s.date.startsWith(month)) : D.sessions;
  const total = ss.reduce((a,s)=>a+s.money,0);
  const totalMin = ss.reduce((a,s)=>a+(new Date('1970-01-01T'+s.end)-new Date('1970-01-01T'+s.start))/60000,0);

  document.getElementById('stats').innerHTML = `
    <div class="stat">
      <div class="stat-label">💰 Thu nhập ${month?'tháng này':'tổng'}</div>
      <div class="stat-val" style="color:var(--green)">${fmt(total)}</div>
      <div class="stat-sub">${ss.length} buổi dạy</div>
    </div>
    <div class="stat g">
      <div class="stat-label">⏱️ Tổng thời gian</div>
      <div class="stat-val">${(totalMin/60).toFixed(1)}h</div>
      <div class="stat-sub">${Math.round(totalMin)} phút</div>
    </div>
    <div class="stat b">
      <div class="stat-label">📚 Lớp đang dạy</div>
      <div class="stat-val">${D.schedules.filter(s=>s.active!==false).length}</div>
      <div class="stat-sub">lịch cố định</div>
    </div>
    <div class="stat r">
      <div class="stat-label">📈 Trung bình/buổi</div>
      <div class="stat-val">${ss.length?fmt(total/ss.length):'0đ'}</div>
      <div class="stat-sub">Hiệu suất</div>
    </div>`;

  const mmap = {};
  D.sessions.forEach(s=>{ const m=s.date.slice(0,7); mmap[m]=(mmap[m]||0)+s.money; });
  const months = Object.keys(mmap).sort().slice(-8);
  mkChart('monthChart', {
    type:'bar',
    data:{labels:months.map(m=>{const[y,mo]=m.split('-');return`T${+mo}/${y.slice(2)}`;}),
      datasets:[{data:months.map(m=>Math.round(mmap[m])),backgroundColor:'rgba(240,180,41,.7)',borderColor:'#f0b429',borderWidth:2,borderRadius:6}]},
    options: getChartOpts()
  });

  const cmap = {};
  ss.forEach(s => { 
      const name = s.className || 'Lớp đã xoá';
      cmap[name] = (cmap[name] || 0) + s.money; 
  });
  const clsNames = Object.keys(cmap).sort((a,b)=>cmap[b]-cmap[a]);
  const clsColors = clsNames.map(name => {
      const foundSession = ss.find(s => s.className === name);
      return foundSession && foundSession.classColor ? foundSession.classColor : '#888';
  });

  mkChart('classChart', {
    type:'bar',
    data:{labels:clsNames,
      datasets:[{data:clsNames.map(n=>Math.round(cmap[n])),
        backgroundColor:clsColors.map(color => color + 'b3'),
        borderColor:clsColors,
        borderWidth:2,borderRadius:6}]},
    options: getChartOpts()
  });

  const ending = D.schedules.filter(s=>{
    if (s.active === false) return false;
    const rem = getRemaining(s);
    return isFinite(rem) && rem <= 5 && rem > 0;
  });
  const el = document.getElementById('ending-list');
  if (!ending.length) {
    el.innerHTML = '<div class="empty">Không có lớp nào sắp kết thúc 🎉</div>';
  } else {
    el.innerHTML = ending.map(sch => {
      const rem = getRemaining(sch);
      const pred = predictEnd(sch);
      return `<div class="cls-item">
        <div class="dot" style="background:${sch.color||'#888'}"></div>
        <div class="cls-name">${sch.name||'?'}</div>
        <span class="badge by">Còn ${rem} buổi</span>
        <div class="cls-sub">${pred?`Dự kiến: ${fmtDate(pred)}`:''}</div>
      </div>`;
    }).join('');
  }
}

function renderSchedules() {
  const tbody = document.getElementById('sched-list');
  if (!D.schedules.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty">Chưa có lịch cố định. Bấm "+ Thêm Lớp mới"!</div></td></tr>';
    return;
  }
  
  const sortedSchedules = [...D.schedules].filter(s => s.active !== false);
  
  tbody.innerHTML = sortedSchedules.map(sch => {
    const rem = getRemaining(sch);
    const total = sch.total||0;
    const done = D.sessions.filter(s => s.scheduleId === sch.id && s.students > 0).length;
    const pct = total > 0 ? Math.min(100, (done/total)*100) : 0;
    const fillCls = rem <= 3 ? 'd' : rem <= 7 ? 'w' : '';
    const ending = sch.active !== false && isFinite(rem) && rem <= 5 && rem > 0;
    const pred = predictEnd(sch);
    
    let timeInfoHTML = '';
    if (sch.timeSlots) {
        timeInfoHTML = Object.keys(sch.timeSlots).sort().map(wd => {
            const t = sch.timeSlots[wd];
            return `<div style="margin-bottom:4px; font-size:12px;"><span class="badge bb" style="width:35px;text-align:center">${WD[wd]}</span> ${t.start} - ${t.end}</div>`;
        }).join('');
    }
    
    const nameStyle = sch.active === false ? 'color: var(--muted); text-decoration: line-through;' : '';
    const statusBadge = sch.active === false ? `<span class="badge" style="background:var(--surface2); color:var(--muted); border: 1px solid var(--border)">Đã KT</span>` : '';

    return `<tr class="${ending?'ending-soon':''} ${sch.active===false?'archived-row':''}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
            <div class="dot" style="background:${sch.color||'#888'}"></div><strong style="${nameStyle}">${sch.name}</strong> ${statusBadge}
        </div>
        <div style="font-size:11px; color:var(--muted); margin-top:4px">Khai giảng: ${fmtDate(sch.startDate)}</div>
      </td>
      <td style="font-variant-numeric:tabular-nums;">${timeInfoHTML}</td>
      <td><span class="badge by">${sch.students} HS</span></td>
      <td>${total>0
        ? `<span class="badge ${rem<=3?'br':rem<=7?'by':'bg'}">Còn ${rem}/${total}</span>`
        : `<span class="badge bb">Đã dạy ${done}</span>`}</td>
      <td style="font-size:12px;color:var(--muted)">${sch.active===false ? 'Đã xong' : (pred?fmtDate(pred):'—')}</td>
      <td style="min-width:90px">${total>0
        ? `<div class="pbar"><div class="pfill ${fillCls}" style="width:${pct}%"></div></div>
           <div style="font-size:10px;color:var(--muted);margin-top:3px">${done}/${total} buổi</div>`
        : (sch.active === false
            ? `<div style="font-size:10px;color:var(--muted)">${done} buổi (đã KT)</div>`
            : `<div style="font-size:10px;color:var(--muted)">${done} buổi (vô hạn)</div>`)}</td>
      <td><div style="display:flex;gap:4px">
        ${sch.active !== false 
            ? `<button class="btn btn-g btn-sm" onclick="openScheduleModal('${sch.id}')" title="Sửa">✏️</button>` 
            : ``}
        ${sch.active !== false 
            ? `<button class="btn btn-r btn-sm" onclick="finishSchedule('${sch.id}')" title="Kết thúc / Dừng dạy">🛑</button>`
            : ``}
        <button class="btn btn-r btn-sm" onclick="delSchedule('${sch.id}')" title="Xoá vĩnh viễn toàn bộ dữ liệu">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function renderSessions() {
  fillClassSelect('sess-class');

  const month = document.getElementById('sess-month').value;
  const clsF = document.getElementById('sess-class').value;

  let ss = D.sessions.filter(s => {
    if (month && !s.date.startsWith(month)) return false;
    if (clsF && s.scheduleId !== clsF) return false;
    return true;
  });

  let events = [];
  if (D.settings.rateHistory && D.settings.rateHistory.length > 1) {
      let sortedHistory = [...D.settings.rateHistory].sort((a,b) => a.date.localeCompare(b.date));
      for (let i = 1; i < sortedHistory.length; i++) {
          let prev = sortedHistory[i-1];
          let curr = sortedHistory[i];
          if (!month || curr.date.startsWith(month)) {
              events.push({
                  isNote: true,
                  date: curr.date,
                  text: `Bắt đầu áp dụng mức lương mới: Từ ${fmt(prev.base)}/${prev.minutes}p lên ${fmt(curr.base)}/${curr.minutes}p`
              });
          }
      }
  }

  let displayItems = [...ss, ...events].sort((a,b) => {
      let d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      if (a.isNote && !b.isNote) return 1;
      if (!a.isNote && b.isNote) return -1;
      if (!a.isNote && !b.isNote) return b.start.localeCompare(a.start);
      return 0;
  });

  const tbody = document.getElementById('sess-list');
  if (!displayItems.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty">Chưa có dữ liệu.</div></td></tr>';
    document.getElementById('sess-summary').style.display = 'none';
    return;
  }

  tbody.innerHTML = displayItems.map(s => {
    if (s.isNote) {
        return `<tr>
            <td style="font-variant-numeric:tabular-nums; color:var(--accent); font-weight:bold;">${fmtDate(s.date)}</td>
            <td colspan="7"><div class="alert alert-ok" style="margin:0; padding:6px 12px; background:var(--accent-dim); color:var(--accent); border:1px solid var(--accent); font-weight:bold;">⚠️ Ghi chú hệ thống: ${s.text}</div></td>
        </tr>`;
    }

    const isCancelled = s.students === 0; 
    const min = isCancelled ? 0 : (new Date('1970-01-01T'+s.end)-new Date('1970-01-01T'+s.start))/60000;
    
    return `<tr style="${isCancelled ? 'opacity: 0.6' : ''}">
      <td style="font-variant-numeric:tabular-nums">${fmtDate(s.date)}</td>
      <td><div style="display:flex;align-items:center;gap:7px">
        <div class="dot" style="background:${s.classColor||'#888'}"></div><strong>${s.className||'?'}</strong>
      </div></td>
      <td style="font-size:12px;color:var(--muted)">${isCancelled ? '—' : `${s.start}–${s.end}`}</td>
      <td><span class="badge bb">${s.students} HS</span></td>
      <td style="color:var(--muted);font-size:12px">${isCancelled ? '—' : `${min}p`}</td>
      <td class="money">${fmt(s.money)}</td>
      <td style="font-size:12px;color:${isCancelled?'var(--red)':'var(--muted)'};max-width:140px; font-weight:${isCancelled?'bold':'normal'}">${s.note||''}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-g btn-sm" onclick="openSessionModal('${s.id}')" title="Sửa thông tin">✏️</button>
        <button class="btn btn-r btn-sm" onclick="delSession('${s.id}')" title="Xoá">🗑</button>
      </div></td>
    </tr>`;
  }).join('');

  const totalMoney = ss.reduce((a,s)=>a+s.money,0);
  const totalMin = ss.reduce((a,s)=>a+(s.students===0 ? 0 : (new Date('1970-01-01T'+s.end)-new Date('1970-01-01T'+s.start))/60000),0);
  const summary = document.getElementById('sess-summary');
  summary.style.display = 'block';
  summary.innerHTML = `<div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center; padding:15px">
    <div><div class="cls-sub">Số buổi hợp lệ</div><strong style="font-size:16px">${ss.filter(x=>x.students>0).length}</strong></div>
    <div><div class="cls-sub">Tổng thời gian</div><strong style="font-size:16px">${(totalMin/60).toFixed(1)}h</strong></div>
    <div><div class="cls-sub">Tổng thu nhập</div><strong class="money" style="font-size:20px">${fmt(totalMoney)}</strong></div>
  </div>`;
}

// ===== THÙNG RÁC LỚP =====
function openTrashModal() {
    if (!D.trash) D.trash = [];
    renderTrashList();
    openModal('modal-trash');
}

function renderTrashList() {
    const el = document.getElementById('trash-list');
    if (!D.trash || D.trash.length === 0) {
        el.innerHTML = '<div class="empty">Thùng rác trống 🎉</div>';
        return;
    }
    el.innerHTML = D.trash.map(item => `
        <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
            <div class="dot" style="background:${item.color||'#888'};flex-shrink:0"></div>
            <div style="flex:1;min-width:140px">
                <strong>${item.name}</strong>
                <div style="font-size:11px;color:var(--muted);margin-top:2px">
                    ${item.trashType === 'finished' ? '🛑 Đã kết thúc' : '🗑 Đã xoá'}
                    · ${fmtDate(item.trashedAt)}
                    ${item.trashedSessions && item.trashedSessions.length ? ' · ' + item.trashedSessions.length + ' buổi lưu trữ' : ''}
                </div>
            </div>
            <button class="btn btn-g btn-sm" onclick="editTrashItem('${item.id}')" title="Chỉnh sửa rồi phục hồi">✏️ Sửa & Phục hồi</button>
            <button class="btn btn-grn btn-sm" onclick="restoreFromTrash('${item.id}')" title="Phục hồi lớp này">🔄 Phục hồi</button>
            <button class="btn btn-r btn-sm" onclick="permDeleteOne('${item.id}')" title="Xoá vĩnh viễn">🗑</button>
        </div>
    `).join('');
}

function restoreFromTrash(id) {
    const idx = (D.trash||[]).findIndex(s => s.id === id);
    if (idx === -1) return;
    const item = { ...D.trash[idx] };
    const sessions = item.trashedSessions || [];
    delete item.trashedAt; delete item.trashType; delete item.trashedSessions;
    item.active = true; delete item.endDate;
    D.schedules.push(item);
    sessions.forEach(s => { if (!D.sessions.find(x => x.id === s.id)) D.sessions.push(s); });
    D.trash.splice(idx, 1);
    save();
    renderTrashList();
    alert(`✅ Đã phục hồi lớp "${item.name}"!`);
}

function editTrashItem(id) {
    closeModal('modal-trash');
    restoreFromTrash(id);
    setTimeout(() => openScheduleModal(id), 150);
}

function permDeleteOne(id) {
    if (!confirm('Xoá vĩnh viễn lớp này khỏi thùng rác? Không thể hoàn tác!')) return;
    D.trash = (D.trash||[]).filter(s => s.id !== id);
    save();
    renderTrashList();
}

function permDeleteAllTrash() {
    if (!D.trash || D.trash.length === 0) return alert('Thùng rác đã trống!');
    if (!confirm(`Xoá vĩnh viễn TẤT CẢ ${D.trash.length} mục trong thùng rác?\nHành động này KHÔNG THỂ HOÀN TÁC!`)) return;
    D.trash = [];
    save();
    renderTrashList();
}

// ===== INIT =====
document.getElementById('dash-month').value = thisMonth();
document.getElementById('sess-month').value = thisMonth();
document.getElementById('stu-tab-new-date').value = todayStr();
document.getElementById('count-drop-date').value = todayStr();

autoSync(); 

window.addEventListener('load', () => {
    const lastTab = localStorage.getItem('tt_last_tab') || 'dashboard';
    const tabEl = document.querySelector(`.tab[onclick*="'${lastTab}'"]`);
    if (tabEl && lastTab !== 'dashboard') {
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
        tabEl.classList.add('active');
        document.getElementById('page-'+lastTab).classList.add('active');
        renderAll();
    } else {
        setTimeout(() => renderAll(), 50);
    }
});

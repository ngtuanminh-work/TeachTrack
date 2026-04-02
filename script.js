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

        if (parsed.schedules) {
            parsed.schedules.forEach(s => {
                if (s.weekday !== undefined && !s.weekdays) { s.weekdays = [s.weekday]; delete s.weekday; }
                if (s.weekdays && !s.timeSlots) {
                    s.timeSlots = {};
                    s.weekdays.forEach(wd => { s.timeSlots[wd] = { start: s.start || "18:00", end: s.end || "19:30" }; });
                    delete s.weekdays; delete s.start; delete s.end;
                }
                if (!s.color) s.color = COLORS[Math.floor(Math.random() * COLORS.length)];
            });
        }
        
        if (parsed.settings && parsed.settings.rates) {
            if (parsed.settings.rates.base === undefined) {
                parsed.settings.rates.base = parsed.settings.rates[1] || 85000;
                let calExtra = 0;
                if (parsed.settings.rates.extra !== undefined) {
                    calExtra = parsed.settings.rates.extra;
                } else if (parsed.settings.rates[2] && parsed.settings.rates[1]) {
                    calExtra = parsed.settings.rates[2] - parsed.settings.rates[1];
                }
                parsed.settings.rates.extra = calExtra;
            }
        } else {
            parsed.settings = { rates: { base: 85000, extra: 0 } };
        }
        
        return parsed;
    }
  } catch(e) {}
  return { settings:{rates:{base:85000, extra:0}}, schedules:[], sessions:[] };
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

function rate(n) { 
    const base = D.settings.rates.base || 85000;
    const ext = D.settings.rates.extra || 0;
    return base + (n > 1 ? (n - 1) * ext : 0);
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

function calcMoney(start,end,stu) {
  const min = (new Date('1970-01-01T'+end) - new Date('1970-01-01T'+start)) / 60000;
  return min > 0 ? rate(stu) / 60 * min : 0;
}

function getRemaining(sch) {
  if (!sch.total || sch.total <= 0) return Infinity;
  const done = D.sessions.filter(s => s.scheduleId === sch.id).length;
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

            if (sch.timeSlots && sch.timeSlots[wdStr] && !(sch.absences||[]).includes(ds)) {
                let done = D.sessions.filter(s => s.scheduleId === sch.id).length;
                if (sch.total > 0 && done >= sch.total) break;

                const tInfo = sch.timeSlots[wdStr];
                let canAdd = true;
                if (ds === currentDayStr && currentTimeStr < tInfo.end) canAdd = false;

                if (canAdd) {
                    const exists = D.sessions.find(x => x.date === ds && x.scheduleId === sch.id);
                    if (!exists) {
                        D.sessions.push({
                            id: uid(), scheduleId: sch.id, date: ds,
                            start: tInfo.start, end: tInfo.end, students: sch.students,
                            money: calcMoney(tInfo.start, tInfo.end, sch.students), note: 'Tự động ghi nhận',
                            className: sch.name, classColor: sch.color
                        });
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
  if (autoSync()) { /* Data changed silently */ }
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('page-'+name).classList.add('active');
  renderAll();
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

// ===== TAB ĐIỂM DANH (CẢ CÓ TÊN & KHÔNG TÊN) =====
function renderStudentTab() {
    const sid = document.getElementById('stu-class-select').value;
    const listEl = document.getElementById('stu-tab-list');
    const nameLabel = document.getElementById('stu-tab-new-name-label');
    const nameInput = document.getElementById('stu-tab-new-name');
    
    if (!sid) {
        listEl.innerHTML = ''; 
        document.getElementById('stu-tab-count').textContent = '0'; 
        return;
    }

    const sch = schById(sid);
    if (!sch) return;

    document.getElementById('stu-tab-count').textContent = sch.students;

    let names = sch.name.split(/[-,]/).map(s => s.trim()).filter(s => s);
    const isNamedClass = (names.length > 1) || (names.length === 1 && sch.students === 1);

    if (isNamedClass) {
        nameLabel.textContent = "Tên học sinh mới";
        nameInput.type = "text";
        nameInput.value = "";
        nameInput.placeholder = "VD: Tuấn Kiệt";
        
        listEl.innerHTML = names.map(n => `
            <div class="cls-item" style="padding: 10px 0; border-bottom: 1px dashed var(--border)">
                <div class="cls-name" style="font-size:14px">${n}</div>
                <div style="display:flex; gap:5px">
                    <button class="btn btn-g btn-sm" onclick="tabAbsentOnce('${sch.id}', '${n}')">Nghỉ 1 bữa</button>
                    <button class="btn btn-r btn-sm" onclick="tabDropOut('${sch.id}', '${n}')">Nghỉ luôn</button>
                </div>
            </div>
        `).join('');
    } else {
        nameLabel.textContent = "Số lượng học sinh thêm";
        nameInput.type = "number";
        nameInput.min = "1";
        nameInput.value = "1";
        nameInput.placeholder = "VD: 2";
        
        listEl.innerHTML = `
            <div style="padding:10px; background:var(--surface2); border-radius:var(--rs); margin-bottom:10px; border:1px solid var(--border)">
                <strong style="display:block; margin-bottom:8px; font-size:12px; color:var(--accent)">1. Khai báo nghỉ 1 bữa (Vắng mặt)</strong>
                <div class="row">
                    <div class="fg"><label>Ngày vắng</label><input type="date" id="count-absent-date" value="${todayStr()}"></div>
                    <div class="fg"><label>Số HS vắng</label><input type="number" id="count-absent-num" min="1" max="${sch.students}" value="1"></div>
                    <div class="fg" style="flex:0; justify-content:flex-end"><button class="btn btn-g" onclick="tabAbsentCount('${sch.id}')">Ghi nhận</button></div>
                </div>
            </div>
            
            <div style="padding:10px; background:var(--surface2); border-radius:var(--rs); border:1px solid var(--border)">
                <strong style="display:block; margin-bottom:8px; font-size:12px; color:var(--red)">2. Khai báo nghỉ luôn (Giảm sĩ số)</strong>
                <div class="row">
                    <div class="fg"><label>Từ ngày</label><input type="date" id="count-drop-date" value="${todayStr()}"></div>
                    <div class="fg"><label>Số HS nghỉ</label><input type="number" id="count-drop-num" min="1" max="${sch.students}" value="1"></div>
                    <div class="fg" style="flex:0; justify-content:flex-end"><button class="btn btn-r" onclick="tabDropOutCount('${sch.id}')">Giảm</button></div>
                </div>
            </div>
        `;
    }
}

function tabAbsentOnce(sid, studentName) {
    const dateInput = prompt(`Nhập ngày "${studentName}" XIN NGHỈ 1 BỮA (YYYY-MM-DD):`, todayStr());
    if (!dateInput) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return alert('Sai định dạng ngày!');

    const sch = schById(sid);
    if (!sch) return;

    let sess = D.sessions.find(s => s.scheduleId === sid && s.date === dateInput);

    if (sess) {
        if (sess.students <= 1) return alert('Buổi này chỉ còn 1 HS, nếu nghỉ hãy dùng chức năng Báo nghỉ nguyên lớp ở tab Báo nghỉ!');
        sess.students -= 1;
        sess.money = calcMoney(sess.start, sess.end, sess.students);
        sess.note = sess.note ? `${sess.note}, ${studentName} nghỉ` : `${studentName} nghỉ`;
        save();
        alert(`Đã trừ tiền 1 HS và ghi chú vào buổi học ngày ${fmtDate(dateInput)}.`);
    } else {
        let wdStr = String(new Date(dateInput).getDay());
        if (!sch.timeSlots || !sch.timeSlots[wdStr]) return alert(`Ngày ${fmtDate(dateInput)} lớp này không có lịch học cố định!`);
        if (sch.students <= 1) return alert('Lớp chỉ có 1 HS, hãy báo nghỉ cả lớp ở tab Báo Nghỉ!');
        
        let tInfo = sch.timeSlots[wdStr];
        D.sessions.push({
            id: uid(), scheduleId: sch.id, date: dateInput,
            start: tInfo.start, end: tInfo.end, students: sch.students - 1,
            money: calcMoney(tInfo.start, tInfo.end, sch.students - 1),
            note: `${studentName} nghỉ`,
            className: sch.name, classColor: sch.color
        });
        save();
        alert(`Đã tạo trước biên lai ngày ${fmtDate(dateInput)} với sĩ số đã trừ: ${sch.students - 1} HS!`);
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
            s.money = calcMoney(s.start, s.end, s.students);
            s.note = s.note ? s.note + ` (${studentName} nghỉ luôn)` : `${studentName} nghỉ luôn`;
            updatedCount++;
        }
    });

    save();
    renderStudentTab();
    alert(`Đã xoá ${studentName} khỏi lớp từ ngày ${fmtDate(dropDate)}.\nĐã tự động cập nhật lại lương cho ${updatedCount} buổi học hiện có.`);
}

function tabAbsentCount(sid) {
    const dateInput = document.getElementById('count-absent-date').value;
    const absentNum = parseInt(document.getElementById('count-absent-num').value);
    
    if(!dateInput || !absentNum || absentNum < 1) return alert('Vui lòng nhập đầy đủ ngày và số lượng vắng hợp lệ!');
    
    const sch = schById(sid);
    if(!sch) return;
    if(absentNum >= sch.students) return alert('Số vắng mặt không thể lớn hơn hoặc bằng tổng sĩ số!\n(Nếu nghỉ cả lớp, vui lòng dùng chức năng Báo Nghỉ)');

    let sess = D.sessions.find(s => s.scheduleId === sid && s.date === dateInput);
    if (sess) {
        sess.students = Math.max(1, sess.students - absentNum);
        sess.money = calcMoney(sess.start, sess.end, sess.students);
        sess.note = sess.note ? `${sess.note}, vắng ${absentNum}` : `Vắng ${absentNum}`;
        save();
        alert(`Thành công! Đã trừ tiền ${absentNum} HS cho ngày ${fmtDate(dateInput)}.`);
    } else {
        let wdStr = String(new Date(dateInput).getDay());
        if (!sch.timeSlots || !sch.timeSlots[wdStr]) return alert(`Ngày ${fmtDate(dateInput)} lớp này không có lịch học cố định!`);
        
        let tInfo = sch.timeSlots[wdStr];
        D.sessions.push({
            id: uid(), scheduleId: sch.id, date: dateInput,
            start: tInfo.start, end: tInfo.end, students: sch.students - absentNum,
            money: calcMoney(tInfo.start, tInfo.end, sch.students - absentNum),
            note: `Vắng ${absentNum}`,
            className: sch.name, classColor: sch.color
        });
        save();
        alert(`Đã tạo trước biên lai ngày ${fmtDate(dateInput)} với sĩ số đã trừ: ${sch.students - absentNum} HS!`);
    }
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
            s.money = calcMoney(s.start, s.end, s.students);
            s.note = s.note ? s.note + ` (Nghỉ hẳn ${dropNum} HS)` : `Nghỉ hẳn ${dropNum} HS`;
            updatedCount++;
        }
    });

    save();
    renderStudentTab();
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

    const pastSessions = D.sessions.filter(s => s.scheduleId === sid && s.date < dateStr).length;
    const buoiSo = pastSessions + 1;

    if (isNamedClass) {
        const newName = document.getElementById('stu-tab-new-name').value.trim();
        if (!newName) return alert('Vui lòng nhập tên Học sinh!');

        if (confirm(`Học sinh "${newName}" sẽ bắt đầu học từ buổi thứ ${buoiSo} của lớp này.\nXác nhận thêm?`)) {
            if (sch.name) sch.name += ' - ' + newName;
            else sch.name = newName;
            sch.students += 1;

            let updatedCount = 0;
            D.sessions.forEach(s => {
                if (s.scheduleId === sid && s.date >= dateStr) {
                    s.className = sch.name;
                    s.students += 1;
                    s.money = calcMoney(s.start, s.end, s.students);
                    s.note = s.note ? s.note + ` (Thêm ${newName})` : `Thêm ${newName}`;
                    updatedCount++;
                }
            });

            document.getElementById('stu-tab-new-name').value = '';
            save();
            renderStudentTab();
            alert(`Thành công! Đã thêm ${newName} vào lớp.\nĐã tự động cập nhật lương cho ${updatedCount} buổi học có sẵn từ ngày ${fmtDate(dateStr)}.`);
        }
    } else {
        const addNum = parseInt(document.getElementById('stu-tab-new-name').value);
        if (!addNum || addNum < 1) return alert('Vui lòng nhập số lượng thêm hợp lệ!');

        if (confirm(`Sẽ thêm ${addNum} HS mới bắt đầu từ buổi thứ ${buoiSo} của lớp này.\nXác nhận thêm?`)) {
            sch.students += addNum;

            let updatedCount = 0;
            D.sessions.forEach(s => {
                if (s.scheduleId === sid && s.date >= dateStr) {
                    s.students += addNum;
                    s.money = calcMoney(s.start, s.end, s.students);
                    s.note = s.note ? s.note + ` (Thêm ${addNum} HS)` : `Thêm ${addNum} HS`;
                    updatedCount++;
                }
            });

            document.getElementById('stu-tab-new-name').value = '1';
            save();
            renderStudentTab();
            alert(`Thành công! Sĩ số hiện tại là ${sch.students}.\nĐã tự động cập nhật lương cho ${updatedCount} buổi học có sẵn từ ngày ${fmtDate(dateStr)}.`);
        }
    }
}

// ===== SCHEDULE/CLASS MODAL =====
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
    obj.color = COLORS[D.schedules.length % COLORS.length];
    D.schedules.push({id:uid(), absences: [], active: true, ...obj});
  }
  closeModal('modal-sched');
  autoSync(); 
  save();
}

function delSchedule(id) {
  if (!confirm('CẢNH BÁO: Bạn đang chọn XOÁ HẲN lớp này.\nBạn có chắc chắn muốn xoá vĩnh viễn khỏi danh sách không?')) return;
  D.schedules = D.schedules.filter(s=>s.id!==id);
  save();
}

function markCompletedSchedules() {
  const completed = D.schedules.filter(s => s.active !== false && getRemaining(s) === 0 && s.total > 0);
  if (completed.length === 0) return alert('Bảng lớp đang gọn gàng, không có lớp nào đã đạt đủ số buổi cần đóng sổ!');
  
  if (confirm(`Tìm thấy ${completed.length} lớp ĐÃ HOÀN THÀNH đủ số buổi yêu cầu.\nBạn có muốn tự động chuyển chúng sang trạng thái "Đã kết thúc" (Đóng sổ) không?`)) {
    completed.forEach(s => { s.active = false; s.endDate = todayStr(); });
    save();
    alert(`Đã đóng sổ thành công ${completed.length} lớp!`);
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
  if (students < 1) return alert('Số học sinh tối thiểu là 1!');

  const c = schById(scheduleId);
  
  if (id) {
      const idx = D.sessions.findIndex(s => s.id === id);
      if (idx > -1) {
          D.sessions[idx] = {
              ...D.sessions[idx],
              scheduleId, date, start, end, students, note,
              money: calcMoney(start, end, students),
              className: c ? c.name : 'Không rõ', 
              classColor: c ? c.color : '#888'
          };
      }
  } else {
      D.sessions.push({
          id:uid(), scheduleId, date, start, end, students, money:calcMoney(start,end,students), note,
          className: c ? c.name : 'Không rõ', classColor: c ? c.color : '#888'
      });
  }
  
  closeModal('modal-sess');
  save();
}

function delSession(id) {
  if (!confirm('Xoá biên lai buổi dạy này? Mọi thống kê lương của buổi này sẽ bị xoá bỏ.')) return;
  D.sessions = D.sessions.filter(s=>s.id!==id);
  save();
}

// ===== ABSENCES (Nghỉ theo lớp) =====
function addAbsence() {
  const sid = document.getElementById('abs-class').value;
  const date = document.getElementById('abs-date').value;
  if (!sid || !date) return alert('Vui lòng chọn lớp và ngày nghỉ!');
  
  const sch = schById(sid);
  if(sch) {
      if(!sch.absences) sch.absences = [];
      if(!sch.absences.includes(date)) {
          sch.absences.push(date);
          const autoSession = D.sessions.find(s => s.scheduleId === sid && s.date === date && s.note === 'Tự động ghi nhận');
          if (autoSession) {
              D.sessions = D.sessions.filter(s => s.id !== autoSession.id);
              alert('Đã báo nghỉ thành công! Hệ thống đã tự động xoá biên lai tiền lương của ngày hôm đó.');
          } else {
              alert('Đã thêm ngày báo nghỉ cho lớp!');
          }
          save();
      } else {
          alert('Ngày này đã được báo nghỉ cho lớp này rồi!');
      }
  }
}

function removeAbsence(sid, date) {
  const sch = schById(sid);
  if (sch && sch.absences) {
      sch.absences = sch.absences.filter(d => d !== date);
      autoSync(); 
      save();
  }
}

// ===== SETTINGS & EXPORT =====
function saveRates() {
  D.settings.rates.base = +document.getElementById('rateBase').value||85000;
  D.settings.rates.extra = +document.getElementById('rateExtra').value||0;
  save();
  showRatePreview();
  alert('✅ Đã lưu mức lương!');
}

function showRatePreview() {
  const base=D.settings.rates.base||85000, ext=D.settings.rates.extra||0;
  document.getElementById('rate-preview').innerHTML =
    `Ví dụ 90 phút: 1HS = <strong>${fmt(base/60*90)}</strong> | 2HS = <strong>${fmt((base+ext)/60*90)}</strong> | 3HS = <strong>${fmt((base+ext*2)/60*90)}</strong>`;
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(D,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `teachtrack_backup_${todayStr()}.json`;
  a.click();
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const imp = JSON.parse(r.result);
      if (!imp.schedules) throw 0;
      D = imp;
      save();
      document.getElementById('backup-info').innerHTML = '<span style="color:var(--green)">✅ Khôi phục thành công! Tải lại trang để cập nhật.</span>';
    } catch { alert('File backup không hợp lệ hoặc cũ quá!'); }
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
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (el) charts[id] = new Chart(el, cfg);
}

const chartDefaults = {
  scales: {
    y: { grid:{color:'rgba(48,54,61,.8)'}, ticks:{color:'#7d8590', callback: v => (v/1000).toLocaleString('vi-VN') + 'k'} },
    x: { grid:{display:false}, ticks:{color:'#7d8590'} }
  },
  plugins: { 
      legend:{display:false},
      tooltip: { callbacks: { label: function(context) { return context.raw.toLocaleString('vi-VN') + ' đ'; } } }
  },
  responsive: true
};

function renderAll() {
  fillClassSelect('stu-class-select');
  renderDashboard();
  renderSchedules();
  renderSessions();
  renderStudentTab();
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
    options:{...chartDefaults}
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
    options:{...chartDefaults}
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
  
  const sortedSchedules = [...D.schedules].sort((a,b) => (b.active===false ? 1 : 0) - (a.active===false ? 1 : 0));
  
  tbody.innerHTML = sortedSchedules.map(sch => {
    const rem = getRemaining(sch);
    const total = sch.total||0;
    const done = D.sessions.filter(s=>s.scheduleId===sch.id).length;
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

    const absTags = (sch.absences||[]).sort().map(d => `<span class="absence-tag" title="Lớp nghỉ ngày này">${d.slice(8,10)}/${d.slice(5,7)}</span>`).join('');
    
    const nameStyle = sch.active === false ? 'color: var(--muted); text-decoration: line-through;' : '';
    const statusBadge = sch.active === false ? `<span class="badge" style="background:var(--surface2); color:var(--muted); border: 1px solid var(--border)">Đã KT</span>` : '';

    return `<tr class="${ending?'ending-soon':''} ${sch.active===false?'archived-row':''}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
            <div class="dot" style="background:${sch.color||'#888'}"></div><strong style="${nameStyle}">${sch.name}</strong> ${statusBadge}
        </div>
        <div style="font-size:11px; color:var(--muted); margin-top:4px">Khai giảng: ${fmtDate(sch.startDate)}</div>
        ${absTags ? `<div style="margin-top:2px">${absTags}</div>` : ''}
      </td>
      <td style="font-variant-numeric:tabular-nums;">${timeInfoHTML}</td>
      <td><span class="badge by">${sch.students} HS</span></td>
      <td>${total>0
        ? `<span class="badge ${rem<=3?'br':rem<=7?'by':'bg'}">Còn ${rem}/${total}</span>`
        : '<span class="badge">∞</span>'}</td>
      <td style="font-size:12px;color:var(--muted)">${sch.active===false ? 'Đã xong' : (pred?fmtDate(pred):'—')}</td>
      <td style="min-width:90px">${total>0
        ? `<div class="pbar"><div class="pfill ${fillCls}" style="width:${pct}%"></div></div>
           <div style="font-size:10px;color:var(--muted);margin-top:3px">${done}/${total} buổi</div>`
        : (sch.active === false ? '<span style="font-size:10px;color:var(--muted)">Đã chốt sổ</span>' : '—')}</td>
      <td><div style="display:flex;gap:4px">
        ${sch.active !== false 
            ? `<button class="btn btn-g btn-sm" onclick="openScheduleModal('${sch.id}')" title="Sửa">✏️</button>` 
            : ``}
        ${sch.active !== false 
            ? `<button class="btn btn-r btn-sm" onclick="finishSchedule('${sch.id}')" title="Kết thúc / Dừng dạy">🛑</button>`
            : `<button class="btn btn-r btn-sm" onclick="delSchedule('${sch.id}')" title="Xoá vĩnh viễn (Mất lịch sử lớp)">🗑</button>`}
      </div></td>
    </tr>`;
  }).join('');
}

function renderSessions() {
  fillClassSelect('sess-class');
  const month = document.getElementById('sess-month').value;
  const clsF = document.getElementById('sess-class').value;

  const ss = D.sessions.filter(s => {
    if (month && !s.date.startsWith(month)) return false;
    if (clsF && s.scheduleId !== clsF) return false;
    return true;
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.start.localeCompare(a.start));

  const tbody = document.getElementById('sess-list');
  if (!ss.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty">Bạn chưa dạy buổi nào! Hệ thống sẽ tự động thêm khi qua giờ dạy.</div></td></tr>';
    document.getElementById('sess-summary').style.display = 'none';
    return;
  }

  tbody.innerHTML = ss.map(s => {
    const min = (new Date('1970-01-01T'+s.end)-new Date('1970-01-01T'+s.start))/60000;
    return `<tr>
      <td style="font-variant-numeric:tabular-nums">${fmtDate(s.date)}</td>
      <td><div style="display:flex;align-items:center;gap:7px">
        <div class="dot" style="background:${s.classColor||'#888'}"></div><strong>${s.className||'?'}</strong>
      </div></td>
      <td style="font-size:12px;color:var(--muted)">${s.start}–${s.end}</td>
      <td><span class="badge bb">${s.students} HS</span></td>
      <td style="color:var(--muted);font-size:12px">${min}p</td>
      <td class="money">${fmt(s.money)}</td>
      <td style="font-size:12px;color:var(--muted);max-width:140px">${s.note||''}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-g btn-sm" onclick="openSessionModal('${s.id}')" title="Sửa thông tin">✏️</button>
        <button class="btn btn-r btn-sm" onclick="delSession('${s.id}')" title="Xoá">🗑</button>
      </div></td>
    </tr>`;
  }).join('');

  const totalMoney = ss.reduce((a,s)=>a+s.money,0);
  const totalMin = ss.reduce((a,s)=>a+(new Date('1970-01-01T'+s.end)-new Date('1970-01-01T'+s.start))/60000,0);
  const summary = document.getElementById('sess-summary');
  summary.style.display = 'block';
  summary.innerHTML = `<div style="display:flex;gap:28px;flex-wrap:wrap;align-items:center; padding:15px">
    <div><div class="cls-sub">Tổng buổi</div><strong style="font-size:16px">${ss.length}</strong></div>
    <div><div class="cls-sub">Tổng thời gian</div><strong style="font-size:16px">${(totalMin/60).toFixed(1)}h</strong></div>
    <div><div class="cls-sub">Tổng thu nhập</div><strong class="money" style="font-size:20px">${fmt(totalMoney)}</strong></div>
  </div>`;
}

function renderAbsences() {
  fillClassSelect('abs-class');
  const el = document.getElementById('abs-list');
  
  let hasAbs = false;
  let html = '';
  
  D.schedules.forEach(sch => {
      if(sch.absences && sch.absences.length > 0) {
          hasAbs = true;
          let tags = sch.absences.sort().map(d => 
              `<div class="tag" style="display:inline-flex; align-items:center; gap:5px; background:var(--surface2); border:1px solid var(--border); padding:5px 10px; border-radius:20px; font-size:12px; margin: 4px 4px 0 0;">
                📅 ${fmtDate(d)} 
                <span style="color:var(--red); cursor:pointer; font-weight:bold; padding-left:4px;" onclick="removeAbsence('${sch.id}', '${d}')">×</span>
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
  
  if(!hasAbs) { el.innerHTML = '<div class="empty">Hiện tại không có lớp nào xin nghỉ nguyên lớp.</div>'; } 
  else { el.innerHTML = html; }
}

function renderSettings() {
  document.getElementById('rateBase').value = D.settings.rates.base||85000;
  document.getElementById('rateExtra').value = D.settings.rates.extra !== undefined ? D.settings.rates.extra : 5000;
  showRatePreview();
}

// ===== INIT =====
document.getElementById('dash-month').value = thisMonth();
document.getElementById('sess-month').value = thisMonth();
document.getElementById('stu-tab-new-date').value = todayStr();
autoSync(); 
renderAll();
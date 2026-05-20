import React, { useState, useEffect } from 'react';
import { Users, Calendar as CalendarIcon, Settings, CheckCircle, Clock, AlertTriangle, X, Save, Trash2, Edit3, Layers, Plus } from 'lucide-react';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

export default function App() {
  const [activeTab, setActiveTab] = useState('input');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedDateForAbsence, setSelectedDateForAbsence] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newClassTime, setNewClassTime] = useState('15:00');
  const [newStudentClassId, setNewStudentClassId] = useState(''); // 신규 학생의 반 배정

  // 🔥 새로운 UI 관리 상태 추가
  const [isHolidayEditMode, setIsHolidayEditMode] = useState(false); // 휴강 편집 모드 여부
  const [editingStudentId, setEditingStudentId] = useState(null); // 현재 정규시간 수정 중인 학생 ID
  const [editingClassTime, setEditingClassTime] = useState(''); // 수정 중인 시간 임시 저장
  const [editingStudentClassId, setEditingStudentClassId] = useState(''); // 수정 중인 반 배정 임시 저장

  // 🔥 출결 기록 액션 모달 상태 (수정/삭제 선택)
  const [recordActionTarget, setRecordActionTarget] = useState(null);

  // 🔥 반 필터 (출결입력 / 달력조회 공통)
  const [filterClassId, setFilterClassId] = useState('all'); // 'all' | classId | 'none'

  // 🔥 반 관리 UI 상태
  const [newClassName, setNewClassName] = useState('');

  // 1. 학생 목록 로드 (가나다순)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      studentList.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
      setStudents(studentList);
    });
    return () => unsubscribe();
  }, []);

  // 2. 출결 기록 로드
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      const attendanceList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendance(attendanceList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 3. 전체 휴강 일정 로드
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'holidays'), (snapshot) => {
      const holidayList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(holidayList);
    });
    return () => unsubscribe();
  }, []);

  // 4. 반 목록 로드 (이름순)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'classes'), (snapshot) => {
      const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      classList.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
      setClasses(classList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (students.length > 0 && !selectedStudent) {
      setSelectedStudent(students[0].id);
    }
  }, [students, selectedStudent]);

  const calculateLateMinutes = (classTime, actualTime) => {
    const [classH, classM] = classTime.split(':').map(Number);
    const [actualH, actualM] = actualTime.split(':').map(Number);
    const classTotal = classH * 60 + classM;
    const actualTotal = actualH * 60 + actualM;
    return actualTotal > classTotal ? actualTotal - classTotal : 0;
  };

  // 반 필터 적용된 학생 리스트
  const filteredStudents = students.filter(s => {
    if (filterClassId === 'all') return true;
    if (filterClassId === 'none') return !s.classId;
    return s.classId === filterClassId;
  });

  const getClassName = (classId) => {
    if (!classId) return null;
    const cls = classes.find(c => c.id === classId);
    return cls ? cls.name : null;
  };

  // 출결 입력 탭 핸들러 (등원 등록/취소)
  const handleTapAttendance = async (student) => {
    const now = new Date();
    const dateStr = format(now, 'yyyy-MM-dd');
    const timeStr = format(now, 'HH:mm');

    const isTodayHoliday = holidays.some(h => h.date === dateStr);
    if (isTodayHoliday) {
      alert('오늘은 공식 휴강일이므로 출결을 등록할 수 없습니다.');
      return;
    }

    const alreadyAttended = attendance.find(a => a.studentId === student.id && a.date === dateStr);

    if (alreadyAttended) {
      if (window.confirm(`${student.name} 학생의 오늘 출결 기록을 취소(삭제)하시겠습니까?`)) {
        try {
          await deleteDoc(doc(db, 'attendance', alreadyAttended.id));
        } catch (error) { alert(error.message); }
      }
      return;
    }

    const lateMinutes = calculateLateMinutes(student.classTime, timeStr);
    try {
      await addDoc(collection(db, 'attendance'), {
        studentId: student.id,
        date: dateStr,
        time: timeStr,
        lateMinutes: Number(lateMinutes),
        status: 'present'
      });
    } catch (error) { alert(error.message); }
  };

  // 등원 시간 수정 (모달에서 호출)
  const handleEditTimePrompt = async (record) => {
    const newTime = window.prompt('수정할 등원 시각을 입력하세요 (예: 15:30)', record.time);
    if (newTime === null) return;

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(newTime)) {
      alert('시간 형식이 올바르지 않습니다. (예: 15:30)');
      return;
    }

    const student = students.find(s => s.id === record.studentId);
    if (!student) return;

    const newLateMinutes = calculateLateMinutes(student.classTime, newTime);
    try {
      await updateDoc(doc(db, 'attendance', record.id), {
        time: newTime,
        lateMinutes: Number(newLateMinutes),
        status: 'present'
      });
    } catch (error) { alert(error.message); }
  };

  // 🔥 기능 1: 출결 기록 삭제
  const handleDeleteRecord = async (record) => {
    if (!record) return;
    if (!window.confirm('이 출결 기록을 정말 삭제하시겠습니까?\n(삭제 후에는 빈 칸으로 되돌아갑니다.)')) return;
    try {
      await deleteDoc(doc(db, 'attendance', record.id));
      setRecordActionTarget(null);
    } catch (error) { alert(error.message); }
  };

  // 🔥 인라인 드롭다운으로 변경되었으므로 파이어베이스에 직접 저장하는 전용 함수
  const handleSaveStudentInline = async (studentId) => {
    try {
      await updateDoc(doc(db, 'students', studentId), {
        classTime: editingClassTime,
        classId: editingStudentClassId || null
      });
      setEditingStudentId(null);
    } catch (error) {
      alert('학생 정보 수정 실패: ' + error.message);
    }
  };

  // 🔥 기능 2 통합형 달력 칸 클릭 핸들러 (휴강 편집 모드 대응)
  const handleDayClick = async (dateStr, record) => {
    // [경우 A] 공통 휴강 편집 모드일 때 탭 작동 방식
    if (isHolidayEditMode) {
      const existingHoliday = holidays.find(h => h.date === dateStr);
      if (existingHoliday) {
        await deleteDoc(doc(db, 'holidays', existingHoliday.id));
      } else {
        await addDoc(collection(db, 'holidays'), { date: dateStr });
      }
      return;
    }

    // [경우 B] 일반 모드일 때 결석/수정 작동 방식
    if (holidays.some(h => h.date === dateStr)) return; // 휴강일은 터치 무시

    // 🔥 기록된 출석(present)을 터치하면 액션 모달(수정/삭제) 열기
    if (record && record.status !== 'absent') {
      setRecordActionTarget(record);
      return;
    }

    if (record && record.status === 'absent') {
      try {
        await deleteDoc(doc(db, 'attendance', record.id));
        setSelectedDateForAbsence('');
      } catch (error) { alert(error.message); }
    } else if (selectedDateForAbsence === dateStr) {
      try {
        await addDoc(collection(db, 'attendance'), {
          studentId: selectedStudent,
          date: dateStr,
          status: 'absent'
        });
        setSelectedDateForAbsence('');
      } catch (error) { alert(error.message); }
    } else {
      setSelectedDateForAbsence(dateStr);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName) return;
    try {
      await addDoc(collection(db, 'students'), {
        name: newStudentName,
        classTime: newClassTime,
        classId: newStudentClassId || null
      });
      setNewStudentName('');
      setNewStudentClassId('');
    } catch (error) { alert(error.message); }
  };

  const handleDeleteStudent = async (id) => {
    if (window.confirm('원생 정보와 모든 기록이 삭제됩니다. 계속하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'students', id));
        const related = attendance.filter(a => a.studentId === id);
        for (const r of related) { await deleteDoc(doc(db, 'attendance', r.id)); }
      } catch (error) { alert(error.message); }
    }
  };

  // 🔥 반 관리
  const handleAddClass = async (e) => {
    e.preventDefault();
    const name = newClassName.trim();
    if (!name) return;
    if (classes.some(c => c.name === name)) {
      alert('이미 같은 이름의 반이 있습니다.');
      return;
    }
    try {
      await addDoc(collection(db, 'classes'), { name });
      setNewClassName('');
    } catch (error) { alert(error.message); }
  };

  const handleDeleteClass = async (classId) => {
    const memberCount = students.filter(s => s.classId === classId).length;
    const msg = memberCount > 0
      ? `이 반에 ${memberCount}명의 학생이 배정되어 있습니다.\n반을 삭제하면 학생들은 '미배정' 상태가 됩니다. 계속하시겠습니까?`
      : '이 반을 삭제하시겠습니까?';
    if (!window.confirm(msg)) return;
    try {
      // 소속 학생들의 classId 제거
      for (const s of students.filter(s => s.classId === classId)) {
        await updateDoc(doc(db, 'students', s.id), { classId: null });
      }
      await deleteDoc(doc(db, 'classes', classId));
      if (filterClassId === classId) setFilterClassId('all');
    } catch (error) { alert(error.message); }
  };

  // 달력 내부 렌더링
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getDay(startOfMonth(currentDate));

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-20 border border-gray-100 bg-gray-50/50"></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = format(new Date(year, month, d), 'yyyy-MM-dd');
      const record = attendance.find(a => a.studentId === selectedStudent && a.date === dateStr);
      const isHoliday = holidays.some(h => h.date === dateStr);
      const isAbsenceSelected = selectedDateForAbsence === dateStr;

      days.push(
        <div
          key={d}
          onClick={() => handleDayClick(dateStr, record)}
          className={`h-20 border border-gray-100 p-1 flex flex-col items-center justify-start relative transition-all duration-100 cursor-pointer
            ${isHolidayEditMode ? 'hover:bg-amber-100 active:bg-amber-200' : ''}
            ${isHoliday ? 'bg-amber-50/70' : 'bg-white'}
            ${!isHolidayEditMode && isAbsenceSelected ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/50' : ''}`}
        >
          <span className={`text-xs font-medium mb-1 ${isHoliday ? 'text-amber-700 font-bold' : 'text-gray-600'}`}>{d}</span>

          {isHoliday && (
            <div className="w-full bg-amber-500 text-white text-[11px] font-bold text-center py-1.5 rounded shadow-sm mt-1">
              휴강
            </div>
          )}

          {!isHoliday && !isHolidayEditMode && isAbsenceSelected && !record && (
            <div className="text-[10px] text-blue-600 font-bold bg-blue-100 px-1 py-0.5 rounded animate-pulse mt-2">
              선택됨
            </div>
          )}

          {!isHoliday && record && (
            record.status === 'absent' ? (
              <div className="w-full bg-rose-500 text-white text-[11px] font-bold text-center py-1.5 rounded shadow-sm mt-1">
                결석
              </div>
            ) : (
              <div className={`w-full flex flex-col items-center justify-center rounded py-0.5 ${record.lateMinutes > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <span className={`text-sm font-bold ${record.lateMinutes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {record.time}
                </span>
                {record.lateMinutes > 0 && (
                  <span className="text-[9px] text-red-500 font-bold">+{record.lateMinutes}분 지각</span>
                )}
              </div>
            )
          )}
        </div>
      );
    }
    return days;
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const selectedStudentObj = students.find(s => s.id === selectedStudent);

  // 반 필터 컴포넌트 (출결입력 / 달력조회에서 공용)
  const ClassFilterBar = () => (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
      <button
        onClick={() => setFilterClassId('all')}
        className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-all
          ${filterClassId === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
      >전체 ({students.length})</button>
      {classes.map(cls => {
        const count = students.filter(s => s.classId === cls.id).length;
        return (
          <button
            key={cls.id}
            onClick={() => setFilterClassId(cls.id)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-all
              ${filterClassId === cls.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >{cls.name} ({count})</button>
        );
      })}
      <button
        onClick={() => setFilterClassId('none')}
        className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-all
          ${filterClassId === 'none' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
      >미배정 ({students.filter(s => !s.classId).length})</button>
    </div>
  );

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-gray-50 flex flex-col shadow-xl relative overflow-hidden font-sans">

      <header className="bg-white px-5 py-4 shadow-sm z-10 flex justify-between items-center">
        <h1 className="text-base font-bold text-gray-800 tracking-tight">오늘학원(이예지) 실시간 출결시스템</h1>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
          {format(new Date(), 'MM.dd(E)')}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">

        {/* [탭 1] 출결 입력 */}
        {activeTab === 'input' && (
          <div className="p-5">
            <p className="text-sm text-gray-500 mb-3 flex items-center">
              <CheckCircle size={16} className="mr-1 text-green-500" /> 등원 시 카드 터치 (가나다순 정렬)
            </p>

            {/* 🔥 반 필터 */}
            {classes.length > 0 && <ClassFilterBar />}

            {filteredStudents.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10 bg-white rounded-xl shadow-sm">
                해당 반에 등록된 학생이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredStudents.map(student => {
                  const isAttendedToday = attendance.some(a => a.studentId === student.id && a.date === todayStr && a.status !== 'absent');
                  const isAbsentToday = attendance.some(a => a.studentId === student.id && a.date === todayStr && a.status === 'absent');
                  const isTodayHoliday = holidays.some(h => h.date === todayStr);
                  const className = getClassName(student.classId);

                  return (
                    <button
                      key={student.id}
                      onClick={() => handleTapAttendance(student)}
                      disabled={isTodayHoliday}
                      className={`border-2 shadow-sm rounded-xl p-5 flex flex-col items-center justify-center transition-all duration-150 relative
                        ${isTodayHoliday ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' :
                          isAbsentToday ? 'bg-rose-50 border-rose-300 text-rose-700' :
                          isAttendedToday ? 'bg-green-50 border-green-400 text-green-800' :
                          'bg-white border-transparent active:border-blue-500 text-gray-800'}`}
                    >
                      {className && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                          {className}
                        </span>
                      )}
                      <span className="text-xl font-bold mb-1">{student.name}</span>
                      <span className="text-xs flex items-center opacity-80">
                        <Clock size={12} className="mr-1" />
                        {isTodayHoliday ? '공식 휴강일' : isAbsentToday ? '오늘 결석' : `기준 ${student.classTime}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* [탭 2] 달력 조회 */}
        {activeTab === 'calendar' && (
          <div className="p-4">
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-col space-y-3">

              {/* 🔥 반 필터 (학생 드롭다운을 좁혀줌) */}
              {classes.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
                  <button
                    onClick={() => setFilterClassId('all')}
                    disabled={isHolidayEditMode}
                    className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold border transition-all
                      ${filterClassId === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                  >전체반</button>
                  {classes.map(cls => (
                    <button
                      key={cls.id}
                      onClick={() => setFilterClassId(cls.id)}
                      disabled={isHolidayEditMode}
                      className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold border transition-all
                        ${filterClassId === cls.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                    >{cls.name}</button>
                  ))}
                </div>
              )}

              <select
                className="w-full p-2 border border-gray-200 rounded-lg text-lg font-bold text-gray-800 focus:outline-none bg-gray-50"
                value={selectedStudent}
                disabled={isHolidayEditMode}
                onChange={(e) => { setSelectedStudent(e.target.value); setSelectedDateForAbsence(''); }}
              >
                <option value="" disabled>학생을 선택하세요</option>
                {filteredStudents.map(s => {
                  const cn = getClassName(s.classId);
                  return (
                    <option key={s.id} value={s.id}>
                      {cn ? `[${cn}] ` : ''}{s.name} 원생 출결 리포트
                    </option>
                  );
                })}
              </select>

              {/* 🔥 기능 2: 공통 휴강 등록 모드 제어 버튼 */}
              <button
                onClick={() => { setIsHolidayEditMode(!isHolidayEditMode); setSelectedDateForAbsence(''); }}
                className={`w-full font-bold py-2.5 rounded-lg text-sm shadow-sm transition-all flex items-center justify-center space-x-1
                  ${isHolidayEditMode
                    ? 'bg-amber-600 text-white ring-4 ring-amber-200 animate-pulse'
                    : 'bg-amber-500 text-white active:bg-amber-600'}`}
              >
                <AlertTriangle size={16} />
                <span>
                  {isHolidayEditMode ? '⚠️ 달력 날짜 터치 중... (종료하려면 클릭)' : `${format(currentDate, 'M월')} 전체 공통 휴강 터치로 설정`}
                </span>
              </button>
            </div>

            <div className={`bg-white rounded-xl shadow-sm overflow-hidden border transition-all
              ${isHolidayEditMode ? 'border-amber-400 ring-2 ring-amber-400' : 'border-gray-100'}`}>
              <div className={`text-white text-center py-3 font-bold text-lg flex justify-between px-4 items-center transition-colors
                ${isHolidayEditMode ? 'bg-amber-600' : 'bg-blue-600'}`}>
                <button onClick={() => { setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1))); setSelectedDateForAbsence(''); }} className="px-2 font-bold">&lt;</button>
                <span>{format(currentDate, 'yyyy년 MM월')} {isHolidayEditMode && ' [휴강 편집 모드]'}</span>
                <button onClick={() => { setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1))); setSelectedDateForAbsence(''); }} className="px-2 font-bold">&gt;</button>
              </div>
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
                {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                  <div key={day} className={`text-center py-2 text-xs font-bold ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-gray-500'}`}>
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 bg-gray-200 gap-[1px]">
                {renderCalendar()}
              </div>
            </div>

            {/* 하단 설명 동적 가이드 */}
            <div className="text-[11px] text-gray-400 mt-3 bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              {isHolidayEditMode ? (
                <p className="text-amber-700 font-semibold animate-pulse">● 현재 휴강 편집 모드 활성화 상태입니다. 달력의 날짜를 누르면 휴강이 ON/OFF 됩니다.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-500">💡 달력 활용 가이드</p>
                  <p>• <b>결석 처리:</b> 빈 날짜 터치(선택됨) ➔ 한 번 더 터치(결석 등록) ➔ 한 번 더 터치(복구)</p>
                  <p>• <b>시간 수정 / 삭제:</b> 기록된 출석 시각을 터치하면 수정/삭제 선택 창이 열립니다.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* [탭 3] 원생 관리 */}
        {activeTab === 'settings' && (
          <div className="p-5 space-y-6">

            {/* 🔥 반 관리 섹션 */}
            <div className="bg-white p-5 rounded-xl shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                <Layers size={16} className="mr-1.5 text-indigo-500" /> 반(클래스) 관리 ({classes.length}개)
              </h3>
              <form onSubmit={handleAddClass} className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  placeholder="새 반 이름 (예: 초등A반)"
                  className="flex-1 p-2.5 border border-gray-200 rounded-lg text-sm"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                />
                <button type="submit" className="bg-indigo-500 text-white font-bold px-3 py-2.5 rounded-lg text-sm shadow-sm active:bg-indigo-600 flex items-center">
                  <Plus size={16} className="mr-1" /> 추가
                </button>
              </form>
              {classes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">아직 등록된 반이 없습니다. 반을 만들면 학생을 배정할 수 있어요.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {classes.map(cls => {
                    const count = students.filter(s => s.classId === cls.id).length;
                    return (
                      <li key={cls.id} className="py-2.5 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-gray-800">{cls.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{count}명</span>
                        </div>
                        <button
                          onClick={() => handleDeleteClass(cls.id)}
                          className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-md font-semibold active:bg-red-100 flex items-center"
                        ><Trash2 size={12} className="mr-1" /> 삭제</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">신규 원생 등록</h3>
              <form onSubmit={handleAddStudent} className="space-y-3">
                <input
                  type="text" placeholder="학생 이름" required
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm"
                  value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)}
                />
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">정규 등원시각:</span>
                  <input
                    type="time" required
                    className="flex-1 p-3 border border-gray-200 rounded-lg text-sm"
                    value={newClassTime} onChange={(e) => setNewClassTime(e.target.value)}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">반 배정:</span>
                  <select
                    className="flex-1 p-3 border border-gray-200 rounded-lg text-sm bg-white"
                    value={newStudentClassId}
                    onChange={(e) => setNewStudentClassId(e.target.value)}
                  >
                    <option value="">미배정</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg text-sm shadow-sm active:bg-blue-700">원생 추가 완료</button>
              </form>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">재원생 명단 관리 ({students.length}명)</h3>
              <p className="text-xs text-gray-400 mb-3">* 학생 이름을 터치하면 기준 등원시각과 반 배정을 한 번에 수정할 수 있습니다.</p>
              <ul className="divide-y divide-gray-100">
                {students.map(student => (
                  <li key={student.id} className="py-3">

                    {editingStudentId === student.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-800 whitespace-nowrap">{student.name}</span>
                          <input
                            type="time"
                            className="p-1 border border-blue-400 rounded text-sm bg-white focus:outline-none flex-1"
                            value={editingClassTime}
                            onChange={(e) => setEditingClassTime(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 whitespace-nowrap">반:</span>
                          <select
                            className="flex-1 p-1.5 border border-blue-400 rounded text-sm bg-white focus:outline-none"
                            value={editingStudentClassId}
                            onChange={(e) => setEditingStudentClassId(e.target.value)}
                          >
                            <option value="">미배정</option>
                            {classes.map(cls => (
                              <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleSaveStudentInline(student.id)}
                            className="bg-green-500 text-white p-1.5 rounded hover:bg-green-600"
                          ><Save size={16} /></button>
                          <button
                            onClick={() => setEditingStudentId(null)}
                            className="bg-gray-400 text-white p-1.5 rounded hover:bg-gray-500"
                          ><X size={16} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div
                          onClick={() => {
                            setEditingStudentId(student.id);
                            setEditingClassTime(student.classTime);
                            setEditingStudentClassId(student.classId || '');
                          }}
                          className="cursor-pointer flex-1 py-1 hover:bg-gray-50 rounded transition-colors active:bg-gray-100"
                        >
                          <div className="flex items-center flex-wrap gap-1">
                            <span className="font-bold text-gray-800">{student.name}</span>
                            {getClassName(student.classId) && (
                              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                                {getClassName(student.classId)}
                              </span>
                            )}
                            <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              {student.classTime} ▾
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteStudent(student.id)}
                          className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-md font-semibold active:bg-red-100 ml-2 whitespace-nowrap"
                        >퇴원 조치</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* 🔥 출결 기록 액션 모달 (수정/삭제) */}
      {recordActionTarget && (
        <div
          className="absolute inset-0 bg-black/40 z-30 flex items-end justify-center"
          onClick={() => setRecordActionTarget(null)}
        >
          <div
            className="bg-white w-full rounded-t-2xl p-5 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <p className="text-xs text-gray-400 mb-1">{recordActionTarget.date} 출석 기록</p>
              <p className="text-2xl font-bold text-gray-800">
                {recordActionTarget.time}
                {recordActionTarget.lateMinutes > 0 && (
                  <span className="text-sm text-red-500 ml-2">+{recordActionTarget.lateMinutes}분 지각</span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => { handleEditTimePrompt(recordActionTarget); setRecordActionTarget(null); }}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg text-sm active:bg-blue-700 flex items-center justify-center"
              >
                <Edit3 size={16} className="mr-1.5" /> 시각 수정
              </button>
              <button
                onClick={() => handleDeleteRecord(recordActionTarget)}
                className="w-full bg-rose-500 text-white font-bold py-3 rounded-lg text-sm active:bg-rose-600 flex items-center justify-center"
              >
                <Trash2 size={16} className="mr-1.5" /> 기록 삭제
              </button>
              <button
                onClick={() => setRecordActionTarget(null)}
                className="w-full bg-gray-100 text-gray-600 font-bold py-3 rounded-lg text-sm active:bg-gray-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="bg-white border-t border-gray-200 flex justify-around items-center h-16 absolute bottom-0 w-full z-10 pb-safe">
        <button onClick={() => setActiveTab('input')} className={`flex flex-col items-center w-full h-full justify-center ${activeTab === 'input' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Users size={22} className="mb-1" />
          <span className="text-[10px] font-bold">출결입력</span>
        </button>
        <button onClick={() => setActiveTab('calendar')} className={`flex flex-col items-center w-full h-full justify-center ${activeTab === 'calendar' ? 'text-blue-600' : 'text-gray-400'}`}>
          <CalendarIcon size={22} className="mb-1" />
          <span className="text-[10px] font-bold">달력조회</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center w-full h-full justify-center ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Settings size={22} className="mb-1" />
          <span className="text-[10px] font-bold">원생관리</span>
        </button>
      </nav>

    </div>
  );
}

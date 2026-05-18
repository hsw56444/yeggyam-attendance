import React, { useState, useEffect } from 'react';
import { Users, Calendar as CalendarIcon, Settings, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

export default function App() {
  const [activeTab, setActiveTab] = useState('input');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedDateForAbsence, setSelectedDateForAbsence] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newClassTime, setNewClassTime] = useState('15:00');

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

  // 등원 시간 수정 기능 (달력 탭에서 사용)
  const handleEditTime = async (record) => {
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

  // 🔥 추가기능 : 재원생 명단에서 학생 정규 수업시각 수정 기능
  const handleEditStudentClassTime = async (student) => {
    const newTime = window.prompt(`${student.name} 학생의 변경할 정규 등원시각을 입력하세요 (예: 16:00)`, student.classTime);
    if (newTime === null) return; // 취소 누르면 중단

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(newTime)) {
      alert('시간 형식이 올바르지 않습니다. 반드시 16:00 형태로 입력해 주세요.');
      return;
    }

    try {
      // Firebase 클라우드의 학생 정규 시각 업데이트
      await updateDoc(doc(db, 'students', student.id), {
        classTime: newTime
      });
      alert(`${student.name} 학생의 기준 시각이 ${newTime}으로 변경되었습니다.`);
    } catch (error) {
      alert('기준 시각 수정 실패: ' + error.message);
    }
  };

  // 달력 날짜 클릭 시 3단계 사이클 (선택 -> 결석 -> 복구)
  const handleDayClick = async (dateStr, record) => {
    if (holidays.some(h => h.date === dateStr)) return;

    if (record && record.status !== 'absent') {
      handleEditTime(record);
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

  // 공통 휴강 등록 기능 (토글 방식)
  const handleRegisterHoliday = async () => {
    const currentMonthStr = format(currentDate, 'yyyy년 MM월');
    const dayInput = window.prompt(`${currentMonthStr}에 적용할 휴강 날짜(일)를 숫자만 입력하세요. (예: 25)\n이미 등록된 날짜를 입력하면 휴강이 취소됩니다.`);
    if (!dayInput) return;

    const dayNum = parseInt(dayInput, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      alert('올바른 날짜를 입력해 주세요.');
      return;
    }

    const targetDateStr = format(new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum), 'yyyy-MM-dd');
    const existingHoliday = holidays.find(h => h.date === targetDateStr);

    if (existingHoliday) {
      if (window.confirm(`${dayNum}일의 공통 휴강을 취소하고 정상 수업일로 복구하시겠습니까?`)) {
        await deleteDoc(doc(db, 'holidays', existingHoliday.id));
      }
    } else {
      await addDoc(collection(db, 'holidays'), { date: targetDateStr });
      alert(`${dayNum}일이 공통 휴강일로 등록되었습니다.`);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName) return;
    try {
      await addDoc(collection(db, 'students'), { name: newStudentName, classTime: newClassTime });
      setNewStudentName('');
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

  // 달력 그리기
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
      const isSelected = selectedDateForAbsence === dateStr;
      
      days.push(
        <div 
          key={d} 
          onClick={() => handleDayClick(dateStr, record)}
          className={`h-20 border border-gray-100 p-1 flex flex-col items-center justify-start relative transition-all duration-100
            ${isHoliday ? 'bg-amber-50/70' : 'bg-white'} 
            ${isSelected ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/50' : ''}`}
        >
          <span className={`text-xs font-medium mb-1 ${isHoliday ? 'text-amber-700' : 'text-gray-600'}`}>{d}</span>
          
          {isHoliday && (
            <div className="w-full bg-amber-500 text-white text-[11px] font-bold text-center py-1.5 rounded shadow-sm mt-1">
              휴강
            </div>
          )}

          {!isHoliday && isSelected && !record && (
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
            <p className="text-sm text-gray-500 mb-4 flex items-center">
              <CheckCircle size={16} className="mr-1 text-green-500" /> 등원 시 카드 터치 (가나다순 정렬 완료)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {students.map(student => {
                const isAttendedToday = attendance.some(a => a.studentId === student.id && a.date === todayStr && a.status !== 'absent');
                const isAbsentToday = attendance.some(a => a.studentId === student.id && a.date === todayStr && a.status === 'absent');
                const isTodayHoliday = holidays.some(h => h.date === todayStr);

                return (
                  <button
                    key={student.id}
                    onClick={() => handleTapAttendance(student)}
                    disabled={isTodayHoliday}
                    className={`border-2 shadow-sm rounded-xl p-5 flex flex-col items-center justify-center transition-all duration-150
                      ${isTodayHoliday ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 
                        isAbsentToday ? 'bg-rose-50 border-rose-300 text-rose-700' :
                        isAttendedToday ? 'bg-green-50 border-green-400 text-green-800' : 
                        'bg-white border-transparent active:border-blue-500 text-gray-800'}`}
                  >
                    <span className="text-xl font-bold mb-1">{student.name}</span>
                    <span className="text-xs flex items-center opacity-80">
                      <Clock size={12} className="mr-1" /> 
                      {isTodayHoliday ? '공식 휴강일' : isAbsentToday ? '오늘 결석' : `기준 ${student.classTime}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* [탭 2] 달력 조회 */}
        {activeTab === 'calendar' && (
          <div className="p-4">
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-col space-y-3">
              <select 
                className="w-full p-2 border border-gray-200 rounded-lg text-lg font-bold text-gray-800 focus:outline-none bg-gray-50"
                value={selectedStudent}
                onChange={(e) => { setSelectedStudent(e.target.value); setSelectedDateForAbsence(''); }}
              >
                <option value="" disabled>학생을 선택하세요</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} 원생 출결 리포트</option>
                ))}
              </select>
              
              <button 
                onClick={handleRegisterHoliday}
                className="w-full bg-amber-500 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm active:bg-amber-600 transition-colors flex items-center justify-center space-x-1"
              >
                <AlertTriangle size={16} />
                <span>{format(currentDate, 'M월')} 전체 공통 휴강 등록/취소</span>
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
              <div className="bg-blue-600 text-white text-center py-3 font-bold text-lg flex justify-between px-4 items-center">
                <button onClick={() => { setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1))); setSelectedDateForAbsence(''); }} className="px-2 font-bold">&lt;</button>
                <span>{format(currentDate, 'yyyy년 MM월')}</span>
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
            <div className="text-[11px] text-gray-400 mt-3 bg-white p-3 rounded-lg shadow-sm space-y-1 border border-gray-100">
              <p className="font-semibold text-gray-500">💡 달력 활용 가이드</p>
              <p>• **결석 처리:** 빈 날짜 터치(선택됨) ➔ 한 번 더 터치(결석 등록) ➔ 한 번 더 터치(복구)</p>
              <p>• **시간 수정:** 기록된 출석 시각을 터치하면 분 단위 지각 재계산 및 수정 가능</p>
            </div>
          </div>
        )}

        {/* [탭 3] 원생 관리 */}
        {activeTab === 'settings' && (
          <div className="p-5">
            <div className="bg-white p-5 rounded-xl shadow-sm mb-6">
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
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg text-sm shadow-sm active:bg-blue-700">원생 추가 완료</button>
              </form>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">재원생 명단 관리 ({students.length}명)</h3>
              <p className="text-xs text-gray-400 mb-3">* 학생 이름을 터치하면 정규 등원 기준 시각을 변경할 수 있습니다.</p>
              <ul className="divide-y divide-gray-100">
                {students.map(student => (
                  <li key={student.id} className="py-3 flex justify-between items-center">
                    {/* 🔥 이름 및 등원시간 영역을 클릭하면 수정이 작동하도록 이벤트를 연결했습니다. */}
                    <div 
                      onClick={() => handleEditStudentClassTime(student)}
                      className="cursor-pointer flex-1 py-1 hover:bg-gray-50 rounded transition-colors active:bg-gray-100"
                    >
                      <span className="font-bold text-gray-800">{student.name}</span>
                      <span className="text-xs text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded ml-2">
                        기준: {student.classTime} ✏️
                      </span>
                    </div>
                    <button 
                      onClick={() => handleDeleteStudent(student.id)}
                      className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-md font-semibold active:bg-red-100"
                    >퇴원 조치</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>

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
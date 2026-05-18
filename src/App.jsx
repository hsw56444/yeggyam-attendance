import React, { useState, useEffect } from 'react';
import { Users, Calendar as CalendarIcon, Settings, CheckCircle, Clock } from 'lucide-react';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
// 🔥 updateDoc 추가됨
import { db } from './firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

export default function App() {
  const [activeTab, setActiveTab] = useState('input');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedStudent, setSelectedStudent] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newClassTime, setNewClassTime] = useState('15:00');

  // 1. Firebase Firestore 실시간 학생 목록 로드 및 가나다순 정렬
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // 🔥 기능 3: 학생 이름 가나다(한국어) 순으로 자동 정렬
      studentList.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
      setStudents(studentList);
    });
    return () => unsubscribe();
  }, []);

  // 2. Firebase Firestore 실시간 출결 기록 로드
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      const attendanceList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAttendance(attendanceList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (students.length > 0 && !selectedStudent) {
      setSelectedStudent(students[0].id);
    }
  }, [students, selectedStudent]);

  // 지각 계산 함수
  const calculateLateMinutes = (classTime, actualTime) => {
    const [classH, classM] = classTime.split(':').map(Number);
    const [actualH, actualM] = actualTime.split(':').map(Number);
    const classTotal = classH * 60 + classM;
    const actualTotal = actualH * 60 + actualM;
    return actualTotal > classTotal ? actualTotal - classTotal : 0;
  };

  // 🔥 기능 1: 출결 탭하기 (토글 방식: 등록 <-> 취소)
  const handleTapAttendance = async (student) => {
    const now = new Date();
    const dateStr = format(now, 'yyyy-MM-dd');
    const timeStr = format(now, 'HH:mm');
    
    // 오늘 이미 출석했는지 확인
    const alreadyAttended = attendance.find(
      (a) => a.studentId === student.id && a.date === dateStr
    );

    if (alreadyAttended) {
      // 이미 출석한 상태에서 탭하면 -> 출석 취소(기록 삭제) 묻기
      if (window.confirm(`${student.name} 학생의 오늘 출결 기록을 취소(삭제)하시겠습니까?`)) {
        try {
          await deleteDoc(doc(db, 'attendance', alreadyAttended.id));
        } catch (error) {
          alert('출결 취소 실패: ' + error.message);
        }
      }
      return;
    }

    // 출석 기록이 없다면 -> 정상 등록
    const lateMinutes = calculateLateMinutes(student.classTime, timeStr);
    try {
      await addDoc(collection(db, 'attendance'), {
        studentId: student.id,
        date: dateStr,
        time: timeStr,
        lateMinutes: Number(lateMinutes)
      });
    } catch (error) {
      alert('출결 등록 실패: ' + error.message);
    }
  };

  // 🔥 기능 2: 달력에서 시간 눌러서 수정하기
  const handleEditTime = async (record) => {
    const newTime = window.prompt('수정할 등원 시각을 입력하세요 (예: 15:30)', record.time);
    
    if (newTime === null) return; // 취소 버튼 누름
    
    // 시간 입력 형식 검증 (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(newTime)) {
      alert('시간 형식이 올바르지 않습니다. 반드시 15:30 형태로 입력해 주세요.');
      return;
    }

    // 기준 시간을 알아내기 위해 학생 정보 찾기
    const student = students.find(s => s.id === record.studentId);
    if (!student) return;

    // 변경된 시간을 바탕으로 지각 시간 재계산
    const newLateMinutes = calculateLateMinutes(student.classTime, newTime);

    try {
      // 클라우드 데이터베이스 시간 업데이트
      await updateDoc(doc(db, 'attendance', record.id), {
        time: newTime,
        lateMinutes: Number(newLateMinutes)
      });
      alert('시간이 성공적으로 수정되었습니다.');
    } catch (error) {
      alert('시간 수정 실패: ' + error.message);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName) return;
    try {
      await addDoc(collection(db, 'students'), { name: newStudentName, classTime: newClassTime });
      setNewStudentName('');
    } catch (error) {
      alert('학생 등록 실패: ' + error.message);
    }
  };

  const handleDeleteStudent = async (id) => {
    if (window.confirm('학생 정보와 해당 학생의 모든 출결 기록이 영구 삭제됩니다. 계속하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'students', id));
        const relatedRecords = attendance.filter(a => a.studentId === id);
        for (const record of relatedRecords) {
          await deleteDoc(doc(db, 'attendance', record.id));
        }
        if (selectedStudent === id) setSelectedStudent('');
      } catch (error) {
        alert('삭제 실패: ' + error.message);
      }
    }
  };

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
      
      days.push(
        <div key={d} className="h-20 border border-gray-100 p-1 flex flex-col items-center justify-start bg-white">
          <span className="text-xs font-medium text-gray-600 mb-1">{d}</span>
          {record && (
            // 🔥 시간 부분을 누르면 handleEditTime 함수가 실행되도록 수정 (cursor-pointer 추가)
            <div 
              onClick={() => handleEditTime(record)}
              className={`cursor-pointer w-full flex flex-col items-center justify-center rounded py-1 transition-colors active:bg-gray-200 ${record.lateMinutes > 0 ? 'bg-red-50' : 'bg-green-50'}`}
            >
              <span className={`text-sm font-bold ${record.lateMinutes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {record.time}
              </span>
              {record.lateMinutes > 0 && (
                <span className="text-[10px] text-red-500 font-semibold">+{record.lateMinutes}분 지각</span>
              )}
            </div>
          )}
        </div>
      );
    }
    return days;
  };

  if (loading) {
    return (
      <div className="w-full h-screen max-w-md mx-auto flex items-center justify-center bg-gray-50 text-gray-500 font-medium">
        클라우드 데이터 연결 중...
      </div>
    );
  }

  // 오늘 날짜 문자열 (출석 여부 시각 효과용)
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
        
        {activeTab === 'input' && (
          <div className="p-5">
            <p className="text-sm text-gray-500 mb-4 flex items-center">
              <CheckCircle size={16} className="mr-1 text-green-500" /> 탭하여 출석 / 한 번 더 탭하여 취소
            </p>
            <div className="grid grid-cols-2 gap-3">
              {students.map(student => {
                // 🔥 오늘 해당 학생의 출결 기록이 있는지 확인
                const isAttendedToday = attendance.some(a => a.studentId === student.id && a.date === todayStr);
                
                return (
                  <button
                    key={student.id}
                    onClick={() => handleTapAttendance(student)}
                    // 🔥 출석했으면 초록색 배경으로 변경되도록 디자인 추가
                    className={`border-2 shadow-sm rounded-xl p-5 flex flex-col items-center justify-center transition-all duration-150
                      ${isAttendedToday 
                        ? 'bg-green-50 border-green-400 text-green-800' 
                        : 'bg-white border-transparent active:border-blue-500 active:bg-blue-50 text-gray-800'
                      }`}
                  >
                    <span className="text-xl font-bold mb-1">{student.name}</span>
                    <span className={`text-xs flex items-center ${isAttendedToday ? 'text-green-600' : 'text-gray-400'}`}>
                      <Clock size={12} className="mr-1" /> 기준 {student.classTime}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="p-4">
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <select 
                className="w-full p-2 border border-gray-200 rounded-lg text-lg font-bold text-gray-800 focus:outline-none"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
              >
                <option value="" disabled>학생을 선택하세요</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} 학생 출결 리포트</option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
              <div className="bg-blue-600 text-white text-center py-3 font-bold text-lg flex justify-between px-4 items-center">
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="px-2 font-bold">&lt;</button>
                <span>{format(currentDate, 'yyyy년 MM월')}</span>
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="px-2 font-bold">&gt;</button>
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
            <p className="text-xs text-center text-gray-400 mt-3">* 달력 안의 시간을 터치하면 시간을 수정할 수 있습니다.</p>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-5">
            <div className="bg-white p-5 rounded-xl shadow-sm mb-6">
              <h3 className="font-bold text-gray-800 mb-4">원생 등록</h3>
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
              <ul className="divide-y divide-gray-100">
                {students.map(student => (
                  <li key={student.id} className="py-3 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-gray-800">{student.name}</span>
                      <span className="text-xs text-gray-400 ml-2">수업 등원선: {student.classTime}</span>
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
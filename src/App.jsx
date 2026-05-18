import React, { useState, useEffect } from 'react';
import { Users, Calendar as CalendarIcon, Settings, CheckCircle, Clock } from 'lucide-react';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
// Firebase DB 불러오기
import { db } from './firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';

export default function App() {
  const [activeTab, setActiveTab] = useState('input');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // 클라우드 상태 관리
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedStudent, setSelectedStudent] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newClassTime, setNewClassTime] = useState('15:00');

  // 1. Firebase Firestore 실시간 학생 목록 로드
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
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

  // 학생 목록이 로드되면 첫 번째 학생 자동으로 선택 설정
  useEffect(() => {
    if (students.length > 0 && !selectedStudent) {
      setSelectedStudent(students[0].id);
    }
  }, [students, selectedStudent]);

  // 지각 계산 함수 (분 단위)
  const calculateLateMinutes = (classTime, actualTime) => {
    const [classH, classM] = classTime.split(':').map(Number);
    const [actualH, actualM] = actualTime.split(':').map(Number);
    const classTotal = classH * 60 + classM;
    const actualTotal = actualH * 60 + actualM;
    return actualTotal > classTotal ? actualTotal - classTotal : 0;
  };

  // 출결 입력 (학생 카드 탭 핸들러)
  const handleTapAttendance = async (student) => {
    const now = new Date();
    const dateStr = format(now, 'yyyy-MM-dd');
    const timeStr = format(now, 'HH:mm');
    
    // 중복 출석 체크
    const alreadyAttended = attendance.find(
      (a) => a.studentId === student.id && a.date === dateStr
    );

    if (alreadyAttended) {
      alert(`${student.name} 학생은 오늘 이미 출결이 등록되었습니다.`);
      return;
    }

    const lateMinutes = calculateLateMinutes(student.classTime, timeStr);
    
    try {
      // Firebase 클라우드에 출결 저장
      await addDoc(collection(db, 'attendance'), {
        studentId: student.id,
        date: dateStr,
        time: timeStr,
        lateMinutes: Number(lateMinutes)
      });
      alert(`${student.name} 등원 완료 (${timeStr})`);
    } catch (error) {
      alert('출결 등록 실패: ' + error.message);
    }
  };

  // 학생 추가
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName) return;
    
    try {
      // Firebase 클라우드에 학생 추가
      await addDoc(collection(db, 'students'), {
        name: newStudentName,
        classTime: newClassTime
      });
      setNewStudentName('');
    } catch (error) {
      alert('학생 등록 실패: ' + error.message);
    }
  };

  // 학생 및 관련 출결 기록 삭제
  const handleDeleteStudent = async (id) => {
    if (window.confirm('학생 정보와 해당 학생의 모든 출결 기록이 영구 삭제됩니다. 계속하시겠습니까?')) {
      try {
        // 학생 문서 삭제
        await deleteDoc(doc(db, 'students', id));
        
        // 해당 학생의 출결 데이터도 클라우드에서 일괄 삭제
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

  // 달력 렌더링 로직
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
            <div className={`w-full flex flex-col items-center justify-center rounded py-1 ${record.lateMinutes > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
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

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-gray-50 flex flex-col shadow-xl relative overflow-hidden font-sans">
      
      {/* 상단 헤더 - 요청하신 타이틀로 반영 완료 */}
      <header className="bg-white px-5 py-4 shadow-sm z-10 flex justify-between items-center">
        <h1 className="text-base font-bold text-gray-800 tracking-tight">오늘학원(이예지) 실시간 출결시스템</h1>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
          {format(new Date(), 'MM.dd(E)')}
        </span>
      </header>

      {/* 메인 뷰포트 */}
      <main className="flex-1 overflow-y-auto pb-20">
        
        {/* [탭 1] 출결 입력 */}
        {activeTab === 'input' && (
          <div className="p-5">
            <p className="text-sm text-gray-500 mb-4 flex items-center">
              <CheckCircle size={16} className="mr-1 text-green-500" /> 등원한 학생 카드를 누르면 즉시 기록됩니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {students.map(student => (
                <button
                  key={student.id}
                  onClick={() => handleTapAttendance(student)}
                  className="bg-white border-2 border-transparent active:border-blue-500 active:bg-blue-50 shadow-sm rounded-xl p-5 flex flex-col items-center justify-center transition-all duration-150"
                >
                  <span className="text-xl font-bold text-gray-800 mb-1">{student.name}</span>
                  <span className="text-xs text-gray-400 flex items-center">
                    <Clock size={12} className="mr-1" /> 기준 {student.classTime}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* [탭 2] 달력 조회 */}
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
            <p className="text-xs text-center text-gray-400 mt-3">* 캡처 후 크롭하여 학부모님께 안심 카톡으로 보내기 좋습니다.</p>
          </div>
        )}

        {/* [탭 3] 원생 관리 */}
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

      {/* 하단 네비게이션 고정바 */}
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